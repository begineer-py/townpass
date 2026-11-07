"""Offline geometric sensitivity only; output is never used as route graph."""
import gzip,hashlib,json,os,time,datetime,email.utils
from decimal import Decimal
from collections import defaultdict
import shapely,pyproj
from shapely.geometry import shape,LineString,Point
from shapely.ops import transform
from shapely.strtree import STRtree
from pyproj import Transformer

ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
def raw(path):
 with open(path,'rb') as f:return f.read()
def digest(data):return hashlib.sha256(data).hexdigest()
def gz(path):
 data=raw(path);return json.loads(gzip.decompress(data)),digest(data)
source,source_sha=gz('data/processed/official-sidewalk-provenance.json.gz')
g,graph_sha=gz('public/data/graph.json.gz')
osm,osm_sha=gz('data/processed/shadow-osm-edges.json.gz')
if osm['graphSha256']!=graph_sha:raise RuntimeError('OSM graph hash mismatch')
work_bytes=raw('data/processed/shadow-construction-snapshot.json');work=json.loads(work_bytes)
now=datetime.datetime.now(datetime.timezone.utc)
def dt(s):
 try:return datetime.datetime.fromisoformat(s.replace('Z','+00:00'))
 except ValueError:return email.utils.parsedate_to_datetime(s)
if any(abs((now-dt(work[k])).total_seconds())>1800 for k in ['fetchedAt','sourceUpdatedAt']):raise RuntimeError('Construction snapshot stale')
project=Transformer.from_crs(4326,3826,always_xy=True).transform
def polygon(f):return transform(project,shape(f))
areas=[polygon(x) for x in g['officialAreas']]+[polygon(x['geometry']) for x in g.get('supplementalEvidence',{}).get('features',[])]
crossings=[polygon(x) for x in g['officialCrossingAreas']]+[polygon(x['geometry']) for x in g.get('supplementalEvidence',{}).get('features',[]) if x['crossing']]
road=[LineString([project(lon,lat) for lon,lat,*_ in line]) for line in g['roadGeometries']]
area_tree,cross_tree,road_tree=map(STRtree,[areas,crossings,road])
blockers=[Point(*project(n[1],n[0])) for n in g['nodes'] if n[2]];blocker_tree=STRtree(blockers)
work_geoms=[];work_buffers=[];unmapped=0
for w in work['works']:
 if not w.get('geometries'):unmapped+=1
 for p in w.get('geometries',[]):
  points=[project(x[1],x[0]) for x in p['coordinates']]
  geometry=Point(points[0]) if p['type']=='Point' else shape({'type':p['type'],'coordinates':[points] if p['type']=='Polygon' else points})
  work_geoms.append(geometry);work_buffers.append(.05 if p['type']=='Polygon' else 10)
work_tree=STRtree(work_geoms)
area_tolerances=[0,.25,.5,1,2,3];distance_tolerances=[0,.1,.5,1,2,3]
def first_area(line):
 hits=area_tree.query(line,predicate='dwithin',distance=3)
 if not len(hits):return None
 union=shapely.union_all([areas[int(i)] for i in hits])
 for j,t in enumerate(area_tolerances):
  if (union if t==0 else union.buffer(t)).covers(line):return j
 return None
def road_clear(line):
 hits=road_tree.query(line,predicate='intersects')
 if not len(hits):return True
 crossing_hits=cross_tree.query(line,predicate='intersects')
 if not len(crossing_hits):return False
 cross=shapely.union_all([crossings[int(i)] for i in crossing_hits])
 return all(cross.covers(line.intersection(road[int(i)])) for i in hits)
def block_reason(line):
 if len(blocker_tree.query(line,predicate='dwithin',distance=.5)):return 'barrier'
 if any(line.distance(work_geoms[int(i)])<=work_buffers[int(i)] for i in work_tree.query(line,predicate='dwithin',distance=10)):return 'construction'
 return None
def check(line):
 if not road_clear(line):return None,'road'
 reason=block_reason(line)
 if reason:return None,reason
 index=first_area(line)
 return (index,'ok') if index is not None else (None,'area')
class DSU:
 def __init__(self):self.parent={};self.weight={}
 def root(self,x):
  if x not in self.parent:self.parent[x]=x;self.weight[x]=1
  while self.parent[x]!=x:self.parent[x]=self.parent[self.parent[x]];x=self.parent[x]
  return x
 def join(self,a,b):
  a=self.root(a);b=self.root(b)
  if a==b:return
  if self.weight[a]<self.weight[b]:a,b=b,a
  self.parent[b]=a;self.weight[a]+=self.weight[b]
