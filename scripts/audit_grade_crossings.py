"""Recheck existing elevated pedestrian edges against original OSM roads.

Updates only grade-separation edge evidence and adds an audit record. Road
geometry is loaded irrespective of layer and extent endpoints. OSM layer
separation is map evidence, not an on-site safety certification.
"""
import gzip, json, math, os
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
import osmium
from pyproj import Transformer
from shapely.geometry import LineString, shape
from shapely.ops import transform
from shapely.strtree import STRtree
from shapely import union_all

ROOT=Path(__file__).resolve().parent.parent
GRAPH=ROOT/'public/data/graph.json.gz'
PBF=Path(os.environ.get('TOWNPASS_OSM_PBF',ROOT/'data/raw/taiwan.osm.pbf'))
PROJECT=Transformer.from_crs(4326,3826,always_xy=True)
VEHICLE={'motorway','motorway_link','trunk','trunk_link','primary','primary_link','secondary','secondary_link','tertiary','tertiary_link','residential','unclassified','service','living_street'}

def layer(tags, ground_default=False):
    raw=tags.get('layer')
    if raw is not None:
        try:
            n=float(raw)
            return n if math.isfinite(n) else None
        except (ValueError,TypeError):return None
    # OSM's implicit layer zero applies only to ordinary ground roads; an
    # unlayered bridge/tunnel/level cannot be inferred to be ground.
    if ground_default and tags.get('bridge') in (None,'no') and tags.get('tunnel') in (None,'no') and tags.get('level') in (None,'0') and tags.get('location') in (None,'surface'):return 0
    return None

def conflict(line,edge_nodes,ped_tags,road,crossings,tree):
    road_id,road_nodes,road_tags,road_line=road
    intersection=line.intersection(road_line)
    if intersection.is_empty:return None
    shared=bool(set(edge_nodes).intersection(road_nodes))
    a,b=layer(ped_tags),layer(road_tags,True)
    if not shared and a is not None and b is not None and a!=b:return None
    hits=[crossings[int(i)] for i in tree.query(intersection,predicate='intersects')]
    if hits and union_all(hits).covers(intersection):return None
    reason='shared-node' if shared else 'unknown-layer' if a is None or b is None else 'same-layer'
    return {'roadOsmId':road_id,'reason':reason,'pedLayer':a,'roadLayer':b}

def cell_box(points):
    xs=[math.floor(p[0]*1000) for p in points];ys=[math.floor(p[1]*1000) for p in points]
    return min(xs),min(ys),max(xs),max(ys)

class Scan(osmium.SimpleHandler):
    def __init__(self,lines,way_ids):
        super().__init__();self.cells=set();self.roads=[];self.ped={};self.way_ids=way_ids;self.missingRoadSegments=0
        for line in lines:
            x1,y1,x2,y2=cell_box(line)
            for x in range(x1,x2+1):
                for y in range(y1,y2+1):self.cells.add((x,y))
        self.extent=(min(x for x,y in self.cells),min(y for x,y in self.cells),max(x for x,y in self.cells),max(y for x,y in self.cells)) if self.cells else None
    def way(self,w):
        tags=dict(w.tags);ped=w.id in self.way_ids
        if not ped and tags.get('highway') not in VEHICLE:return
        nodes=[(n.ref,(n.location.lon,n.location.lat) if n.location.valid() else None) for n in w.nodes]
        if ped:self.ped[w.id]={'tags':tags,'nodes':nodes}
        if tags.get('highway') not in VEHICLE or not self.extent:return
        for (a,pa),(b,pb) in zip(nodes,nodes[1:]):
            if pa is None or pb is None:self.missingRoadSegments+=1;continue
            x1,y1,x2,y2=cell_box([pa,pb]);ex=self.extent
            if x2<ex[0] or x1>ex[2] or y2<ex[1] or y1>ex[3]:continue
            if not any((x,y) in self.cells for x in range(max(x1,ex[0]),min(x2,ex[2])+1) for y in range(max(y1,ex[1]),min(y2,ex[3])+1)):continue
            if pa!=pb:self.roads.append((w.id,(a,b),tags,LineString([PROJECT.transform(*pa),PROJECT.transform(*pb)])))

