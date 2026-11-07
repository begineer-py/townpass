"""Download documented public datasets, preserving originals and source provenance."""
import json, urllib.request, time, hashlib, csv, io, sys
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
ROOT=Path(__file__).resolve().parent.parent
RAW=ROOT/'data/raw'; OUT=ROOT/'data/processed'
RAW.mkdir(parents=True,exist_ok=True); OUT.mkdir(parents=True,exist_ok=True)
NOW=datetime.now(timezone.utc).isoformat()
KINDS={1:'坡道',3:'停車場電梯',4:'公園',7:'出入口',8:'友善店家',9:'無障礙廁所',11:'人行道',12:'標線型人行道',13:'行穿線',14:'身障設施',15:'路邊停車場',16:'停車格',18:'公車站',20:'捷運站'}
META='https://data.taipei/dataset/detail?id=2b58f15a-dec6-4b9d-91be-4eaccfda5ae7'
def fetch(url,path):
    if path.exists() and '--refresh' not in sys.argv: return path.read_bytes()
    for attempt in range(3):
        try:
            req=urllib.request.Request(url,headers={'User-Agent':'TownPass-FriendlyPath/0.1 (open-data research)'})
            with urllib.request.urlopen(req,timeout=90) as r: content=r.read()
            path.write_bytes(content); return content
        except Exception:
            if attempt==2: raise
            time.sleep(2+attempt)
def decode(b):
    for enc in ['utf-8-sig','cp950','utf-16']:
        try:return b.decode(enc)
        except UnicodeError:pass
    raise ValueError('Unknown text encoding')
def num(v):
    try:
        n=float(v); return n if n>=0 else None
    except (TypeError,ValueError):return None
def kind_job(kind):
    url=f'https://wheelroute.gov.taipei/wheelrouteApi/api/facility/Get/{kind}'
    try:
        b=fetch(url,RAW/f'wheel-{kind}.json'); rows=json.loads(decode(b)); rows=rows if isinstance(rows,list) else []
        print(f'wheel {kind}: {len(rows)} records',flush=True)
        return kind,rows,{'id':f'wheel-{kind}','name':f'輪行臺北・{KINDS[kind]}','url':META,'endpoint':url,'fetchedAt':NOW,'count':len(rows),'sha256':hashlib.sha256(b).hexdigest(),'status':'ok','updateFrequency':'不定期','observedAt':None}
    except Exception as e:
        print(f'wheel {kind}: {e}',flush=True)
        return kind,[],{'id':f'wheel-{kind}','name':KINDS[kind],'url':META,'status':'error','error':str(e)}
def main():
    facilities=[]; sources=[]
    for kind,rows,meta in ThreadPoolExecutor(max_workers=3).map(kind_job,KINDS):
        sources.append(meta)
        if kind in [11,12,13]:continue
        for i,row in enumerate(rows):
            try:lat=float(row['lat']);lon=float(row['lon'])
            except (ValueError,TypeError,KeyError):continue
            if not(24.94<lat<25.24 and 121.42<lon<121.69):continue
            name=str(row.get('kname') or KINDS[kind]).strip()
            facilities.append({'id':f'w{kind}-{i}','kind':str(kind),'name':name,'lat':round(lat,7),'lon':round(lon,7),'widthCm':num(row.get('width')),'slopePct':num(row.get('slope')),'sourceId':f'wheel-{kind}'})
    extras=[
      ('metro-elevators','87708f6a-a1a0-49ce-9b68-35ae4b135292','ba6b64b1-a387-4b34-93c6-7c3bf2dad3db','捷運電梯位置'),
      ('metro-alerts','649c44eb-60b5-4746-a353-cbdc6651fc09','d884a9c6-f86c-4854-8da7-e6516ddbe612','捷運設施異常公告'),
      ('metro-maintenance','d93aadfb-9f78-4000-a73e-48870481bafc','4f8b6fcd-5508-48fd-9b2f-98308ad1b0c4','捷運電梯維修預排')]
    metro={}
    for key,rid,did,label in extras:
        url=f'https://data.taipei/api/frontstage/tpeod/dataset/resource.download?rid={rid}'
        try:
            b=fetch(url,RAW/f'{key}.csv'); rows=list(csv.DictReader(io.StringIO(decode(b))))
            metro[key]=rows
            sources.append({'id':key,'name':label,'url':f'https://data.taipei/dataset/detail?id={did}','endpoint':url,'fetchedAt':NOW,'count':len(rows),'status':'ok','observedAt':None})
            print(key,len(rows),'columns:',list(rows[0]) if rows else [],flush=True)
        except Exception as e:
            sources.append({'id':key,'name':label,'url':url,'status':'error','error':str(e)})
    # Preserve only public, useful construction fields, never workers' mobile numbers.
    try:
        url='https://tpnco.blob.core.windows.net/blobfs/Todaywork.json'
        b=fetch(url,RAW/'construction.json'); raw=json.loads(decode(b))
        rows=raw if isinstance(raw,list) else raw.get('features',raw.get('data',[]))
        clean=[]
        for row in rows:
            p=row.get('properties',row)
            clean.append({k:p.get(k) for k in ['Ac_no','sno','AppMode','X','Y','AppTime','C_Name','Addr','Cb_Da','Ce_Da','Co_Ti','NPurp','IsBlock','PlanB','Positions'] if k in p})
        (OUT/'construction.json').write_text(json.dumps(clean,ensure_ascii=False),encoding='utf-8')
        sources.append({'id':'construction','name':'臺北市今日施工資訊','url':'https://data.taipei/dataset/detail?id=c208dabd-2da0-4e6d-8dbd-a004b9782b0a','fetchedAt':NOW,'count':len(clean),'status':'ok','updateFrequency':'每10分鐘','snapshot':True})
        print('construction',len(clean),'raw keys',list(rows[0]) if rows else [],flush=True)
    except Exception as e: print('construction:',e,flush=True)
    (OUT/'facilities.json').write_text(json.dumps(facilities,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
    (OUT/'metro.json').write_text(json.dumps(metro,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
    (OUT/'sources.json').write_text(json.dumps({'generatedAt':NOW,'sources':sources,'facilityCount':len(facilities)},ensure_ascii=False,indent=2),encoding='utf-8')
    print('Facilities in Taipei region:',len(facilities),flush=True)
if __name__=='__main__':main()
