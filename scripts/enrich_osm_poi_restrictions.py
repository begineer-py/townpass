"""Refresh OSM POI access tags from the original PBF, after identity checks.

Nodes match by OSM ID and position. Ways must also reproduce the bounded
node-average used by build_graph.py. A missing tag remains unknown; matching
source data does not certify accessibility. Dry run unless --apply is passed.
"""
import argparse
import collections
import gzip
import hashlib
import json
import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path

import osmium
from osm_poi_restrictions import merge_matched, original_way_point, osm_identity, same_point

ROOT = Path(__file__).resolve().parent.parent
PLACES = ROOT / 'public/data/places.json.gz'
REPORT = ROOT / 'reports/osm-poi-restrictions-audit.json'
INPUT = Path(os.environ.get('TOWNPASS_OSM_PBF', ROOT / 'data/raw/taiwan.osm.pbf'))


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


def file_sha256(path):
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()


class Scan(osmium.SimpleHandler):
    def __init__(self, places):
        super().__init__()
        self.index = {'n': {}, 'w': {}}
        self.duplicates = set()
        self.matches = collections.Counter()
        self.mismatches = []
        self.seen = set()
        for p in places:
            identity = osm_identity(p.get('id'))
            if not identity:
                continue
            p['osmRestrictionsMatched'] = False
            if p.get('sourceId') != 'osm':
                continue
            kind, number = identity
            if number in self.index[kind]:
                self.duplicates.add(identity)
            else:
                self.index[kind][number] = p

    def accept(self, kind, number, point, tags):
        identity = (kind, number)
        place = self.index[kind].get(number)
        if place is None:
            return
        self.seen.add(identity)
        if identity in self.duplicates or not same_point(place, point):
            self.mismatches.append(place['id'])
            return
        merge_matched(place, tags)
        self.matches[kind] += 1

    def node(self, n):
        if n.id in self.index['n']:
            point = (n.location.lat, n.location.lon) if n.location.valid() else None
            self.accept('n', n.id, point, dict(n.tags))

    def way(self, w):
        if w.id not in self.index['w']:
            return
        # Unresolved node locations cannot establish the original way centroid.
        nodes = [(n.location.lat, n.location.lon) for n in w.nodes if n.location.valid()]
        point = original_way_point(nodes) if len(nodes) == len(w.nodes) else None
        self.accept('w', w.id, point, dict(w.tags))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    original = PLACES.read_bytes()
    places = json.loads(gzip.decompress(original))
    if not isinstance(places, list):
        raise ValueError('Invalid places data')
    source_path = INPUT.resolve()
    source_hash = file_sha256(source_path)
    scan = Scan(places)
    print(f'Checking {len(scan.index["n"])} node and {len(scan.index["w"])} way POIs against OSM', flush=True)
    # libosmium on Windows may not open non-ASCII parent paths. Change to the
    # directory with Python's Unicode-aware API and pass its basename instead.
    os.chdir(source_path.parent)
    scan.apply_file(source_path.name, locations=True)
    expected = {(kind, number) for kind in ('n', 'w') for number in scan.index[kind]}
    missing = expected - scan.seen
    matched = [p for p in places if p.get('osmRestrictionsMatched') is True]
    counts = {f'{key}={value}': sum(p.get(key) == value for p in matched)
              for key, value in [('access', 'no'), ('access', 'private'), ('foot', 'no'), ('foot', 'private'), ('wheelchair', 'no')]}
    report = {'checkedAt': datetime.now(timezone.utc).isoformat(), 'source': 'OSM PBF',
              'sourceSha256': source_hash, 'placesSha256Before': hashlib.sha256(original).hexdigest(),
              'method': 'exact node/way ID and original extraction coordinate check; matching is not an accessibility certification',
              'nodeRecords': len(scan.index['n']), 'wayRecords': len(scan.index['w']),
              'matchedNodes': scan.matches['n'], 'matchedWays': scan.matches['w'],
              'mismatchedOrDuplicate': len(scan.mismatches), 'missingFromSource': len(missing),
              'duplicateIdentities': len(scan.duplicates),
              'mismatchExampleIds': scan.mismatches[:20],
              'missingExampleIds': [f'osm-{kind}{number}' for kind, number in sorted(missing)[:20]],
              'restrictionCounts': counts,
              'conditionalCount': sum(any(k.endswith(':conditional') for k in p if k.startswith(('access:', 'foot:', 'wheelchair:'))) for p in matched),
              'floorContextCounts': {key: sum(p.get(key) is not None for p in matched)
                                     for key in ('level', 'floor', 'addr:floor', 'addr:level', 'level:ref', 'indoor', 'location', 'layer', 'description', 'building', 'repeat_on')},
              'applied': args.apply}
    if args.apply:
        output = gzip.compress(json.dumps(places, ensure_ascii=False, separators=(',', ':')).encode(), 6, mtime=0)
        if file_sha256(source_path) != source_hash:
            raise RuntimeError('OSM source changed during scan; no places were written')
        if hashlib.sha256(PLACES.read_bytes()).digest() != hashlib.sha256(original).digest():
            raise RuntimeError('Places changed during scan; no places were written')
        report['placesSha256After'] = hashlib.sha256(output).hexdigest()
        atomic_write(PLACES, output)
        atomic_write(REPORT, (json.dumps(report, ensure_ascii=False, indent=2) + '\n').encode())
    print(json.dumps(report, ensure_ascii=True), flush=True)


if __name__ == '__main__':
    main()
