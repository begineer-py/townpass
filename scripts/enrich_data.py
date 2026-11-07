import json,csv,io,re
from sync_data import ROOT,RAW,OUT,fetch,decode,NOW
from pyproj import Transformer
fac=json.loads((OUT/'facilities.json').read_text(encoding='utf-8'))
manifest=json.loads((OUT/'sources.json').read_text(encoding='utf-8'))
items=[('toilets','9e0e6ad4-b9f9-4810-8551-0cffd1b915b3','ca205b54-a06f-4b9d-91be-4eaccfda5ae7','臺北市公廁點位資訊'),('metro-exits','61792c82-6609-41b2-9775-3a346934826d','0a3bb422-9eb5-459b-a9d4-138456516183','捷運出入口電梯與坡道座標')]
for key,rid,did,label in items:
    b=fetch(f'https://data.taipei/api/frontstage/tpeod/dataset/resource.download?rid={rid}',RAW/f'{key}.csv')
    rows=list(csv.DictReader(io.StringIO(decode(b))))
    print(key,len(rows),json.dumps(rows[:1],ensure_ascii=True),flush=True)
    for i,row in enumerate(rows):
        try:lon=float(row['經度']);lat=float(row['緯度'])
        except (KeyError,ValueError):continue
        if not (24.94<lat<25.24 and 121.42<lon<121.69):continue
        if key=='toilets':
            try:count=int(float(row.get('無障礙廁座數') or 0))
            except:count=0
            name=row.get('公廁名稱','廁所');kind='toilet' if count>0 else 'public-toilet'
            extra={'address':row.get('公廁地址'),'accessibleCount':count,'careBed':row.get('照護床位置'),'familyCount':row.get('親子廁座數'),'district':row.get('行政區')}
        else:
            name=row.get('出入口電梯/無障礙坡道名稱') or row.get('出入口電梯／無障礙坡道名稱') or list(row.values())[1]
            kind='metro-elevator';extra={'exit':row.get('出入口編號'),'station':re.split('站',name)[0].replace('捷運','')}
        fac.append({'id':f'{key}-{i}','kind':kind,'name':name,'lat':lat,'lon':lon,'sourceId':key,**extra})
    manifest['sources']=[s for s in manifest['sources'] if s['id']!=key]
    manifest['sources'].append({'id':key,'name':label,'url':f'https://data.taipei/dataset/detail?id={did}','count':len(rows),'fetchedAt':NOW,'status':'ok','observedAt':None})
# Wheelroute API widths disagree with documented unit in some records. Retain raw values only.
for p in fac:
    if 'widthCm' in p:p['widthRaw']=p.pop('widthCm');p['widthUnitVerified']=False
transform=Transformer.from_crs(3826,4326,always_xy=True)
construction=json.loads((OUT/'construction.json').read_text(encoding='utf-8'))
for c in construction:
    try:
        lon,lat=transform.transform(float(c['X']),float(c['Y']));c['lon']=round(lon,7);c['lat']=round(lat,7)
    except:pass
(OUT/'construction.json').write_text(json.dumps(construction,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
(OUT/'facilities.json').write_text(json.dumps(fac,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
manifest['facilityCount']=len(fac)
(OUT/'sources.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
