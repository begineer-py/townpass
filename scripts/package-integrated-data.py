"""Package the already integrated project data for offline inspection.

This does not synthesize missing pedestrian connections or certify accessibility.
Live construction must be obtained separately from the service, not this archive.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re
import zipfile

ROOT = Path(__file__).resolve().parent.parent
REQUIRED = ('graph.json.gz', 'facilities.json.gz', 'sources.json.gz',
            'official-paths.json.gz', 'metro.json.gz', 'places.json.gz', 'address-index.json')
SHARD = re.compile(r'^[0-9a-f]{14}$')


def digest(data):
    return hashlib.sha256(data).hexdigest()


def collect(directory):
    for name in REQUIRED:
        if not (directory / name).is_file():
            raise ValueError(f'Missing required dataset: {name}')
    index = json.loads((directory / 'address-index.json').read_text(encoding='utf-8'))
    if not isinstance(index, list):
        raise ValueError('Invalid address index')
    shards = set()
    for item in index:
        fid = item.get('file') if isinstance(item, dict) else None
        if not isinstance(fid, str) or not SHARD.fullmatch(fid):
            raise ValueError('Invalid address shard name')
        name = f'addresses/{fid}.json'
        if not (directory / name).is_file():
            raise ValueError(f'Missing address shard: {name}')
        shards.add(name)
    return sorted((*REQUIRED, *shards))


def build(directory, output):
    names = collect(directory)
    entries = []
    for name in names:
        data = (directory / name).read_bytes()
        entries.append({'path': name, 'size': len(data), 'sha256': digest(data)})
    manifest = {
        'schemaVersion': 1,
        'description': 'Existing TownPass integrated datasets, grouped without changing source geometry or route safety rules.',
        'crs': 'Dataset-specific; use embedded metadata and existing application contracts.',
        'limitations': [
            'A data archive is not a complete or independently certified accessible route network.',
            'Some endpoints, crossings and pedestrian connections remain unknown or disconnected.',
            'Construction data is excluded: query the live service and check freshness.',
            'Consult sources.json.gz and original providers for provenance and licence terms.',
            'Raw city-platform pano-sidewalk_accessiblePassageway.json and pano-missing_v2.json snapshots are not integrated or included; their route semantics and reuse terms require review.',
        ],
        'files': entries,
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_name(output.name + '.tmp')
    with zipfile.ZipFile(temporary, 'w') as archive:
        def put(name, data, compression):
            info = zipfile.ZipInfo(name, (1980, 1, 1, 0, 0, 0))
            info.compress_type = compression
            info.external_attr = 0o644 << 16
            archive.writestr(info, data, compresslevel=9)
        put('manifest.json', json.dumps(manifest, ensure_ascii=False, indent=2).encode('utf-8') + b'\n', zipfile.ZIP_DEFLATED)
        for name in names:
            data = (directory / name).read_bytes()
            expected = next(entry['sha256'] for entry in entries if entry['path'] == name)
            if digest(data) != expected:
                raise ValueError(f'Dataset changed while packaging: {name}')
            put(name, data, zipfile.ZIP_STORED if name.endswith('.gz') else zipfile.ZIP_DEFLATED)
    verify(temporary)
    temporary.replace(output)
    return manifest


def verify(path):
    with zipfile.ZipFile(path) as archive:
        names = archive.namelist()
        if len(names) != len(set(names)) or names.count('manifest.json') != 1:
            raise ValueError('Duplicate or missing archive entry')
        manifest = json.loads(archive.read('manifest.json'))
        if manifest.get('schemaVersion') != 1 or not isinstance(manifest.get('files'), list):
            raise ValueError('Invalid manifest')
        records = manifest['files']
        expected = {r['path'] for r in records}
        if len(expected) != len(records) or expected != set(names) - {'manifest.json'}:
            raise ValueError('Archive entries do not match manifest')
        if not set(REQUIRED) <= expected or 'construction.json.gz' in expected:
            raise ValueError('Archive is incomplete or contains a stale construction snapshot')
        for record in records:
            data = archive.read(record['path'])
            if len(data) != record['size'] or digest(data) != record['sha256']:
                raise ValueError(f'Checksum mismatch: {record["path"]}')
        return manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', type=Path, default=ROOT / 'public/data')
    parser.add_argument('--output', type=Path, default=ROOT / 'data/processed/taipei-integrated-data.zip')
    parser.add_argument('--verify', action='store_true', help='Verify existing output archive without rebuilding')
    args = parser.parse_args()
    manifest = verify(args.output) if args.verify else build(args.input, args.output)
    print(json.dumps({'archive': str(args.output.resolve()), 'files': len(manifest['files']),
                      'sha256': digest(args.output.read_bytes()), 'bytes': args.output.stat().st_size}))


if __name__ == '__main__':
    main()
