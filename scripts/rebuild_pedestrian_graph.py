"""Rebuild pedestrian edges from OSM without walking vehicle centre lines.

Untagged footways that meet a vehicle way are cut there. A mapped crossing, or a
crossing that stays inside an official crossing polygon, remains connected.
Official sidewalk overlap is stored so the router can prefer it; partial overlap
no longer deletes the rest of a footway.
"""
import gzip
import json
import math
from datetime import datetime, timezone
from pathlib import Path

import osmium
from pyproj import Transformer
from shapely.geometry import LineString, shape
from shapely.ops import transform
from shapely.strtree import STRtree

ROOT = Path(__file__).resolve().parent.parent
PED = {"footway", "path", "pedestrian", "corridor"}
project = Transformer.from_crs(4326, 3826, always_xy=True)
unproject = Transformer.from_crs(3826, 4326, always_xy=True)


def metres(a, b):
    return math.hypot((a[0] - b[0]) * 111195, (a[1] - b[1]) * 100700)


def numeric(value):
    try:
        return float(str(value).replace("%", "").replace(" m", "").strip())
    except (TypeError, ValueError):
        return None


def outside_crossings(geom, tree, polygons):
    if geom.is_empty:
        return False
    hits = tree.query(geom)
    if len(hits) == 0:
        return True
    rest = geom
    for index in hits:
        rest = rest.difference(polygons[int(index)])
        if rest.is_empty:
            return False
    return not rest.is_empty


