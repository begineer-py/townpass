"""Attach exact Wheelroute polygon overlap to each OSM edge.

No buffering/snapping creates connectivity. Width raw values remain unverified.
"""
import json,gzip,math,os,osmium,subprocess
from pathlib import Path
from datetime import datetime,timezone
import numpy as np
from pyproj import Transformer
from shapely import Polygon,LineString,make_valid,intersection,union_all
from shapely.geometry import mapping
from shapely.ops import transform
from shapely.strtree import STRtree
ROOT=Path(__file__).resolve().parent.parent
RAW=ROOT/'data/raw';OUT=ROOT/'public/data'
project=Transformer.from_crs(4326,3826,always_xy=True)
def only_polygons(g):
 if g.geom_type=='Polygon':return [g]
 if hasattr(g,'geoms'):return [p for part in g.geoms for p in only_polygons(part)]
 return []
polys=[];records=[];counts={};missing={};invalid=0
for kind in [11,12,13]:
 rows=json.loads((RAW/f'wheel-{kind}.json').read_text(encoding='utf-8-sig'))
 counts[str(kind)]=len(rows);missing[str(kind)]={'slopeKnown':sum(isinstance(r.get('slope'),(int,float)) and r['slope']>=0 for r in rows),'widthPositive':sum(isinstance(r.get('width'),(int,float)) and r['width']>0 for r in rows)}
 for i,r in enumerate(rows):
  try:
   flat=[float(v) for v in str(r.get('location','')).strip('|').split('|')]
   if len(flat)<8 or len(flat)%2:raise ValueError('invalid coordinate pairs')
   coords=list(zip(flat[::2],flat[1::2]))
   if any(not(120<lon<123 and 24<lat<27) for lon,lat in coords):raise ValueError('out of region')
   # Do not guess a missing polygon closure from undocumented open geometry.
   if abs(coords[0][0]-coords[-1][0])>1e-7 or abs(coords[0][1]-coords[-1][1])>1e-7:raise ValueError('unclosed ring')
   x,y=project.transform(*zip(*coords));poly=union_all(only_polygons(make_valid(Polygon(zip(x,y)))))
   if poly.is_empty or poly.area<=0:raise ValueError('empty polygon')
   polys.append(poly)
   records.append({'id':f'wheel-{kind}-{i}','kind':kind,'name':r.get('kname'),'widthRaw':r.get('width'),'widthUnitVerified':False,'slopePct':r.get('slope') if isinstance(r.get('slope'),(int,float)) and r['slope']>=0 else None,'geometry':[[round(lon,7),round(lat,7)] for lon,lat in coords]})
  except (ValueError,TypeError):invalid+=1
print('official polygons',len(polys),'invalid',invalid,flush=True)
tree=STRtree(polys)
g=json.loads(gzip.decompress((OUT/'graph.json.gz').read_bytes()))
if g.get('graphTrimmed'):
 g=json.loads(gzip.decompress((ROOT/'data/processed/graph-evidence-full.json.gz').read_bytes()))
g['edges']=[e for e in g['edges'] if isinstance(e[2],(int,float)) and math.isfinite(e[2]) and e[2]>0]
by_id={w['osmId']:w for w in g['ways']}
vehicle_types={'primary','primary_link','secondary','secondary_link','tertiary','tertiary_link','residential','unclassified','service','living_street','motorway','motorway_link','trunk','trunk_link'}
road_geometries=[]
class Grades(osmium.SimpleHandler):
 def way(self,w):
  tags=dict(w.tags)
  if w.id in by_id:
   for key in ['layer','level','bridge','tunnel']:by_id[w.id][key]=tags.get(key)
  if tags.get('highway') in vehicle_types:
   coords=[(n.location.lon,n.location.lat) for n in w.nodes if n.location.valid()]
   if len(coords)>1 and any(121.42<=x<=121.69 and 24.94<=y<=25.24 for x,y in coords):road_geometries.append(coords)
os.chdir(ROOT)
Grades().apply_file('data/raw/taiwan.osm.pbf',locations=True)
nodes=np.array(g['nodes']);xs,ys=project.transform(nodes[:,1],nodes[:,0]);xy=list(zip(xs,ys))
vehicle_types={'primary','primary_link','secondary','secondary_link','tertiary','tertiary_link','residential','unclassified','service','living_street','motorway','motorway_link','trunk','trunk_link'}
def edge_line(e):
 a,b=e[:2];pts=[xy[a]]
 if len(e)>4 and e[4]:
  lat,lon=zip(*e[4]);px,py=project.transform(lon,lat);pts.extend(zip(px,py))
 pts.append(xy[b]);return LineString(pts)
