"""Build display-only exit coordinates from two Taipei Metro open datasets.

Run `python scripts/build-official-metro-exits.py --fetch` to download current
sources into ignored data/raw, or omit --fetch to rebuild from those snapshots.
The output metadata records the SHA-256 of both exact source files.
This does not modify navigation, accessible routing, or its graph.
"""
import argparse
import csv
import gzip
import hashlib
import json
import re
import unicodedata
import urllib.request
from collections import Counter, defaultdict
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCES = {
    'coordinates': ('official-exit-coordinates.csv', 'https://data.taipei/api/dataset/cfa4778c-62c1-497b-b704-756231de348b/resource/307a7f61-e302-4108-a817-877ccbfca7c1/download', 'cp950'),
    'access': ('official-exit-access.csv', 'https://data.taipei/api/dataset/19a3a425-1b95-4e72-a1c4-9eadaef52fc9/resource/c6582350-0d86-437f-b912-29486f4c00a6/download', 'utf-8-sig'),
}
STATION_URL = 'https://web.metro.taipei/pages2026/WebStation/076/8'

def normalize(value):
    return re.sub(r'\s+', '', unicodedata.normalize('NFKC', value)).replace('臺', '台').upper()

def station_name(name):
    return normalize(name.split('站', 1)[0]) if '站' in name else None

def station_codes(value):
    codes = []
    for code in value.strip("' ").split(','):
        match = re.fullmatch(r'([A-Z]+)(\d{1,2})(A?)', code.strip().upper())
        if not match:
            return ()
        codes.append(f'{match[1]}{int(match[2]):02d}{match[3]}')
    return tuple(codes)

def access_name(row):
    match = re.search(r"'([^']*站[^']*)'", row['ExitName'])
    return match.group(1) if match else ''

def name_matches_exit(name, number):
    if '站' not in name:
        return False
    suffix = normalize(name.split('站', 1)[1]).removeprefix('出口')
    return suffix == ('' if number == '0' else number)

def facility_station_codes(facilities):
    by_station = defaultdict(set)
    for row in facilities:
        if str(row.get('kind')) != '20':
            continue
        match = re.fullmatch(r'(.+)\(((?:BL|BR|R|G|O|Y)\d{1,2}A?)\)', row.get('name', ''))
        if match:
            name = normalize(match[1]).removesuffix('站')
            by_station[name].update(station_codes(match[2]))
    return by_station

class StationTable(HTMLParser):
    def __init__(self):
        super().__init__()
        self.in_table = False
        self.in_cell = False
        self.cells = []
        self.text = []
        self.stations = defaultdict(set)

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'table' and attrs.get('class') == 'timepricetable':
            self.in_table = True
        elif self.in_table and tag == 'tr':
            self.cells = []
        elif self.in_table and tag == 'td':
            self.in_cell, self.text = True, []

    def handle_data(self, data):
        if self.in_cell:
            self.text.append(data)

    def handle_endtag(self, tag):
        if self.in_cell and tag == 'td':
            self.cells.append(''.join(self.text).strip())
            self.in_cell = False
        elif self.in_table and tag == 'tr' and len(self.cells) >= 3:
            for cell in (self.cells[0], self.cells[2]):
                match = re.fullmatch(r'((?:(?:BL|BR|R|G|O|Y)\d{2}A?\s+)+)(.+)', cell)
                if match:
                    self.stations[normalize(match[2]).removesuffix('站')].update(match[1].split())
        elif self.in_table and tag == 'table':
            self.in_table = False

def detail_fields(row):
    if not row:
        return {'elevator': None}
    date = row['UpdateTime'].strip()
    date = f'{date[:4]}-{date[4:6]}-{date[6:]}' if re.fullmatch(r'\d{8}', date) else None
    return {'elevator': True if row['Elevator'] == '1' else None,
            'description': row['LocationDescription'].strip("' ").strip(),
            'elevatorUpdatedAt': date}

def add_station_codes(item, station, station_index):
    codes = sorted(station_index.get(station, ()))
    if codes:
        item['stationCode'], item['stationCodes'] = codes[0], codes

