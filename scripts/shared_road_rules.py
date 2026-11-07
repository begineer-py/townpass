"""Candidate policy only; missing OSM tags do not prove real-world access."""

SHARED_TYPES = frozenset({'living_street', 'residential', 'unclassified', 'service'})
ALLOWED_ACCESS = frozenset({'yes', 'permissive', 'designated'})

def shared_candidate(tags):
    if tags.get('highway') not in SHARED_TYPES or tags.get('area') == 'yes': return False
    if tags.get('barrier') not in (None,'no','kerb') or tags.get('kerb') == 'raised': return False
    if tags.get('kerb:height') is not None:
        try:
            if float(tags['kerb:height'].replace(' m','')) > .03: return False
        except ValueError: return False
    for key in ('access', 'foot'):
        if tags.get(key) is not None and tags[key] not in ALLOWED_ACCESS: return False
        if tags.get(key + ':conditional') is not None: return False
    # The graph is undirected; do not silently ignore directional pedestrian rules.
    if any(tags.get(key) is not None for key in ('oneway:foot', 'foot:forward', 'foot:backward', 'foot:forward:conditional', 'foot:backward:conditional')): return False
    if tags.get('wheelchair') == 'no' or tags.get('wheelchair:conditional') is not None: return False
    if tags.get('bridge') not in (None, 'no') or tags.get('tunnel') not in (None, 'no'): return False
    if tags.get('layer') not in (None, '0') or tags.get('level') not in (None, '0'): return False
    return True