def exact(p):return (Decimal(p[0]).normalize(),Decimal(p[1]).normalize())
endpoints={};coordinates=[];source_parts=[];endpoint_members=[]
def endpoint_index(pair):
 key=exact(pair)
 if key not in endpoints:endpoints[key]=len(coordinates);coordinates.append(Point(float(pair[0]),float(pair[1])));endpoint_members.append(set())
 return endpoints[key]
for part_index,part in enumerate(source['parts']):
 points=part['coordinates'];a,b=endpoint_index(points[0]),endpoint_index(points[-1]);source_parts.append((a,b));endpoint_members[a].add(part_index);endpoint_members[b].add(part_index)
endpoint_points=coordinates[:];endpoint_tree=STRtree(endpoint_points)
segments=[];segment_stats=defaultdict(int);total=0;next_node=len(endpoints);start=time.time();examples={'0.5m':[],'1m':[]}
for index,part in enumerate(source['parts']):
 pts=part['coordinates'];first,last=source_parts[index];nodes=[first]+list(range(next_node,next_node+len(pts)-2))+[last];next_node+=len(pts)-2
 for j in range(1,len(pts)):
  a=tuple(map(float,pts[j-1]));b=tuple(map(float,pts[j]));line=LineString([a,b]);length=line.length;total+=length
  if length==0:area_idx=0;reason='zero'
  else:area_idx,reason=check(line)
  # Public source identifiers only; avoid user-specific shadow investigation IDs.
  label={2:'0.5m',3:'1m'}.get(area_idx)
  if label and len(examples[label])<3 and part['sourceId'] not in {'147125','147071','147124'}:
   examples[label].append({'sourceId':part['sourceId'],'partIndex':part['partIndex'],'segmentIndex':j-1,'lengthM':round(length,3),'passesKnownRoadBarrierConstructionChecks':True})
  segment_stats[reason]+=1
  if area_idx is not None:segments.append((nodes[j-1],nodes[j],length,area_idx))
 if index%10000==0:print(f'source {index}/{len(source["parts"])} elapsed {time.time()-start:.1f}s',flush=True)
print('source endpoint candidate search',flush=True)
near_pairs=[];pair_rejected=defaultdict(int)
for i,p in enumerate(endpoint_points):
 for j in endpoint_tree.query(p,predicate='dwithin',distance=3):
  j=int(j)
  if j<=i:continue
  # A single source part's own two endpoints cannot be an inter-part link.
  if len(endpoint_members[i])==len(endpoint_members[j])==1 and endpoint_members[i]==endpoint_members[j]:
   pair_rejected['same_part']+=1;continue
  distance=p.distance(endpoint_points[j]);line=LineString([p,endpoint_points[j]])
  tol,reason=check(line);pair_rejected[reason]+=1
  if tol is not None:near_pairs.append((i,j,distance,tol))
osm_dsu=DSU();osm_lines=[]
for edge in osm['edges']:
 osm_dsu.join(edge['a'],edge['b']);osm_lines.append(LineString([project(p[1],p[0]) for p in edge['line']]))
osm_tree=STRtree(osm_lines);attachments=[];attach_stats=defaultdict(int)
print('OSM attachment candidate search',flush=True)
for i,p in enumerate(endpoint_points):
 for j in osm_tree.query(p,predicate='dwithin',distance=3):
  j=int(j);line=osm_lines[j];target=line.interpolate(line.project(p));distance=p.distance(target)
  if distance<1e-7:
   # Degenerate zero-length link is still subjected to road, barrier and area checks.
   connection=Point(p)
  else:connection=LineString([p,target])
  tol,reason=check(connection);attach_stats[reason]+=1
  if tol is not None:attachments.append((i,osm_dsu.root(osm['edges'][j]['a']),distance,tol))
 if i%20000==0:print(f'attachments {i}/{len(endpoint_points)} elapsed {time.time()-start:.1f}s',flush=True)
