"""Reclassify isolated shop/amenity-only wheelchair tags, using the same OSM PBF.

This does not make a shop accessible or alter any walking edge. It removes a
false endpoint-snap obstruction only when the point is not a member of *any*
OSM way and carries no road, entrance, barrier or access restrictions.
"""
import gzip, json, os
from datetime import datetime, timezone
from pathlib import Path
import osmium

ROOT=Path(__file__).resolve().parent.parent
GRAPH=ROOT/'public/data/graph.json.gz'
INPUT=Path(os.environ.get('TOWNPASS_OSM_PBF',ROOT/'data/raw/taiwan.osm.pbf'))
DISQUALIFY=('highway','footway','sidewalk','cycleway','junction','traffic_sign','oneway',
 'barrier','kerb','kerb:height','entrance','door','access','foot',
 'access:conditional','foot:conditional','wheelchair:conditional','crossing','railway')

def pure_poi(tags):
    return (tags.get('wheelchair')=='no' and bool(tags.get('shop') or tags.get('amenity'))
            and all(k not in tags for k in DISQUALIFY)
            and not any(k.startswith(('foot:','footway:','sidewalk:','cycleway:','access:','barrier:','kerb:','entrance:','crossing:'))
                        or k in ('oneway:foot','wheelchair:forward','wheelchair:backward') for k in tags))

def select_exemptions(graph, evidence, referenced):
    used={i for edge in graph['edges'] for i in edge[:2]}
    result=[]
    for i,node in enumerate(graph['nodes']):
        if not node[2] or i in used or len(node)<4 or node[3] in referenced:continue
        record=evidence.get(node[3])
        if record is None or not pure_poi(record['tags']):continue
        if abs(node[0]-record['lat'])>1e-7 or abs(node[1]-record['lon'])>1e-7:continue
        result.append(i)
    return result

class Scan(osmium.SimpleHandler):
    def __init__(self,ids):
        super().__init__();self.ids=ids;self.evidence={};self.referenced=set()
    def node(self,n):
        if n.id in self.ids:
            self.evidence[n.id]={'lat':n.location.lat,'lon':n.location.lon,'tags':dict(n.tags)}
    def way(self,w):
        for node in w.nodes:
            if node.ref in self.ids:self.referenced.add(node.ref)

def main():
    g=json.loads(gzip.decompress(GRAPH.read_bytes()))
    if g.get('nodeIdentity')!='OSM node ID; coincident coordinates do not create connectivity':raise ValueError('OSM node identity required')
    # Re-establish the pre-pass state for repeatable re-runs, including when
    # the OSM source or way membership has changed since the previous pass.
    previous=set(g.get('isolatedPoiBlockerAudit',{}).get('reclassifiedNodeIds',[]))
    for n in g['nodes']:
        if len(n)>3 and n[3] in previous:n[2]=1
    used={i for edge in g['edges'] for i in edge[:2]}
    ids={n[3] for i,n in enumerate(g['nodes']) if n[2] and i not in used and len(n)>3 and isinstance(n[3],int)}
    scan=Scan(ids);print(f'Checking {len(ids)} isolated blocked nodes against OSM',flush=True);scan.apply_file(str(INPUT))
    indices=select_exemptions(g,scan.evidence,scan.referenced)
    node_ids=[]
    for i in indices:g['nodes'][i][2]=0;node_ids.append(g['nodes'][i][3])
    g['isolatedPoiBlockerAudit']={'generatedAt':datetime.now(timezone.utc).isoformat(),'source':'OSM PBF with exact node identity and coordinate checks','reclassifiedNodeIds':sorted(node_ids),'method':'isolated blocked shop/amenity wheelchair=no point, exact OSM node ID and coordinates, no road/barrier/entrance/access tags and no OSM way membership; not an accessibility claim'}
    temp=GRAPH.with_suffix('.json.gz.next');temp.write_bytes(gzip.compress(json.dumps(g,ensure_ascii=False,separators=(',',':')).encode(),6,mtime=0));temp.replace(GRAPH)
    print(json.dumps({'reclassified':len(node_ids),'candidates':len(ids),'wayReferenced':len(scan.referenced)},ensure_ascii=True),flush=True)

if __name__=='__main__':main()
