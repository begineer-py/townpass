"""Measure evidence gaps on public benchmark points; never interpret coverage as accessibility."""
import json,gzip,urllib.request
from pathlib import Path
from datetime import datetime,timezone
from pyproj import Transformer
from shapely.geometry import shape,LineString
from shapely.ops import transform
from shapely import union_all
ROOT=Path(__file__).resolve().parent.parent;RAW=ROOT/'data/raw'
g=json.loads(gzip.decompress((ROOT/'public/data/graph.json.gz').read_bytes()));p=Transformer.from_crs(4326,3826,always_xy=True)
old=union_all([transform(p.transform,shape(x))for x in g['officialAreas']])
new=union_all([old]+[transform(p.transform,shape(f['geometry']))for f in g['supplementalEvidence']['features']])
cache=RAW/'route-coverage-samples.json'
if not cache.exists():
 rows=[]
 for point in json.loads((ROOT/'reports/official-router-benchmark.json').read_text(encoding='utf-8')):
  body=json.dumps({'points':[dict(lat=point['start'][0],lng=point['start'][1]),dict(lat=point['end'][0],lng=point['end'][1])]}).encode()
  req=urllib.request.Request('https://tppano.gov.taipei/shortestAccessibleRoute/api/v1/navigation_waypoints/',data=body,headers={'Content-Type':'application/json'})
  with urllib.request.urlopen(req,timeout=30)as r:payload=json.load(r)
  rows.append(dict(name=point['name'],start=point['start'],end=point['end'],payload=payload))
 cache.write_text(json.dumps(rows,ensure_ascii=False),encoding='utf-8')
results=[]
for item in json.loads(cache.read_text(encoding='utf-8')):
 line=transform(p.transform,LineString(item['payload']['geometry_wgs84']['coordinates']))
 before=line.difference(old).length;after=line.difference(new).length
 results.append(dict(name=item['name'],lengthM=round(line.length,2),missingBeforeM=round(before,3),missingAfterM=round(after,3),recoveredM=round(before-after,3)))
report=dict(checkedAt=datetime.now(timezone.utc).isoformat(),method='Exact polygon union in EPSG:3826, no buffers; cached public route samples; coverage only, not pass rate',results=results)
(ROOT/'reports/coverage-expansion.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(results,ensure_ascii=True),flush=True)
