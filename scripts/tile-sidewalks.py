"""Split the Apple UI branch's preprocessed official sidewalk lines into 0.01° tiles.

Usage: python scripts/tile-sidewalks.py path/to/sidewalks.json.gz
The current tiles come from git blob d1225ca045f21394751cf9e94f0bf045b0f9f382
(public/data/sidewalks.json.gz at commit 61577ad2698a9c2145c83859a6e11ca5aa278235).
To recover it without altering the checkout:
  python -c "import pathlib,subprocess; pathlib.Path('sidewalks-source.gz').write_bytes(subprocess.check_output(['git','cat-file','blob','d1225ca045f21394751cf9e94f0bf045b0f9f382']))"
Each line is copied to every intersecting tile so lines crossing tile boundaries
remain visible. Routing does not use these display-only files.
"""
import gzip
import hashlib
import json
import math
import sys
from collections import defaultdict
from pathlib import Path

source = Path(sys.argv[1])
output = Path(__file__).resolve().parent.parent / 'public/data/sidewalk-tiles'
source_bytes = source.read_bytes()
payload = json.loads(gzip.decompress(source_bytes))
scale = payload['scale']
cell = scale // 100
tiles = defaultdict(list)
for index, row in enumerate(payload['lines']):
    south, west, north, east = row[:4]
    for lat in range(math.floor(south / cell), math.floor(north / cell) + 1):
        for lon in range(math.floor(west / cell), math.floor(east / cell) + 1):
            tiles[f'{lat}-{lon}'].append([index, *row[4:]])
output.mkdir(parents=True, exist_ok=True)
for key, lines in tiles.items():
    body = json.dumps({'scale': scale, 'lines': lines}, separators=(',', ':')).encode()
    (output / f'{key}.json.gz').write_bytes(gzip.compress(body, compresslevel=9, mtime=0))
manifest = {'source': payload['source'], 'fetchedAt': payload['fetchedAt'],
            'sourceSha256': hashlib.sha256(source_bytes).hexdigest(),
            'sourceGitBlob': hashlib.sha1(f'blob {len(source_bytes)}\0'.encode() + source_bytes).hexdigest(),
            'cellDegrees': .01, 'tiles': sorted(tiles)}
(output / 'index.json').write_text(json.dumps(manifest, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
print(f'{len(payload["lines"])} lines, {len(tiles)} tiles')
