"""Add ground-level OSM low-class vehicle roads as unconfirmed shared routes.

Only shared node IDs create connections. Every intersection with a different
vehicle way must be an OSM-shared-node junction to another eligible low-class road or
inside an official crossing polygon. Unknown width/slope stay unknown; a
road's width is not the usable walking width. Re-running replaces prior output.
"""
import gzip, json, math, os
from pathlib import Path
from datetime import datetime, timezone
import osmium
from pyproj import Transformer
from shapely.geometry import LineString, Point, shape
from shapely.ops import transform
from shapely.strtree import STRtree
from shapely import union_all
from shared_road_rules import shared_candidate

ROOT=Path(__file__).resolve().parent.parent
path=ROOT/'public/data/graph.json.gz'
project=Transformer.from_crs(4326,3826,always_xy=True)
VEHICLE={'motorway','motorway_link','trunk','trunk_link','primary','primary_link','secondary','secondary_link','tertiary','tertiary_link','residential','unclassified','service','living_street'}

def blocked(tags):
    try: kerb=float(tags.get('kerb:height','0').replace(' m',''))
    except ValueError: kerb=0
    allowed={None,'yes','permissive','designated'}
    return (tags.get('access') not in allowed or tags.get('foot') not in allowed or tags.get('access:conditional') is not None or tags.get('foot:conditional') is not None or tags.get('wheelchair')=='no' or tags.get('wheelchair:conditional') is not None or kerb>0.03 or tags.get('kerb')=='raised' or tags.get('barrier') not in (None,'no','kerb'))

def intersection_allowed(line, aid, bid, wid, road_record, crossings, ctree, coords):
    other,other_candidate,ra,rb,road=road_record
    if other==wid:return True
    inter=line.intersection(road)
    if inter.is_empty:return True
    # A graph junction requires one real OSM node, never coordinate coincidence.
    shared={aid,bid}.intersection((ra,rb))
    if other_candidate and shared and inter.geom_type=='Point' and any(inter.distance(Point(project.transform(*coords[n])))<.001 for n in shared):return True
    hit_cross=[crossings[int(i)] for i in ctree.query(inter,predicate='intersects')]
    return bool(hit_cross) and union_all(hit_cross).covers(inter)

class Extract(osmium.SimpleHandler):
    def __init__(self, candidates):
        super().__init__(); self.candidate_ids={w['osmId'] for w in candidates}; self.coords={}; self.blocked=set(); self.roads=[]; self.way_tags={}
        # Only road segments whose geographic grid cells overlap a candidate
        # can intersect it. Limit GEOS objects without a distance buffer.
        self.cells=set()
        for way in candidates:
            for a,b in zip(way['nodes'],way['nodes'][1:]):
                self.cells.update(self.segment_cells((a['lon'],a['lat']),(b['lon'],b['lat'])))
        if not self.cells: raise ValueError('No shared-road candidates')
        self.cellbox=(min(x for x,y in self.cells),min(y for x,y in self.cells),max(x for x,y in self.cells),max(y for x,y in self.cells))
    @staticmethod
    def segment_cells(a,b):
        x1,x2=sorted((math.floor(a[0]*1000),math.floor(b[0]*1000)))
        y1,y2=sorted((math.floor(a[1]*1000),math.floor(b[1]*1000)))
        return ((x,y) for x in range(x1,x2+1) for y in range(y1,y2+1))
    def node(self,n):
        if 24.94<n.location.lat<25.24 and 121.42<n.location.lon<121.69:
            self.coords[n.id]=(n.location.lon,n.location.lat)
            if blocked(dict(n.tags)): self.blocked.add(n.id)
    def way(self,w):
        tags=dict(w.tags)
        if tags.get('highway') not in VEHICLE: return
        if w.id in self.candidate_ids: self.way_tags[w.id]=tags
        # Read the full road geometry, including endpoints outside the project
        # bounds: a long segment may cross a candidate inside those bounds.
        nodes=[(n.ref,(n.location.lon,n.location.lat) if n.location.valid() else None) for n in w.nodes]
        for (a,pa),(b,pb) in zip(nodes,nodes[1:]):
            if pa is not None and pb is not None and a!=b:
                x1,x2=sorted((math.floor(pa[0]*1000),math.floor(pb[0]*1000)))
                y1,y2=sorted((math.floor(pa[1]*1000),math.floor(pb[1]*1000)))
                if x2<self.cellbox[0] or x1>self.cellbox[2] or y2<self.cellbox[1] or y1>self.cellbox[3]:continue
                if not any(cell in self.cells for cell in self.segment_cells(pa,pb)): continue
                p,q=project.transform(*pa),project.transform(*pb)
                if p!=q:self.roads.append((w.id,shared_candidate(tags),a,b,LineString([p,q])))

