"""Extract the Taipei pedestrian graph from OSM. Never join unconnected nearby ways."""
import osmium, json, math, re, os
from osm_poi_restrictions import restriction_tags
from pathlib import Path
from datetime import datetime,timezone
ROOT=Path(__file__).resolve().parent.parent
OUT=ROOT/'data/processed'; OUT.mkdir(parents=True,exist_ok=True)
def distance(a,b):
    lat1,lon1=a[:2];lat2,lon2=b[:2]
    return math.hypot((lat1-lat2)*111195,(lon1-lon2)*100700)
def numeric(s):
    try:return float(str(s).replace('%','').replace(' m','').strip())
    except:return None
class Extract(osmium.SimpleHandler):
    def __init__(self):
        super().__init__();self.coords={};self.edges=[];self.ways=[];self.places=[];self.names=set()
    def place(self,t,lat,lon,identity):
        name=t.get('name:zh') or t.get('name')
        amenity=t.get('amenity'); kind=None
        if amenity in ['hospital','clinic','pharmacy']:kind='health'
        elif amenity=='toilets':kind='toilet' if t.get('wheelchair')=='yes' else 'public-toilet'
        elif amenity=='bench':kind='rest'; name=name or '座椅'
        elif amenity=='drinking_water':kind='water';name=name or '飲水處'
        elif t.get('highway')=='elevator':kind='elevator';name=name or '電梯'
        elif t.get('leisure')=='park':kind='park'
        elif t.get('railway') in ['station','subway_entrance']:kind='station'
        elif name and (amenity or t.get('shop') or t.get('tourism') or t.get('office')):kind='place'
        address=''.join(t.get(k,'') for k in ['addr:city','addr:district','addr:street','addr:housenumber'])
        if not name and address:name=address;kind='place'
        if name and kind:
            key=(name,round(lat,4),round(lon,4))
            if key in self.names:return
            self.names.add(key)
            self.places.append({'id':identity,'name':name,'kind':kind,'lat':round(lat,7),'lon':round(lon,7),'address':address,'openingHours':t.get('opening_hours'),'phone':t.get('phone') or t.get('contact:phone'),'sourceId':'osm','osmRestrictionsMatched':True,**restriction_tags(t)})
    def node(self,n):
        lat=n.location.lat;lon=n.location.lon
        if not(24.94<lat<25.24 and 121.42<lon<121.69):return
        t=dict(n.tags)
        # Node constraints retained; e.g. gate/bollard/raised kerb must not be silently passed.
        blocked=t.get('access') in ['private','no'] or t.get('foot')=='no' or t.get('wheelchair')=='no'
        kerb=numeric(t.get('kerb:height'))
        risk=blocked or (kerb is not None and kerb>0.03) or t.get('kerb')=='raised' or t.get('barrier') in ['stile','turnstile','kissing_gate']
        self.coords[n.id]=[round(lat,7),round(lon,7),1 if risk else 0]
        self.place(t,lat,lon,'osm-n'+str(n.id))
    def way(self,w):
        t=dict(w.tags);h=t.get('highway');refs=[n.ref for n in w.nodes]
        local=[self.coords[x] for x in refs if x in self.coords]
        if not local:return
        if (t.get('amenity') or t.get('shop') or t.get('leisure') or t.get('tourism') or t.get('addr:housenumber')):
            self.place(t,sum(x[0] for x in local)/len(local),sum(x[1] for x in local)/len(local),'osm-w'+str(w.id))
        allowed={'footway','pedestrian','path','steps','living_street','residential','service','unclassified','tertiary','tertiary_link','secondary','secondary_link','primary','primary_link','cycleway','track','corridor'}
        if h not in allowed or t.get('area')=='yes' or t.get('access') in ['private','no'] or t.get('foot') in ['no','private']:return
        if h=='cycleway' and t.get('foot') not in ['yes','designated','permissive']:return
        if len(local)<2:return
        name=t.get('name:zh') or t.get('name') or ('行穿線' if t.get('footway')=='crossing' else '人行通道' if h in ['footway','path','corridor'] else '未命名道路')
        idx=len(self.ways)
        self.ways.append({'name':name,'highway':h,'wheelchair':t.get('wheelchair'),'width':numeric(t.get('width') or t.get('est_width')),'slope':numeric(t.get('incline')),'surface':t.get('surface'),'sidewalk':t.get('sidewalk'),'crossing':t.get('footway')=='crossing' or bool(t.get('crossing')),'lit':t.get('lit'),'osmId':w.id,'layer':t.get('layer'),'level':t.get('level'),'bridge':t.get('bridge'),'tunnel':t.get('tunnel')})
        for a,b in zip(refs,refs[1:]):
            if a not in self.coords or b not in self.coords:continue
            d=distance(self.coords[a],self.coords[b])
            if d>0:self.edges.append([a,b,round(d,1),idx])
        if t.get('name') and h not in ['steps','corridor']:
            mid=local[len(local)//2];key=(name,round(mid[0],3),round(mid[1],3))
            if key not in self.names:
                self.names.add(key);self.places.append({'id':'osm-road'+str(w.id),'name':name,'kind':'road','lat':mid[0],'lon':mid[1],'sourceId':'osm'})
print('Reading Taiwan OSM, extracting Taipei pedestrian connectivity...',flush=True)
os.chdir(ROOT)
ex=Extract();ex.apply_file('data/raw/taiwan.osm.pbf')
used=set(x for e in ex.edges for x in e[:2]);ids={n:i for i,n in enumerate(sorted(used))}
nodes=[ex.coords[n] for n in sorted(used)]
edges=[[ids[a],ids[b],d,w] for a,b,d,w in ex.edges]
graph={'generatedAt':datetime.now(timezone.utc).isoformat(),'source':'OpenStreetMap contributors / Geofabrik','bbox':[121.42,24.94,121.69,25.24],'nodes':nodes,'edges':edges,'ways':ex.ways}
(OUT/'graph.json').write_text(json.dumps(graph,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
(OUT/'places.json').write_text(json.dumps(ex.places,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
print(json.dumps({'nodes':len(nodes),'edges':len(edges),'ways':len(ex.ways),'places':len(ex.places)},ensure_ascii=True),flush=True)
