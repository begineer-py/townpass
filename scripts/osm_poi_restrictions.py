"""Shared OSM POI restriction extraction and identity verification helpers."""

import re

BASE_KEYS = frozenset({'access', 'foot', 'wheelchair', 'barrier', 'entrance', 'door', 'kerb', 'oneway:foot'})
PREFIXES = ('access:', 'foot:', 'wheelchair:', 'barrier:', 'entrance:', 'door:', 'kerb:')
OSM_POI_ID = re.compile(r'^osm-([nw])(\d+)$')


def restriction_tags(tags):
    """Copy only restriction tags; absent tags never imply permission."""
    return {key: value for key, value in tags.items()
            if key in BASE_KEYS or key.startswith(PREFIXES)}


def osm_identity(value):
    match = OSM_POI_ID.fullmatch(str(value or ''))
    return (match.group(1), int(match.group(2))) if match else None


def original_way_point(nodes):
    """Reproduce build_graph.py's bounded mean, including a closing node."""
    local = [(round(lat, 7), round(lon, 7)) for lat, lon in nodes
             if 24.94 < lat < 25.24 and 121.42 < lon < 121.69]
    if not local:
        return None
    return (round(sum(p[0] for p in local) / len(local), 7),
            round(sum(p[1] for p in local) / len(local), 7))


def same_point(place, point):
    return (point is not None and isinstance(place.get('lat'), (int, float))
            and isinstance(place.get('lon'), (int, float))
            and abs(place['lat'] - point[0]) <= 1e-7
            and abs(place['lon'] - point[1]) <= 1e-7)


def merge_matched(place, tags):
    """Replace stale restriction tags only after source and geometry match."""
    for key in list(place):
        if key in BASE_KEYS or key.startswith(PREFIXES):
            del place[key]
    place.update(restriction_tags(tags))
    # Means identity and source geometry matched, not access certification.
    place['osmRestrictionsMatched'] = True
