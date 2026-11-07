"""Read-only Panoramax metadata probes; not a citywide coverage percentage."""
import urllib.request,urllib.parse,json,gzip,math,time,sys
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime,timezone
ROOT=Path(__file__).resolve().parent.parent
fac=json.loads(gzip.decompress((ROOT/'public/data/facilities.json.gz').read_bytes()))
samples=[('北投','北投站出口電梯1'),('士林','士林站出口電梯1'),('內湖','內湖站出口電梯1'),('南港','南港站出口電梯1'),('松山','南京三民站出口電梯1'),('信義','市政府站出口電梯1'),('中山','中山國小站出口電梯1'),('大同','大橋頭站出口電梯1'),('中正','中正紀念堂站出口電梯1'),('大安','大安森林公園站出口電梯1'),('萬華','龍山寺站出口電梯1'),('文山','萬芳醫院站出口電梯1')]
def distance(a,b):return math.hypot((a[1]-b[1])*111195,(a[0]-b[0])*100700)
def probe(pair):
 district,name=pair
 if district in cached and 'error' not in cached[district]:return cached[district]
 matches=[p for p in fac if p['kind']=='metro-elevator' and p['name'].startswith(name.rstrip('1'))]
 if not matches:matches=[p for p in fac if p['kind']=='metro-elevator' and p['station']==name.split('站')[0]]
 if not matches:return {'district':district,'name':name,'error':'no exact local place'}
 p=matches[0];name=p['name'];lon,lat=p['lon'],p['lat'];radius=100
 bbox=[lon-radius/100700,lat-radius/111195,lon+radius/100700,lat+radius/111195]
 url='https://api.panoramax.xyz/api/search?'+urllib.parse.urlencode({'bbox':','.join(str(x) for x in bbox),'limit':500})
 try:
  req=urllib.request.Request(url,headers={'User-Agent':'TownPass-Coverage-Audit/0.1'})
  with urllib.request.urlopen(req,timeout=35) as r:payload=json.load(r)
  rows=payload.get('features',[]);hits=[]
  for f in rows:
   coords=f.get('geometry',{}).get('coordinates',[])
   if len(coords)<2:continue
   d=distance(coords,[lon,lat]);prop=f.get('properties',{})
   if d<=radius:hits.append({'id':f['id'],'distanceMetres':round(d,1),'date':prop.get('datetime'),'fov':prop.get('pers:interior_orientation',{}).get('field_of_view'),'license':prop.get('license'),'url':f'https://explore.panoramax.fr/#pic={f["id"]}'})
  hits.sort(key=lambda p:p['distanceMetres']);dates=[h['date'] for h in hits if h['date']]
  result={'district':district,'name':name,'lat':lat,'lon':lon,'radiusMetres':radius,'returned':len(rows),'nearbyPhotos':len(hits),'hasPhoto':bool(hits),'has360':any(h['fov']==360 for h in hits),'earliestInResponse':min(dates) if dates else None,'latestInResponse':max(dates) if dates else None,'nearest':hits[0] if hits else None,'query':url,'possiblyTruncated':len(rows)>=500}
 except Exception as e:result={'district':district,'name':name,'query':url,'error':str(e)}
 print(json.dumps(result,ensure_ascii=True),flush=True);return result
report_path=ROOT/'reports/streetview-sample-2026-11-07.json'
cached={r['district']:r for r in json.loads(report_path.read_text(encoding='utf8'))['results']} if '--retry-errors' in sys.argv and report_path.exists() else {}
results=list(ThreadPoolExecutor(max_workers=2).map(probe,samples))
report={'checkedAt':datetime.now(timezone.utc).isoformat(),'method':'12 preselected metro accessible exits; one per Taipei district; federated Panoramax API; within 100m Euclidean radius; presence only, not road-length or city area coverage; response limit 500','results':results}
(ROOT/'reports').mkdir(exist_ok=True)
(ROOT/'reports/streetview-sample-2026-11-07.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
print('SUMMARY',json.dumps({'sampled':len(results),'hits':sum(r.get('hasPhoto',False) for r in results),'with360':sum(r.get('has360',False) for r in results),'errors':sum('error' in r for r in results)}),flush=True)