def build(coordinates, access, stations):
    by_exit = defaultdict(list)
    station_index = stations
    for row in access:
        station = station_name(access_name(row))
        number = normalize(row['ExitID'])
        if not station or not number or not name_matches_exit(access_name(row), number):
            raise ValueError(f'invalid access name or exit number: {row}')
        by_exit[(station, number)].append(row)
    counts, output, seen = Counter(), [], set()
    for row in coordinates:
        name = row['出入口名稱'].strip()
        station = station_name(name)
        number = normalize(row['出入口編號'])
        key = (station, number)
        if not station or not number or key in seen or not name_matches_exit(name, number):
            raise ValueError(f'invalid or duplicate coordinate key: {key}')
        seen.add(key)
        lat, lon = float(row['緯度']), float(row['經度'])
        if not (24.5 <= lat <= 25.5 and 121 <= lon <= 122):
            raise ValueError(f'invalid coordinate for {name}')
        hits = by_exit.get(key, [])
        detail = hits[0] if len(hits) == 1 else None
        counts['matched' if detail else ('ambiguous' if hits else 'unmatched')] += 1
        accessible = row['是否為無障礙用'].strip()
        if accessible not in ('是', '否'):
            raise ValueError(f'invalid accessibility field for {name}')
        # These are independent official fields, not equivalents: a ramp can
        # be accessible without an elevator. Never infer one from the other.
        if detail and (accessible == '是') != (detail['Elevator'] == '1'):
            counts['different_access_and_elevator_fields'] += 1
        detail_values = detail_fields(detail)
        if detail_values['elevator']:
            counts['elevator_confirmed'] += 1
        item = {'id': f'official-metro-exit:{station}:{number}', 'kind': 'metro-exit',
                'name': name, 'station': name.split('站', 1)[0] + '站',
                'lat': lat, 'lon': lon, 'exit': '' if number == '0' else number,
                'officialAccessible': accessible == '是', 'sourceId': 'official-metro-exits',
                **detail_values}
        add_station_codes(item, station, station_index)
        output.append(item)
    unlocated = []
    for key, rows in by_exit.items():
        if key in seen:
            continue
        for row in rows:
            name = access_name(row)
            item = {'id': f'official-metro-unlocated:{key[0]}:{key[1]}', 'kind': 'metro-exit-unlocated',
                    'name': name, 'station': name.split('站', 1)[0] + '站',
                    'exit': '' if key[1] == '0' else key[1], 'sourceId': 'official-metro-exits',
                    **detail_fields(row)}
            add_station_codes(item, key[0], station_index)
            unlocated.append(item)
    counts['unlocated_access_rows'] = len(unlocated)
    counts['with_station_codes'] = sum('stationCode' in item for item in output)
    return output, unlocated, dict(counts)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--fetch', action='store_true')
    args = parser.parse_args()
    raw = ROOT / 'data' / 'raw'
    raw.mkdir(parents=True, exist_ok=True)
    inputs, hashes = {}, {}
    for key, (filename, url, encoding) in SOURCES.items():
        path = raw / filename
        if args.fetch:
            with urllib.request.urlopen(url, timeout=30) as response:
                path.write_bytes(response.read())
        body = path.read_bytes()
        hashes[key] = hashlib.sha256(body).hexdigest()
        inputs[key] = list(csv.DictReader(body.decode(encoding).splitlines()))
    facility_bytes = (ROOT / 'public' / 'data' / 'facilities.json.gz').read_bytes()
    facilities = json.loads(gzip.decompress(facility_bytes))
    station_path = raw / 'official-stations.html'
    if args.fetch:
        with urllib.request.urlopen(STATION_URL, timeout=30) as response:
            station_path.write_bytes(response.read())
    station_body = station_path.read_bytes()
    parser = StationTable()
    parser.feed(station_body.decode('utf-8-sig'))
    if len(parser.stations) < 100:
        raise ValueError('official station table is incomplete')
    station_index = parser.stations
    # Older accessible-station data can fill names missing from the official
    # timetable, but never overwrites the timetable when the two disagree.
    for name, codes in facility_station_codes(facilities).items():
        if name not in station_index:
            station_index[name] = codes
    output, unlocated, counts = build(inputs['coordinates'], inputs['access'], station_index)
    destination = ROOT / 'public' / 'data'
    payload = json.dumps(output, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
    (destination / 'metro-exits.json.gz').write_bytes(gzip.compress(payload, compresslevel=9, mtime=0))
    unlocated_payload = json.dumps(unlocated, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
    (destination / 'metro-unlocated-exits.json.gz').write_bytes(gzip.compress(unlocated_payload, compresslevel=9, mtime=0))
    metadata = {'sources': {key: {'url': spec[1], 'sha256': hashes[key]} for key, spec in SOURCES.items()},
                'stationIndex': {'url': STATION_URL, 'sha256': hashlib.sha256(station_body).hexdigest(),
                                 'fallbackSourceId': 'wheel-20', 'facilitiesSha256': hashlib.sha256(facility_bytes).hexdigest()},
                'sourceRows': {key: len(rows) for key, rows in inputs.items()}, 'outputRows': len(output), 'matching': counts}
    (destination / 'metro-exits-metadata.json').write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(metadata, ensure_ascii=False, indent=2))

if __name__ == '__main__':
    main()
