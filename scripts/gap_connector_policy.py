"""Check synthetic pedestrian connectors against vehicle road geometries.

The official crossing polygons can support crossing a vehicle way, but do not
authorize following a vehicle centreline along its length.
"""

from shapely import union_all


def overlaps_road_centerline(line, roads, road_tree):
    """Return true when a nontrivial piece follows a mapped vehicle way."""
    return any(line.intersection(roads[int(index)]).length > 1e-6
               for index in road_tree.query(line, predicate='intersects'))


def connector_roads_allowed(line, roads, road_tree, crossings, crossing_tree):
    """Permit only road intersections covered by a crossing, never overlap.

    All geometries must use the same projected metric coordinate system. A
    sub-micrometre epsilon tolerates numeric noise without treating a real
    vehicle-centreline segment as a crossing.
    """
    road_hits = road_tree.query(line, predicate='intersects')
    if not len(road_hits):
        return True
    if overlaps_road_centerline(line, roads, road_tree):
        return False
    cross_hits = crossing_tree.query(line, predicate='intersects')
    covered = union_all([crossings[int(i)] for i in cross_hits])
    for index in road_hits:
        intersection = line.intersection(roads[int(index)])
        if not intersection.difference(covered).is_empty:
            return False
    return True
