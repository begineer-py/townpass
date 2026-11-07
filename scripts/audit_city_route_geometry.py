"""Compare a cached public city route candidate with city line geometry.

Read-only with respect to application data. A geometric match is not a crossing,
obstacle, entrance, elevation, construction, or accessibility verification.
"""
import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

from shapely import wkt
from shapely.geometry import LineString

ROOT = Path(__file__).resolve().parent.parent


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def audit(lines_path, route_path, tolerance):
    if not 0 <= tolerance <= 1:
        raise ValueError('Diagnostic tolerance must be between 0 and 1 metre')
    city = json.loads(lines_path.read_text(encoding='utf-8-sig'))
    rows = city['data']
    route = json.loads(route_path.read_text(encoding='utf-8-sig'))
    candidates = route['segments']
    if not isinstance(rows, list) or not isinstance(candidates, list):
        raise ValueError('Unexpected cached source structure')
    lookup = {}
    duplicates = set()
    for row in rows:
        key = str(row['qgs_fid'])
        if key in lookup:
            duplicates.add(key)
        lookup[key] = row['STAsText']
    details = []
    for segment in candidates:
        key = str(segment['qgs_fid'])
        coords = segment['geometry']['coordinates']
        line = LineString(coords)
        if line.is_empty or not line.is_valid:
            raise ValueError(f'Invalid route geometry: {key}')
        matched = key in lookup and key not in duplicates
        missing_metres = None
        if matched:
            source = wkt.loads(lookup[key])
            if source.geom_type not in ('LineString', 'MultiLineString') or source.is_empty:
                raise ValueError(f'Invalid source line: {key}')
            # Buffer is used exclusively to diagnose coordinate agreement.
            # It must never be treated as a walking-surface polygon.
            missing_metres = line.difference(source.buffer(tolerance)).length if tolerance else line.difference(source).length
        details.append({'id': key, 'matchedUniqueId': matched,
                        'lengthMetres': round(line.length, 4),
                        'outsideToleranceMetres': None if missing_metres is None else round(missing_metres, 4)})
    return {
        'checkedAt': datetime.now(timezone.utc).isoformat(),
        'source': 'Cached city-platform sidewalk_accessiblePassageway response; TWD97 geometry and IDs',
        'case': 'Previously cached Zhishan station exit to Taipei Children’s Amusement Park via candidate',
        'sourceSha256': sha256(lines_path), 'candidateSha256': sha256(route_path),
        'sourceFeatures': len(rows), 'duplicateSourceIds': len(duplicates),
        'routeSegments': len(details), 'matchedUniqueIds': sum(d['matchedUniqueId'] for d in details),
        'routeLengthMetres': round(sum(d['lengthMetres'] for d in details), 2),
        'diagnosticToleranceMetres': tolerance,
        'segmentsOutsideTolerance': sum(d['outsideToleranceMetres'] is not None and d['outsideToleranceMetres'] > tolerance for d in details),
        'totalOutsideToleranceMetres': round(sum(d['outsideToleranceMetres'] or 0 for d in details), 3),
        'limitations': ['This is one previously cached candidate, not a citywide coverage sample.',
                        'IDs and geometry agreement do not certify accessible or safe crossings.',
                        'A tolerance is used only to compare geometry, never to authorize a connector.',
                        'The source response does not provide detailed surface, elevation or accessibility attributes.',
                        'City service availability, currency, licensing and third-party reuse terms require confirmation.'],
        'segments': details,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--lines', type=Path, default=ROOT / 'data/raw/pano-sidewalk_accessiblePassageway.json')
    parser.add_argument('--route', type=Path, default=ROOT / 'data/raw/zhishan-candidate.json')
    parser.add_argument('--output', type=Path, default=ROOT / 'reports/city-route-geometry-audit.json')
    parser.add_argument('--tolerance-metres', type=float, default=.05)
    args = parser.parse_args()
    report = audit(args.lines, args.route, args.tolerance_metres)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({k: v for k, v in report.items() if k not in ('segments', 'limitations')}, ensure_ascii=False))


if __name__ == '__main__':
    main()
