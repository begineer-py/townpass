"""Build small mobile payloads and lazy address shards from verified downloads."""
# This legacy packer collapses edges without retaining schema-2 route evidence
# and overwrites supplemental facilities. Stop before *any* output is touched.
raise SystemExit('Legacy data:pack is disabled: it removes route safety evidence and supplemental facilities. See handbook/apis/tiered-routing.md for the current graph pipeline.')
from pathlib import Path
import json,gzip,hashlib,re
from collections import defaultdict
ROOT=Path(__file__).resolve().parent.parent;IN=ROOT/'data/processed';OUT=ROOT/'public/data'
OUT.mkdir(exist_ok=True,parents=True);(OUT/'addresses').mkdir(exist_ok=True)
def load(name):return json.loads((IN/f'{name}.json').read_text(encoding='utf-8'))
def write(name,obj,compress=False):
    b=json.dumps(obj,ensure_ascii=False,separators=(',',':')).encode('utf8')
    (OUT/(name+'.json'+('.gz' if compress else ''))).write_bytes(gzip.compress(b,compresslevel=9) if compress else b)
    print(name,len(b),flush=True)
places=load('places');shards=defaultdict(list);keep=[]
for p in places:
    if p['name']==p.get('address'):
        m=re.match(r'(.+?(?:路|街|大道)(?:[一二三四五六七八九十0-9]+段)?)',p['address'])
        if m:
            key=m[1];shards[key].append({'id':p['id'],'name':p['name'],'lat':p['lat'],'lon':p['lon'],'kind':'place','sourceId':'osm'})
    else:keep.append({k:v for k,v in p.items() if v is not None and v!=''})
index=[]
for street,rows in shards.items():
    fid=hashlib.sha1(street.encode()).hexdigest()[:14]
    # Compact rows remove repeated address keys and source IDs.
    (OUT/'addresses'/f'{fid}.json').write_text(json.dumps([[r['name'],r['lat'],r['lon']] for r in rows],ensure_ascii=False,separators=(',',':')),encoding='utf8')
    index.append({'street':street,'file':fid,'count':len(rows)})
write('address-index',index);write('places',keep,True)
facilities=load('facilities');bus={};clean=[]
for p in facilities:
    original=p['name'];name=re.sub(r'^\d+[-_]','',original).strip()
    if p['kind']=='20':
        parts=name.split('-',1);name=parts[0];p['address']=parts[1] if len(parts)>1 else ''
    if p['kind']=='18':
        parts=name.split('-',1)
        if len(parts)>1:
            route=parts[0];name=re.sub(r'\([^)]*\)','',parts[1]).strip()
            key=(name,round(p['lat'],4),round(p['lon'],4))
            if key in bus:bus[key]['routes'].append(route);continue
            p['routes']=[route];bus[key]=p
    p['name']=name or ('路口坡道' if p['kind']=='1' else '通行設施')
    clean.append(p)
write('facilities',clean,True)
for name in ['metro','sources','construction']:write(name,load(name),True)
# Collapse same-way degree-two nodes without losing the actual path geometry.
g=load('graph');adj=defaultdict(list)
for i,e in enumerate(g['edges']):adj[e[0]].append(i);adj[e[1]].append(i)
anchors=set(n for n,es in adj.items() if len(es)!=2 or g['nodes'][n][2] or g['edges'][es[0]][3]!=g['edges'][es[1]][3])
visited=set();newedges=[]
def walk(start,ei):
    u=start;length=0;coords=[];way=g['edges'][ei][3]
    while ei not in visited:
        visited.add(ei);e=g['edges'][ei];v=e[1] if e[0]==u else e[0];length+=e[2]
        if length>=40:anchors.add(v)
        if v in anchors:newedges.append([start,v,round(length,1),way,coords]);return
        coords.append(g['nodes'][v][:2]);others=[j for j in adj[v] if j!=ei]
        if not others:anchors.add(v);newedges.append([start,v,round(length,1),way,coords]);return
        u=v;ei=others[0]
    anchors.add(u);newedges.append([start,u,round(length,1),way,coords[:-1]])
for n in list(anchors):
    for ei in adj[n]:
        if ei not in visited:walk(n,ei)
for ei,e in enumerate(g['edges']):
    if ei not in visited:anchors.add(e[0]);walk(e[0],ei)
ids={n:i for i,n in enumerate(sorted(anchors))}
g['nodes']=[g['nodes'][n] for n in sorted(anchors)]
g['edges']=[[ids[a],ids[b],d,w,coords] for a,b,d,w,coords in newedges]
write('graph',g,True)
print('compressed graph',len(g['nodes']),len(g['edges']),'places',len(keep),'address streets',len(shards),flush=True)