roads=[LineString(zip(*project.transform(*zip(*coords)))) for coords in road_geometries]
print('independent vehicle way geometries',len(roads),flush=True)
road_tree=STRtree(roads)
def max_line_length(geom):
 if geom.is_empty:return 0
 if geom.geom_type in ['LineString','LinearRing']:return geom.length
 return max((max_line_length(x) for x in geom.geoms),default=0) if hasattr(geom,'geoms') else 0
total=0;covered=0;matched=0
for ei,e in enumerate(g['edges']):
 a,b,d,w=e[:4];line=edge_line(e);total+=d
 hits=tree.query(line,predicate='intersects')
 overlap=0;ids=[];crossing=0;valid_polys=[];cross_polys=[]
 if len(hits) and line.length>0:
  intersects=[];cross=[]
  for h in hits:
   part=line.intersection(polys[h])
   if part.length>0.05:
    intersects.append(part);ids.append(int(h));valid_polys.append(polys[h])
    if records[h]['kind']==13:cross.append(part);cross_polys.append(polys[h])
  if intersects:overlap=min(1,union_all(intersects).length/line.length)
  if cross:crossing=min(1,union_all(cross).length/line.length)
 official_area=union_all(valid_polys);cross_area=union_all(cross_polys)
 max_gap=max_line_length(line.difference(official_area))
 # Geometric intersections with vehicle ways must lie in an official crossing.
 # With no verified elevation context, grade-separated intersections are conservatively rejected too.
 road_verified=False;cross_verified=False
 if g['ways'][w]['highway'] in {'footway','path','pedestrian','corridor'}:
  road_hits=road_tree.query(line,predicate='intersects')
  bare=all(line.intersection(roads[h]).difference(cross_area).is_empty for h in road_hits)
  # A mapped crossing is a pedestrian way, not permission to walk a vehicle centreline.
  osm_crossing=bool(g['ways'][w].get('crossing'))
  road_verified=bare or osm_crossing
  cross_verified=osm_crossing or bare
 evidence={'schemaVersion':2,'coverage':overlap,'maxUncoveredMetres':max_gap,'crossingCoverage':crossing,'roadCrossingVerified':bool(road_verified),'crossingVerified':bool(cross_verified),'featureIds':ids}
 if len(e)>5:e[5]=evidence
 else:e.append(evidence)
 covered+=d*overlap
 if overlap>0:matched+=1
 if ei%75000==0:print('edges',ei,'matched',matched,flush=True)
now=datetime.now(timezone.utc).isoformat()
g['officialPathEvidence']={'schemaVersion':2,'source':'https://data.taipei/dataset/detail?id=2b58f15a-dec6-4b9d-91be-4eaccfda5ae7','integratedAt':now,'featureCount':len(records),'method':'exact polygon intersection; vehicle crossings require official crossing polygons; no buffers; not a wheelchair certification','widthUnitVerified':False}
unproject=Transformer.from_crs(3826,4326,always_xy=True)
g['officialAreas']=[mapping(transform(unproject.transform,p)) for p in polys]
g['officialCrossingAreas']=[g['officialAreas'][i] for i,r in enumerate(records) if r['kind']==13]
g['roadGeometries']=road_geometries
g['officialPathEvidence']['roadMaskSource']='all vehicle highway ways from original OSM PBF, independent of pedestrian graph filtering'
(OUT/'graph.json.gz').write_bytes(gzip.compress(json.dumps(g,ensure_ascii=False,separators=(',',':')).encode('utf8'),9))
(OUT/'official-paths.json.gz').write_bytes(gzip.compress(json.dumps({'generatedAt':now,'features':records},ensure_ascii=False,separators=(',',':')).encode('utf8'),9))
report={'checkedAt':now,'sourceCounts':counts,'fields':missing,'validPolygons':len(records),'invalidPolygons':invalid,'matchedEdges':matched,'allGraphLengthKm':round(total/1000,2),'overlapLengthKm':round(covered/1000,2),'overlapPercentOfImportedGraph':round(covered/total*100,2),'method':'length weighted overlap across imported graph, not a city coverage percentage; exact polygon intersection; unknown width units retained'}
(ROOT/'reports').mkdir(exist_ok=True)
(ROOT/'reports/official-path-integration.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps(report,ensure_ascii=True),flush=True)
subprocess.run(['node','scripts/compact-routing-data.mjs'],cwd=ROOT,check=True)
