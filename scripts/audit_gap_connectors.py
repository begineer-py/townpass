"""Audit existing synthetic connectors; apply only with --apply.

Uses the vehicle geometry already packaged in the graph; no OSM download or
PBF scan is needed. Only artificial connector edges can be removed.
"""
import argparse
import gzip
import hashlib
import json
import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path

from pyproj import Transformer
from shapely.geometry import LineString
from shapely.strtree import STRtree

from gap_connector_policy import overlaps_road_centerline

ROOT = Path(__file__).resolve().parent.parent
GRAPH = ROOT / 'public/data/graph.json.gz'
REPORT = ROOT / 'reports/gap-connector-road-overlap-audit.json'


def atomic_write(path, content):
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix=path.name + '.', suffix='.tmp', dir=path.parent)
    try:
        with os.fdopen(fd, 'wb') as stream:
            stream.write(content)
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def audit(graph):
    project = Transformer.from_crs(4326, 3826, always_xy=True)
    connectors = []
    for index, edge in enumerate(graph['edges']):
        way = graph['ways'][edge[3]]
        if not way.get('isConnector'):
            continue
        points = [graph['nodes'][edge[0]][:2], *(edge[4] or []), graph['nodes'][edge[1]][:2]]
        lines = [LineString([project.transform(a[1], a[0]), project.transform(b[1], b[0])])
                 for a, b in zip(points, points[1:])]
        connectors.append((index, edge, points, lines))

    # A segment whose bounding box intersects none of these boxes cannot
    # overlap a connector. The tiny tolerance covers floating-point rounding.
    boxes = [(min(p[0] for p in points), min(p[1] for p in points),
              max(p[0] for p in points), max(p[1] for p in points))
             for _, _, points, _ in connectors]
    eps = 1e-7
    roads = []
    for line in graph['roadGeometries']:
        for a, b in zip(line, line[1:]):
            if not any(max(a[1], b[1]) + eps >= y0 and min(a[1], b[1]) - eps <= y1
                       and max(a[0], b[0]) + eps >= x0 and min(a[0], b[0]) - eps <= x1
                       for y0, x0, y1, x1 in boxes):
                continue
            roads.append(LineString([project.transform(*a), project.transform(*b)]))
    tree = STRtree(roads)
    rejected = []
    for index, edge, points, lines in connectors:
        overlaps = [segment.intersection(roads[int(hit)]).length
                    for segment in lines for hit in tree.query(segment, predicate='intersects')]
        if not any(overlaps_road_centerline(segment, roads, tree) for segment in lines):
            continue
        rejected.append({'edgeIndex': index, 'nodes': [graph['nodes'][edge[0]][3], graph['nodes'][edge[1]][3]],
                         'coordinates': points, 'distanceMetres': edge[2],
                         'maxRoadOverlapMetres': round(max(overlaps, default=0), 4)})
    return {'checkedAt': datetime.now(timezone.utc).isoformat(), 'source': 'packaged graph roadGeometries',
            'method': 'projected geometry intersection, reject centreline overlap longer than 1e-6 m; artificial connectors only',
            'connectorsExamined': len(connectors), 'rejectedCount': len(rejected), 'rejected': rejected}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true', help='remove rejected connectors and write an audit report')
    args = parser.parse_args()
    original = GRAPH.read_bytes()
    graph = json.loads(gzip.decompress(original))
    report = audit(graph)
    report['applied'] = args.apply
    report['graphSha256Before'] = hashlib.sha256(original).hexdigest()
    report['edgesBefore'] = len(graph['edges'])
    report['edgesAfter'] = len(graph['edges']) - report['rejectedCount'] if args.apply else None
    report['connectorsRetained'] = report['connectorsExamined'] - report['rejectedCount'] if args.apply else None
    if args.apply:
        rejected = {row['edgeIndex'] for row in report['rejected']}
        graph['edges'] = [edge for i, edge in enumerate(graph['edges']) if i not in rejected]
        if isinstance(graph.get('gapConnectors'), dict):
            graph['gapConnectors']['count'] = sum(bool(graph['ways'][e[3]].get('isConnector')) for e in graph['edges'])
            graph['gapConnectors']['roadOverlapAuditAt'] = report['checkedAt']
        output = gzip.compress(json.dumps(graph, ensure_ascii=False, separators=(',', ':')).encode(), 6, mtime=0)
        report['graphSha256After'] = hashlib.sha256(output).hexdigest()
        if hashlib.sha256(GRAPH.read_bytes()).digest() != hashlib.sha256(original).digest():
            raise RuntimeError('Graph changed during audit; no graph was written')
        atomic_write(GRAPH, output)
        atomic_write(REPORT, (json.dumps(report, ensure_ascii=False, indent=2) + '\n').encode())
    print(json.dumps(report, ensure_ascii=False))


if __name__ == '__main__':
    main()