def source_verified(graph,edge,source):
    way=graph['ways'][edge[3]]
    if not source or edge[4]:return False
    tags=source['tags']
    # These fields are retained by rebuild_pedestrian_graph. Missing graph
    # fields are not evidence that the source has no restriction.
    for key in ('highway','layer','bridge','footway','wheelchair','level','tunnel'):
        if key not in way or way[key]!=tags.get(key):return False
    if tags.get('area')=='yes' or tags.get('wheelchair')=='no':return False
    if tags.get('tunnel') not in (None,'no') or tags.get('level') not in (None,'0','1'):return False
    # Existing graph ways do not retain access/foot. Require the current PBF
    # to be unrestricted or explicitly allow walking; never infer an omitted
    # graph tag means allowed. If a future graph stores them, also compare.
    for key in ('access','foot'):
        if key in way and way[key]!=tags.get(key):return False
        if tags.get(key) not in (None,'yes','designated','permissive'):return False
    if any(tags.get(key) is not None for key in ('access:conditional','foot:conditional','wheelchair:conditional','oneway:foot','foot:forward','foot:backward','foot:forward:conditional','foot:backward:conditional')):return False
    n1,n2=graph['nodes'][edge[0]],graph['nodes'][edge[1]]
    if len(n1)<4 or len(n2)<4:return False
    for (a,pa),(b,pb) in zip(source['nodes'],source['nodes'][1:]):
        if a==n1[3] and b==n2[3]:break
        if a==n2[3] and b==n1[3]:a,b,pa,pb=b,a,pb,pa;break
    else:return False
    return (pa is not None and pb is not None and abs(pa[0]-n1[1])<=1e-7 and abs(pa[1]-n1[0])<=1e-7 and abs(pb[0]-n2[1])<=1e-7 and abs(pb[1]-n2[0])<=1e-7)

def main():
    g=json.loads(gzip.decompress(GRAPH.read_bytes()))
    if g.get('nodeIdentity')!='OSM node ID; coincident coordinates do not create connectivity':raise ValueError('OSM node identity required')
    edges=[(i,e) for i,e in enumerate(g['edges']) if e[5].get('gradeSeparatedPedestrian') is True]
    lines=[[(g['nodes'][e[0]][1],g['nodes'][e[0]][0]),*[(p[1],p[0]) for p in (e[4] or [])],(g['nodes'][e[1]][1],g['nodes'][e[1]][0])] for _,e in edges]
    way_ids={g['ways'][e[3]].get('osmId') for _,e in edges}
    scan=Scan(lines,way_ids);print(f'Scanning OSM for {len(edges)} grade-separated edges',flush=True);scan.apply_file(str(PBF),locations=True)
    # If a road segment's geometry is missing, we cannot establish that it
    # lies away from the candidate bridges. Do not publish an incomplete scan.
    if scan.missingRoadSegments:raise ValueError(f'{scan.missingRoadSegments} vehicle road segments have missing coordinates')
    road_tree=STRtree([r[3] for r in scan.roads])
    crossings=[transform(PROJECT.transform,shape(x)) for x in g['officialCrossingAreas']]
    crossings += [transform(PROJECT.transform,shape(f['geometry'])) for f in g.get('supplementalEvidence',{}).get('features',[]) if f['crossing']]
    ctree=STRtree(crossings);now=datetime.now(timezone.utc).isoformat();results=[];counts=Counter()
    for (i,e),coords in zip(edges,lines):
        way=g['ways'][e[3]];proof=e[5];source=scan.ped.get(way.get('osmId'))
        verified=source_verified(g,e,source);conflicts=[]
        if verified:
            line=LineString([PROJECT.transform(*p) for p in coords]);ids=(g['nodes'][e[0]][3],g['nodes'][e[1]][3])
            for hit in road_tree.query(line,predicate='intersects'):
                found=conflict(line,ids,source['tags'],scan.roads[int(hit)],crossings,ctree)
                if found:conflicts.append(found);counts[found['reason']]+=1
        else:counts['source-unverified']+=1
        base=proof.get('gradeAuditBaseRoadCrossingVerified',proof.get('roadCrossingVerified') is True)
        proof['gradeAuditBaseRoadCrossingVerified']=base
        proof['roadCrossingVerified']=bool(base and verified and not conflicts)
        proof['gradeCrossingAudit']={'schemaVersion':1,'sourceVerified':verified,'conflicts':conflicts}
        if not proof['roadCrossingVerified']:results.append({'edgeIndex':i,'wayOsmId':way.get('osmId'),'nodeOsmIds':[g['nodes'][e[0]][3],g['nodes'][e[1]][3]],'sourceVerified':verified,'conflicts':conflicts})
    if counts['source-unverified']:raise ValueError(f"{counts['source-unverified']} grade edges do not match source PBF")
    summary={'checkedAt':now,'checkedEdges':len(edges),'maskedRoadSegments':len(scan.roads),'excludedEdges':len(results),'conflictCounts':dict(counts),'method':'exact OSM node/source checks; shared nodes require official crossing; different explicit layers or implicit ground road treated as map separation only; no real-world safety certification'}
    g['gradeCrossingAudit']=summary
    temp=GRAPH.with_suffix('.json.gz.next');temp.write_bytes(gzip.compress(json.dumps(g,ensure_ascii=False,separators=(',',':')).encode(),6,mtime=0));temp.replace(GRAPH)
    (ROOT/'reports/grade-crossing-audit.json').write_text(json.dumps({'summary':summary,'excluded':results},ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    print(json.dumps(summary,ensure_ascii=True),flush=True)

if __name__=='__main__':main()
