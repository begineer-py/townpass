"""Join small ground-level mapping gaps only inside continuous official pedestrian polygons."""
import gzip,json,math
from pathlib import Path
from datetime import datetime,timezone
from shapely.geometry import shape,Point,LineString
from shapely.ops import transform
from shapely import union_all
from shapely.strtree import STRtree
from pyproj import Transformer
from gap_connector_policy import connector_roads_allowed
ROOT=Path(__file__).resolve().parent.parent;path=ROOT/'public/data/graph.json.gz';g=json.loads(gzip.decompress(path.read_bytes()));project=Transformer.from_crs(4326,3826,always_xy=True)
g['edges']=[e for e in g['edges']if not g['ways'][e[3]].get('isConnector')]
xy=[project.transform(n[1],n[0])for n in g['nodes']];degree=[0]*len(xy);elevated=set();parent=list(range(len(xy)))
def find(i):
 while parent[i]!=i:parent[i]=parent[parent[i]];i=parent[i]
 return i
for e in g['edges']:
 a,b=e[:2];degree[a]+=1;degree[b]+=1;parent[find(b)]=find(a)
 if g['ways'][e[3]].get('gradeSeparatedPedestrian'):elevated.update([a,b])
ids=[i for i,n in enumerate(g['nodes'])if degree[i]and not n[2]and i not in elevated];points=[Point(xy[i])for i in ids];tree=STRtree(points)
blocks=[Point(xy[i])for i,n in enumerate(g['nodes'])if n[2]];btree=STRtree(blocks)
areas=[transform(project.transform,shape(x))for x in g['officialAreas']]+[transform(project.transform,shape(f['geometry']))for f in g['supplementalEvidence']['features']];atree=STRtree(areas)
cross=[transform(project.transform,shape(x))for x in g['officialCrossingAreas']]+[transform(project.transform,shape(f['geometry']))for f in g['supplementalEvidence']['features']if f['crossing']];ctree=STRtree(cross)
roads=[LineString([project.transform(*p[:2])for p in line])for line in g['roadGeometries']];rtree=STRtree(roads)
way=len(g['ways']);g['ways'].append({'highway':'footway','name':'人行道銜接','isConnector':True,'source':'official-polygon-connector','width':None,'slope':None});added=[]
for a in ids:
 if degree[a]!=1:continue
 for k in tree.query(Point(xy[a]),predicate='dwithin',distance=3):
  b=ids[int(k)]
  if a==b or find(a)==find(b):continue
  line=LineString([xy[a],xy[b]]);length=line.length
  if length<.001 or len(btree.query(line,predicate='dwithin',distance=.5)):continue
  hits=atree.query(line,predicate='intersects');area=union_all([areas[int(h)]for h in hits])
  if not area.covers(line):continue
  crosses=union_all([cross[int(h)]for h in ctree.query(line,predicate='intersects')])
  if not connector_roads_allowed(line,roads,rtree,cross,ctree):continue
  proof={'schemaVersion':2,'coverage':1,'maxUncoveredMetres':0,'crossingCoverage':min(1,line.intersection(crosses).length/length),'roadCrossingVerified':True,'crossingVerified':True,'connectorVerified':True,'connectorLength':length,'featureIds':[int(h)for h in hits]}
  g['edges'].append([a,b,length,way,[],proof]);parent[find(b)]=find(a);added.append({'nodes':[g['nodes'][a][3],g['nodes'][b][3]],'length':round(length,3)})
g['gapConnectors']={'createdAt':datetime.now(timezone.utc).isoformat(),'maxDistance':3,'count':len(added),'method':'ground-only, different OSM nodes, exact pedestrian polygon union, road crossing evidence and barrier exclusion'}
path.write_bytes(gzip.compress(json.dumps(g,ensure_ascii=False,separators=(',',':')).encode(),9,mtime=0));(ROOT/'reports/ground-gap-connectors.json').write_text(json.dumps({**g['gapConnectors'],'links':added},indent=2),encoding='utf-8');print(json.dumps(g['gapConnectors']),flush=True)