def main():
    os.chdir(ROOT)
    g=json.loads(gzip.decompress(path.read_bytes()))
    if g.get('nodeIdentity')!='OSM node ID; coincident coordinates do not create connectivity': raise ValueError('OSM node identity required')
    candidates=json.loads((ROOT/'data/processed/shared-road-candidates.json').read_text(encoding='utf8'))['ways']
    print('Reading OSM vehicle junctions and barriers',flush=True)
    ex=Extract(candidates);ex.apply_file(os.environ.get('TOWNPASS_OSM_PBF',str(ROOT/'data/raw/taiwan.osm.pbf')),locations=True)
    roads=[r[4] for r in ex.roads];tree=STRtree(roads)
    crossings=[transform(project.transform,shape(x)) for x in g['officialCrossingAreas']]
    crossings += [transform(project.transform,shape(f['geometry'])) for f in g.get('supplementalEvidence',{}).get('features',[]) if f['crossing']]
    ctree=STRtree(crossings)
    # Remove old output so regeneration is idempotent; keep indices of all other ways.
    old_ways=g['ways']
    g['edges']=[e for e in g['edges'] if old_ways[e[3]].get('source')!='osm-shared-street']
    keep=[i for i,w in enumerate(old_ways) if w.get('source')!='osm-shared-street']
    remap={old:new for new,old in enumerate(keep)}
    g['ways']=[old_ways[i] for i in keep]
    for e in g['edges']: e[3]=remap[e[3]]
    by_id={n[3]:i for i,n in enumerate(g['nodes']) if len(n)>3 and isinstance(n[3],int)}
    def index(n):
        nid=n['id']
        if nid not in by_id:
            by_id[nid]=len(g['nodes']);lon,lat=ex.coords[nid];g['nodes'].append([round(lat,7),round(lon,7),int(nid in ex.blocked),nid])
        return by_id[nid]
    added=rejected=0
    for candidate in candidates:
        wid=candidate['osmId'];tags=ex.way_tags.get(wid,{});nodes=candidate['nodes']
        # Re-check data instead of trusting a prior candidate extraction.
        if not shared_candidate(tags): continue
        wi=len(g['ways']);g['ways'].append({'name':tags.get('name:zh') or tags.get('name') or '未命名道路','highway':tags['highway'],'source':'osm-shared-street','osmId':wid,'access':tags.get('access'),'foot':tags.get('foot'),'wheelchair':tags.get('wheelchair'),'width':None,'slope':None,'surface':tags.get('surface'),'sidewalk':tags.get('sidewalk'),'layer':tags.get('layer'),'level':tags.get('level'),'bridge':tags.get('bridge'),'tunnel':tags.get('tunnel'),'crossing':False})
        for a,b in zip(nodes,nodes[1:]):
            aid,bid=a['id'],b['id']
            if aid in ex.blocked or bid in ex.blocked or aid not in ex.coords or bid not in ex.coords: rejected+=1;continue
            # A stale candidate file cannot define a valid intersection search.
            if any(abs(n['lat']-ex.coords[n['id']][1])>1e-7 or abs(n['lon']-ex.coords[n['id']][0])>1e-7 for n in (a,b)): raise ValueError('Stale shared candidates: run extract_shared_candidates.py first')
            # A graph built from a different PBF must not attach stale geometry.
            if any(nid in by_id and (abs(g['nodes'][by_id[nid]][0]-ex.coords[nid][1])>1e-7 or abs(g['nodes'][by_id[nid]][1]-ex.coords[nid][0])>1e-7 or g['nodes'][by_id[nid]][2]) for nid in (aid,bid)): rejected+=1;continue
            p,q=project.transform(*ex.coords[aid]),project.transform(*ex.coords[bid]);line=LineString([p,q]);length=line.length
            if length<.001: continue
            conflict=False
            for hit in tree.query(line,predicate='intersects'):
                if not intersection_allowed(line,aid,bid,wid,ex.roads[int(hit)],crossings,ctree,ex.coords):conflict=True;break
            if conflict:rejected+=1;continue
            proof={'schemaVersion':2,'coverage':0,'maxUncoveredMetres':round(length,2),'crossingCoverage':0,'roadCrossingVerified':True,'crossingVerified':True,'sharedRoad':True,'sourceTopologyVerified':True,'junctionsVerified':True,'roadIntersectionsVerified':True,'barriersVerified':True}
            g['edges'].append([index(a),index(b),round(length,4),wi,[],proof]);added+=1
    g['sharedRoadEvidence']={'source':'OpenStreetMap living_street/residential/unclassified/service','generatedAt':datetime.now(timezone.utc).isoformat(),'count':added,'rejectedSegments':rejected,'method':'original OSM node topology; mapped barriers excluded; other road intersections require official crossing or shared-node candidate-road junction; unknown pedestrian and physical accessibility'}
    temp=path.with_suffix('.json.gz.next');temp.write_bytes(gzip.compress(json.dumps(g,ensure_ascii=False,separators=(',',':')).encode(),6,mtime=0));temp.replace(path)
    print(json.dumps(g['sharedRoadEvidence'],ensure_ascii=False),flush=True)
if __name__=='__main__':main()
