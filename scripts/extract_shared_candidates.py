"""Extract attributed shared-street candidates; does not authorize routing."""
import json
import os
from pathlib import Path
import osmium

ROOT = Path(__file__).resolve().parent.parent
INPUT = ROOT / 'data/raw/taiwan.osm.pbf'
OUTPUT = ROOT / 'data/processed/shared-road-candidates.json'
FIELDS = ('name', 'name:zh', 'highway', 'foot', 'access', 'wheelchair', 'width', 'incline',
          'maxspeed', 'surface', 'sidewalk', 'layer', 'level', 'bridge', 'tunnel')

class Extract(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.ways = []

    def way(self, way):
        tags = dict(way.tags)
        if tags.get('highway') != 'living_street': return
        if tags.get('access') in ('private', 'no') or tags.get('foot') in ('private', 'no') or tags.get('wheelchair') == 'no': return
        if tags.get('bridge') not in (None, 'no') or tags.get('tunnel') not in (None, 'no') or tags.get('layer') not in (None, '0') or tags.get('level') not in (None, '0'): return
        nodes = [{'id': n.ref, 'lat': n.location.lat, 'lon': n.location.lon} for n in way.nodes if n.location.valid()]
        # Require every original node and keep only candidates fully in the project extent.
        if len(nodes) != len(way.nodes) or len(nodes) < 2: return
        if not all(24.94 < n['lat'] < 25.24 and 121.42 < n['lon'] < 121.69 for n in nodes): return
        self.ways.append({'osmId': way.id, 'nodes': nodes, 'tags': {k: tags[k] for k in FIELDS if k in tags},
                          'status': 'candidate-unverified'})

if __name__ == '__main__':
    extractor = Extract()
    os.chdir(ROOT)
    extractor.apply_file('data/raw/taiwan.osm.pbf', locations=True)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps({'source': 'OSM Taiwan PBF', 'routesAuthorized': False,
        'extent': 'project bounding rectangle, not administrative boundary', 'ways': extractor.ways},
        ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print(json.dumps({'candidates': len(extractor.ways), 'output': str(OUTPUT)}, ensure_ascii=False))