class Extract(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.coords = {}
        self.blocked = set()
        self.ways = []
        self.segments = []

    def node(self, n):
        lat, lon = n.location.lat, n.location.lon
        if not (24.94 < lat < 25.24 and 121.42 < lon < 121.69):
            return
        tags = dict(n.tags)
        kerb = numeric(tags.get("kerb:height"))
        blocked = (
            tags.get("access") in ["private", "no"]
            or tags.get("foot") == "no"
            or tags.get("wheelchair") == "no"
            or (kerb is not None and kerb > 0.03)
            or tags.get("kerb") == "raised"
            or tags.get("barrier") in ["stile", "turnstile", "kissing_gate"]
        )
        self.coords[n.id] = (round(lat, 7), round(lon, 7))
        if blocked:
            self.blocked.add(n.id)

    def way(self, w):
        tags = dict(w.tags)
        highway = tags.get("highway")
        if highway not in PED:
            return
        if (
            tags.get("area") == "yes"
            or tags.get("access") in ["private", "no"]
            or tags.get("foot") in ["no", "private"]
            or tags.get("wheelchair") == "no"
        ):
            return
        if (tags.get("bridge") and tags.get("bridge") != "no") or (
            tags.get("tunnel") and tags.get("tunnel") != "no"
        ):
            return
        if tags.get("layer") not in [None, "0"] or tags.get("level") not in [None, "0"]:
            return
        local = [self.coords[n.ref] for n in w.nodes if n.ref in self.coords]
        if len(local) < 2:
            return
        crossing = tags.get("footway") == "crossing" or bool(tags.get("crossing"))
        name = (
            tags.get("name:zh")
            or tags.get("name")
            or ("行穿線" if crossing else "人行通道")
        )
        index = len(self.ways)
        self.ways.append(
            {
                "name": name,
                "highway": highway,
                "wheelchair": tags.get("wheelchair"),
                "width": numeric(tags.get("width") or tags.get("est_width")),
                "slope": numeric(tags.get("incline")),
                "surface": tags.get("surface"),
                "sidewalk": tags.get("sidewalk"),
                "crossing": crossing,
                "lit": tags.get("lit"),
                "osmId": w.id,
                "layer": tags.get("layer"),
                "level": tags.get("level"),
                "bridge": tags.get("bridge"),
                "tunnel": tags.get("tunnel"),
            }
        )
        ids = [n.ref for n in w.nodes if n.ref in self.coords]
        for a, b in zip(ids, ids[1:]):
            if a == b:
                continue
            self.segments.append((a, b, index))


def projected_polygon(geometry):
    polygon = shape(geometry)
    if not polygon.is_valid:
        polygon = polygon.buffer(0)
    return transform(project.transform, polygon)


def main():
    print("reading current masks", flush=True)
    graph = json.loads(gzip.decompress((ROOT / "public/data/graph.json.gz").read_bytes()))
    areas = [projected_polygon(g) for g in graph["officialAreas"]]
    crossings = [projected_polygon(g) for g in graph["officialCrossingAreas"]]
    area_tree = STRtree(areas)
    cross_tree = STRtree(crossings)
    roads = []
    for line in graph["roadGeometries"]:
        if len(line) < 2:
            continue
        xs, ys = project.transform(*zip(*line))
        roads.append(LineString(zip(xs, ys)))
    road_tree = STRtree(roads)
    print("roads", len(roads), "areas", len(areas), "crossings", len(crossings), flush=True)

    print("reading OSM footways", flush=True)
    extract = Extract()
    extract.apply_file(str(ROOT / "data/raw/taiwan.osm.pbf"))
    print("segments", len(extract.segments), "ways", len(extract.ways), flush=True)

    kept = []
    cut = 0
    for count, (a, b, way_index) in enumerate(extract.segments):
        if a in extract.blocked or b in extract.blocked:
            continue
        lat1, lon1 = extract.coords[a]
        lat2, lon2 = extract.coords[b]
        x1, y1 = project.transform(lon1, lat1)
        x2, y2 = project.transform(lon2, lat2)
        if math.hypot(x2 - x1, y2 - y1) < 0.4:
            continue
        line = LineString([(x1, y1), (x2, y2)])
        way = extract.ways[way_index]
        hits = [int(i) for i in road_tree.query(line, predicate="intersects")]
        pieces = [line]
        if hits and not way["crossing"]:
            # Touching a road at an endpoint is the curb. Only a vehicle way
            # crossing the interior is removed, so neighbouring crossings stay joined.
            crosses = False
            for index in hits:
                intersection = line.intersection(roads[index])
                if intersection.is_empty or not outside_crossings(intersection, cross_tree, crossings):
                    continue
                if intersection.length > 0.5 or intersection.distance(line.boundary) > 0.4:
                    crosses = True
                    break
            if crosses:
                pieces = []
                cut += 1
        for piece in pieces:
            area_hits = area_tree.query(piece, predicate="intersects")
            overlap = 0
            for index in area_hits:
                overlap += piece.intersection(areas[int(index)]).length
            length = piece.length
            coverage = min(1, overlap / length) if length else 0
            cross_hits = cross_tree.query(piece, predicate="intersects")
            cross_overlap = 0
            for index in cross_hits:
                cross_overlap += piece.intersection(crossings[int(index)]).length
            crossing_coverage = min(1, cross_overlap / length) if length else 0
            coordinates = [unproject.transform(x, y) for x, y in piece.coords]
            kept.append(
                (
                    coordinates,
                    way_index,
                    {
                        "schemaVersion": 2,
                        "coverage": round(coverage, 4),
                        "maxUncoveredMetres": 0 if coverage >= 0.9999 else round(length * (1 - coverage), 2),
                        "crossingCoverage": round(crossing_coverage, 4),
                        "roadCrossingVerified": True,
                        "crossingVerified": True,
                    },
                )
            )
        if count and count % 40000 == 0:
            print("checked", count, "kept", len(kept), "cut", cut, flush=True)

    nodes = {}
    blockers = []
    for node_id in extract.blocked:
        if node_id in extract.coords:
            blockers.append(extract.coords[node_id])

    def node_index(lat, lon, blocked=0):
        key = (round(lat, 7), round(lon, 7))
        found = nodes.get(key)
        if found is None:
            index = len(nodes)
            nodes[key] = (index, blocked)
            return index
        return found[0]

    edges = []
    for coordinates, way_index, evidence in kept:
        ids = [node_index(lat, lon) for lon, lat in coordinates]
        start = ids[0]
        length = 0
        previous = coordinates[0]
        for lon, lat in coordinates[1:]:
            length += metres((previous[1], previous[0]), (lat, lon))
            previous = (lon, lat)
        end = ids[-1]
        if start == end or length <= 0:
            continue
        middle = [[round(lat, 7), round(lon, 7)] for lon, lat in coordinates[1:-1]]
        edges.append([start, end, round(length, 1), way_index, middle, evidence])
    for lat, lon in blockers:
        key = (lat, lon)
        if key not in nodes:
            nodes[key] = (len(nodes), 1)
    ordered = sorted(nodes.items(), key=lambda item: item[1][0])
    graph["nodes"] = [[lat, lon, blocked] for (lat, lon), (_, blocked) in ordered]
    graph["edges"] = edges
    graph["ways"] = extract.ways
    graph["generatedAt"] = datetime.now(timezone.utc).isoformat()
    graph["graphTrimmed"] = True
    graph["sourceEdgeCount"] = len(extract.segments)
    graph["officialPathEvidence"]["method"] = (
        "OSM footway/path/pedestrian/corridor; vehicle centre lines excluded; "
        "untagged road crossings cut; mapped crossings and official crossing polygons kept; "
        "official overlap is a preference, not a reason to delete the footway"
    )
    out = ROOT / "public/data/graph.json.gz"
    temporary = out.with_suffix(".json.gz.next")
    temporary.write_bytes(
        gzip.compress(json.dumps(graph, ensure_ascii=False, separators=(",", ":")).encode("utf-8"), 6)
    )
    temporary.replace(out)
    print(
        json.dumps(
            {
                "nodes": len(graph["nodes"]),
                "edges": len(edges),
                "cut": cut,
                "bytes": out.stat().st_size,
            }
        ),
        flush=True,
    )


if __name__ == "__main__":
    main()