print('component scenarios',flush=True)
scenarios=[]
for area_i,area_tol in enumerate(area_tolerances):
 for distance_tol in distance_tolerances:
  dsu=DSU();active=set();accepted=[]
  for a,b,length,required in segments:
   if required<=area_i:dsu.join(a,b);active.add(a);active.add(b);accepted.append((a,length))
  links=0
  for a,b,d,required in near_pairs:
   if d<=distance_tol+1e-7 and required<=area_i and a in active and b in active:dsu.join(a,b);links+=1
  comps=defaultdict(float)
  for node,length in accepted:comps[dsu.root(node)]+=length
  attached_roots=set();attachment_count=0;osm_roots=set()
  for node,osm_root,d,required in attachments:
   if d<=distance_tol+1e-7 and required<=area_i and node in active:
    attached_roots.add(dsu.root(node));osm_roots.add(osm_root);attachment_count+=1
  scenarios.append({'areaToleranceM':area_tol,'endpointToleranceM':distance_tol,'sourceSegments':len(accepted),'sourceLengthM':sum(comps.values()),'sourceComponents':len(comps),'largestSourceComponentM':max(comps.values(),default=0),'sourceEndpointLinks':links,'osmAttachmentPairs':attachment_count,'attachedSourceComponents':len(attached_roots),'attachedSourceLengthM':sum(comps[root] for root in attached_roots),'osmComponentsTouched':len(osm_roots)})
codepaths=['scripts/audit-sidewalk-tolerance.py','scripts/export-shadow-osm-edges.mjs','src/routing.mjs','src/geometry.mjs','src/construction.mjs']
report={'createdAt':now.isoformat(),'elapsedSeconds':time.time()-start,'sourceSha256':source['sourceSha256'],'sidecarSha256':source_sha,'graphSha256':graph_sha,'osmShadowSha256':osm_sha,'constructionSnapshotSha256':digest(work_bytes),'codeHashes':{path:digest(raw(path)) for path in codepaths},'runtime':{'shapely':shapely.__version__,'pyproj':pyproj.__version__},'inputPaths':['data/processed/official-sidewalk-provenance.json.gz','data/processed/shadow-osm-edges.json.gz','data/processed/shadow-construction-snapshot.json','public/data/graph.json.gz'],'constructionFetchedAt':work['fetchedAt'],'constructionSourceUpdatedAt':work['sourceUpdatedAt'],'unmappedActiveConstruction':unmapped,'osmEdges':len(osm_lines),'sourceParts':len(source['parts']),'uniqueExactSourceEndpoints':len(endpoints),'sourceSegments':sum(segment_stats.values()),'sourceMetres':total,'segmentChecks':dict(segment_stats),'sourcePairChecks':dict(pair_rejected),'osmAttachmentChecks':dict(attach_stats),'sourceCandidatePairs':len(near_pairs),'osmCandidatePairs':len(attachments),'areaTolerancesM':area_tolerances,'endpointTolerancesM':distance_tolerances,'sampleSegments':examples,'scenarios':scenarios,'method':'Original TWD97 source geometry; exact original endpoints form nodes; interiors stay per source part. Checks run in order road/crossing, OSM blocker or active construction, then complete official pedestrian area union with the stated buffer. OSM pedestrian edges were prefiltered with production edgeAllowed and explicit grade/bridge/tunnel exclusions. Distance and polygon operations in EPSG:3826. Attachment to OSM is counted per exact source graph component; this is a geometric opportunity, not a route success count. Sample source segments are the first eligible examples by source order, not statistically representative.','limitations':'Buffered area and nearby-endpoint links are estimated, not confirmed sidewalk alignment or connectivity. Original official line contains no elevation, layer or pedestrian access attributes; even zero tolerance and exact endpoint equality do not establish same-level passage. Road centreline intersection evidence and construction records can be incomplete. OSM shared-road edges excluded from attachment analysis. Construction is one time-limited snapshot; all route results require fresh revalidation. No user-selected points, real journey outcomes, or production graph writes are included.'}
out=os.environ.get('AUDIT_OUTPUT','reports/official-sidewalk-tolerance-shadow.json')
with open(out,'w',encoding='utf8') as f:json.dump(report,f,ensure_ascii=False,indent=2)
print(json.dumps({'output':out,'elapsedSeconds':report['elapsedSeconds'],'segmentChecks':report['segmentChecks'],'sourcePairChecks':report['sourcePairChecks'],'osmAttachmentChecks':report['osmAttachmentChecks'],'scenarios':scenarios},ensure_ascii=False),flush=True)
