"""Download and integrate supplemental polygon evidence without buffers or snapping.
Mixed marking exports are filtered to crosswalk codes evidenced by the dedicated crosswalk archive.
"""
import json,gzip,hashlib,urllib.request,zipfile,io,sys,math
from pathlib import Path
from datetime import datetime,timezone
import shapefile
from pyproj import Transformer,CRS
from shapely.geometry import shape,mapping
from shapely import make_valid
from shapely.ops import transform
ROOT=Path(__file__).resolve().parent.parent;RAW=ROOT/'data/raw';OUT=ROOT/'public/data'
SOURCES=[
 ('sidewalk-range-2026','人行道範圍圖','715d3a83-8445-4496-b6bf-b0900538b7e7','b11d6142-1d71-41d5-a843-7b7cfcea61ef','json','2026-01-14'),
 ('crosswalk-2026','行穿線','4d6bd0c6-9f56-408b-bb96-ac41134a95d5','d56fe03c-0fbd-4a8b-998e-205a5e169211','zip','2026-03-19'),
 ('marked-sidewalk-2026','標線型人行道匯出（僅採已確認行穿線代碼）','d647b3af-4bbd-4e8f-b420-8f6c1bc1b597','2d82d5f1-8f97-45db-89df-162ba161dedb','zip','2026-10-30'),
 ('curb-ramps-2026','人行道無障礙斜坡道','8ab0c662-b560-4310-a825-001ae7fdc524','ee522d94-daa7-4118-b52a-4bf144af2744','json','2026-01-14')]
now=datetime.now(timezone.utc).isoformat();metas=[]
for key,name,did,rid,ext,updated in SOURCES:
 path=RAW/f'{key}.{ext}';url='https://data.taipei/api/frontstage/tpeod/dataset/resource.download?rid='+rid
 if not path.exists() or '--refresh' in sys.argv:
  with urllib.request.urlopen(url,timeout=120)as r:path.write_bytes(r.read())
 metas.append(dict(id=key,name=name,url='https://data.taipei/dataset/detail?id='+did,endpoint=url,sourceUpdatedAt=updated,processedAt=now,sha256=hashlib.sha256(path.read_bytes()).hexdigest(),status='ok',observedAt=None))
project=Transformer.from_crs(3826,4326,always_xy=True)
def polygons(g):
 if g.geom_type=='Polygon':return [g]
 return [p for x in getattr(g,'geoms',[])for p in polygons(x)]
features=[];seen=set();counts={};excluded={}
def add(geom,source,fid,crossing=False):
 # Preserve polygon holes and source geometry. Repair only existing polygon rings, never buffer.
 for poly in polygons(make_valid(geom)):
  if poly.is_empty or poly.area<=0:continue
  key=(crossing,poly.wkb)
  if key in seen:continue
  seen.add(key);geo=mapping(transform(project.transform,poly))
  features.append(dict(sourceId=source,sourceFeatureId=str(fid),crossing=crossing,geometry=geo))
  counts[source]=counts.get(source,0)+1
side=json.loads((RAW/'sidewalk-range-2026.json').read_text(encoding='utf-8-sig'))
assert side['crs']['properties']['name'].endswith('3826')
for i,f in enumerate(side['features']):add(shape(f['geometry']),'sidewalk-range-2026',f['properties'].get('ID',i))
# Only the following codes are named by the dedicated crosswalk archive; all other markings are excluded.
codes={'08','09','18','A8','A9','B8'}
# Use newest mixed export for these crossing types; older dedicated archive is provenance/QA, not a stale union.
z=zipfile.ZipFile(RAW/'marked-sidewalk-2026.zip')
for name in z.namelist():
 if not name.endswith('.shp'):continue
 base=name[:-4];crs=CRS.from_wkt(z.read(base+'.prj').decode());assert crs.equals(CRS.from_epsg(3826),ignore_axis_order=True)
 reader=shapefile.Reader(shp=io.BytesIO(z.read(name)),dbf=io.BytesIO(z.read(base+'.dbf')),encoding='cp950',encodingErrors='replace')
 for i,row in enumerate(reader.iterShapeRecords()):
  d=row.record.as_dict();reason=None
  if d.get('licode')not in codes:reason='unconfirmedMarkingType'
  elif d.get('walkerstat')!='':reason='nonemptyStatus'
  elif d.get('zlocation')!='01':reason='unconfirmedLevel'
  if reason:excluded[reason]=excluded.get(reason,0)+1;continue
  add(shape(row.shape.__geo_interface__),'marked-sidewalk-2026',d.get('keyid',i),True)
def read(name):return json.loads(gzip.decompress((OUT/f'{name}.json.gz').read_bytes()))
def write(name,data):(OUT/f'{name}.json.gz').write_bytes(gzip.compress(json.dumps(data,ensure_ascii=False,separators=(',',':')).encode(),9,mtime=0))
g=read('graph');g['supplementalEvidence']={'schemaVersion':1,'method':'exact polygons; no buffers; nonempty status/unknown codes excluded','sources':metas[:3],'features':features};write('graph',g)
# Ramp points aid discovery only; never become connector geometry or width/slope certification.
ramps=json.loads((RAW/'curb-ramps-2026.json').read_text(encoding='utf-8-sig'));assert ramps['crs']['properties']['name'].endswith('3826')
facilities=[f for f in read('facilities')if f.get('sourceId')!='curb-ramps-2026'];grid={}
def cell(lat,lon):return(math.floor(lat/.00005),math.floor(lon/.00005))
for f in facilities:
 if str(f.get('kind'))in ['1','ramp']:grid.setdefault(cell(f['lat'],f['lon']),[]).append(f)
added=0
for i,f in enumerate(ramps['features']):
 if f['geometry']['type']!='Point':continue
 lon,lat=project.transform(*f['geometry']['coordinates'][:2])
 if not(24.94<lat<25.24 and 121.42<lon<121.69):continue
 x,y=cell(lat,lon)
 near=[p for dx in [-1,0,1]for dy in [-1,0,1]for p in grid.get((x+dx,y+dy),[])]
 if any(math.hypot((lat-p['lat'])*111195,(lon-p['lon'])*100700)<=3 for p in near):continue
 item=dict(id='curb-2026-'+str(f['properties'].get('OBJECTID',i)),kind='1',name='人行道無障礙斜坡道',lat=lat,lon=lon,sourceId='curb-ramps-2026')
 facilities.append(item);grid.setdefault((x,y),[]).append(item);added+=1
write('facilities',facilities)
manifest=read('sources');sources=manifest['sources']
manifest['sources']=[s for s in sources if s['id']not in {m['id']for m in metas}]+metas
manifest['facilityCount']=len(facilities);manifest['generatedAt']=now;write('sources',manifest)
report=dict(processedAt=now,polygonsBySource=counts,excludedMarkings=excluded,rampRawCount=len(ramps['features']),newRampPoints=added,totalFacilities=len(facilities),sources=metas)
(ROOT/'reports/supplemental-data-integration.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({k:v for k,v in report.items()if k!='sources'},ensure_ascii=True),flush=True)
