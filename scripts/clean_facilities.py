"""Clean public POI names without discarding source records or routing restrictions.

The legacy packer is deliberately disabled. This tool operates on integrated
POI payloads only and never writes graph, construction or address shards.
"""
from __future__ import annotations
import argparse
import gzip
import hashlib
import html
import json
import math
import os
from pathlib import Path
import re
import tempfile

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / 'public' / 'data'
DISPLAY_KINDS = {'3':'elevator', '4':'park', '7':'entrance', 'entrance':'entrance', '8':'friendly', '9':'toilet',
                 '14':'facility', '15':'parking', '16':'parking', '18':'bus',
                 '20':'station', 'metro-elevator':'elevator', 'elevator':'elevator',
                 'park':'park', 'friendly':'friendly', 'toilet':'toilet',
                 'public-toilet':'public-toilet', 'rest':'rest', 'water':'water',
                 'health':'health', 'parking':'parking', 'facility':'facility'}
GENERIC_NAMES = {'飲水處','飲水台','座椅','椅子','休息座椅','公園','停車場','廁所','公廁','電梯','無障礙廁所','公車站','設施'}
RESTRICTIONS = ('access','foot','wheelchair','level','floor','addr:floor','addr:level',
                'indoor','location','layer','barrier','entrance','door','door:locked',
                'wheelchair:conditional','wheelchair:forward','wheelchair:backward')
CODE = re.compile(r'^(?:TPE\d+|B\d{6,})\s*[-_]\s*', re.I)
DISTRICT = re.compile(r'^(?:臺北市|台北市)?[^\s\-]{1,4}區\s*[-_]\s*')
BR = re.compile(r'<br\s*/?\s*>', re.I)
TAG = re.compile(r'<[^>]+>')
SPACE = re.compile(r'\s+')
PARKING_COUNTS = re.compile(r'[（(]\s*(?:大型車|小型車|機車|汽車|充電格位)\s*[:：]')
ADDRESS = re.compile(r'\s*[-–—]\s*((?:臺北市|台北市).+)$')
PHONE = re.compile(r'^[+()\d\s#分機-]{6,}$')

def tidy(text):
    return SPACE.sub(' ', html.unescape(TAG.sub(' ', str(text or '')))).strip(' \t\r\n\"\'“”')

def clean_record(record):
    p = dict(record)
    for key in ('mapGroupId','mapGroupRepresentative','mapGroupMembers','mapGroupRoutes'):p.pop(key, None)
    original = str(p.get('sourceName', p.get('name', '')) or '')
    pieces = [tidy(part) for part in BR.split(original)]
    name = pieces[0] if pieces else ''
    if len(pieces) > 1:
        if pieces[1] and not p.get('address'): p['address'] = pieces[1]
        if len(pieces) > 2 and pieces[2] and PHONE.fullmatch(pieces[2]) and not p.get('phone'): p['phone'] = pieces[2]
    name = DISTRICT.sub('', CODE.sub('', name)).strip()
    match = ADDRESS.search(name)
    if match and name[:match.start()].strip():
        if not p.get('address'): p['address'] = tidy(match.group(1))
        name = name[:match.start()].strip()
    if DISPLAY_KINDS.get(str(p.get('kind'))) == 'parking':
        counts = PARKING_COUNTS.search(name)
        if counts:
            if not p.get('parkingDetails'):
                detail=name[counts.start():].strip()
                p['parkingDetails']=detail[1:-1] if (detail.startswith('(') and detail.endswith(')')) or (detail.startswith('（') and detail.endswith('）')) else detail
            name = name[:counts.start()].strip()
    while name.endswith(')') and name.count(')') > name.count('('): name = name[:-1].rstrip()
    while name.endswith('）') and name.count('）') > name.count('（'): name = name[:-1].rstrip()
    if name and name != p.get('name'):
        p.setdefault('sourceName', original)
        p['name'] = name
    return p

def canonical(text):
    return re.sub(r'[\s\-–—・·()（）_]', '', str(text or '').replace('臺','台')).casefold()

def distance(a, b):
    return math.hypot((a['lat']-b['lat'])*111195,(a['lon']-b['lon'])*100700)

def restrictions(p):
    # Never hide conflicting known access or level metadata in a merged map pin.
    return tuple((key,str(p[key]).strip().casefold()) for key in RESTRICTIONS if p.get(key) not in (None,''))

GENERIC_KEYS = frozenset(canonical(n) for n in GENERIC_NAMES)

def names_match(a, b, category):
    x,y=canonical(a.get('name')),canonical(b.get('name'))
    if not x or not y or x in GENERIC_KEYS or y in GENERIC_KEYS: return False
    if '?' in x or '?' in y or '\ufffd' in x or '\ufffd' in y: return False
    if category == 'friendly':
        # Similar shop names or equal co-ordinates do not prove the same shop.
        return x==y and a.get('address') and b.get('address') and canonical(a['address'])==canonical(b['address'])
    if x==y:return True
    if category!='parking':return False
    x=x.removeprefix('台北市');y=y.removeprefix('台北市')
    if x==y:return True
    short,long=(x,y) if len(x)<=len(y) else (y,x)
    # A qualifier such as 機車, 出口 or a district may indicate a separate
    # facility; only a missing literal parking suffix is unambiguous here.
    return len(short)>=5 and long.startswith(short) and long[len(short):] in ('車場','場')

def candidate_key(p):
    try:lat,lon=float(p['lat']),float(p['lon'])
    except (KeyError,TypeError,ValueError):return None
    if not math.isfinite(lat) or not math.isfinite(lon):return None
    kind=DISPLAY_KINDS.get(str(p.get('kind')))
    return (kind,math.floor(lat*5000),math.floor(lon*5000)) if kind else None

def nearby_candidates(index,p):
    key=candidate_key(p)
    if key is None:return []
    kind,y,x=key
    return [q for yy in range(y-1,y+2) for xx in range(x-1,x+2) for q in index.get((kind,yy,xx),[])]

def build_index(records):
    index={}
    for p in records:
        key=candidate_key(p)
        if key:index.setdefault(key,[]).append(p)
    return index

def complete_parking_names(records):
    candidates=[p for p in records if p.get('sourceId')=='wheel-16' and canonical(p.get('name','')).endswith('停車場')]
    index=build_index(candidates)
    for p in records:
        if p.get('sourceId')!='wheel-15':continue
        original=canonical(p.get('name',''))
        if len(original)<5 or not original.endswith(('停','停車')):continue
        matches=[q for q in nearby_candidates(index,p) if distance(p,q)<=15 and canonical(q.get('name','')).startswith(original) and restrictions(p)==restrictions(q)]
        full={canonical(q['name']) for q in matches}
        if len(full)!=1:continue
        best=min(matches,key=lambda q:(distance(p,q),str(q.get('id',''))))
        p.setdefault('sourceName',p['name']);p['name']=best['name']
        if best.get('parkingDetails') and not p.get('parkingDetails'):p['parkingDetails']=best['parkingDetails']

def group_records(records):
    # Restrict the grid radius; compare with every member to prevent chaining
    # two locations more than 15m apart into one misleading map marker.
    groups=[];grid={}
    for p in sorted(records,key=lambda row:str(row.get('id',''))):
        key=candidate_key(p);kind=key[0] if key else None
        if not key or not p.get('id') or not names_match(p,p,kind):continue
        y,x=key[1:];ids=set()
        for yy in range(y-1,y+2):
            for xx in range(x-1,x+2):ids.update(grid.get((kind,yy,xx),[]))
        match=None
        for group_id in sorted(ids):
            members=groups[group_id]
            if all(distance(p,q)<=15 and restrictions(p)==restrictions(q) and names_match(p,q,kind) for q in members):match=group_id;break
        if match is None:match=len(groups);groups.append([])
        groups[match].append(p);grid.setdefault(key,set()).add(match)
    for members in groups:
        if len(members)<2:continue
        def priority(p):
            return (-int(bool(p.get('parkingDetails'))),-int(bool(p.get('address'))),-int(bool(p.get('phone'))),str(p['id']))
        representative=min(members,key=priority);group_id=str(representative['id'])
        for p in members:p['mapGroupId']=group_id;p['mapGroupRepresentative']=p is representative
        representative['mapGroupMembers']=[{'id':p['id'],'sourceId':p.get('sourceId')} for p in sorted(members,key=lambda p:str(p['id']))]
        routes=sorted({str(route) for p in members for route in (p.get('routes') or []) if isinstance(route,str) and route.strip()})
        if routes:representative['mapGroupRoutes']=routes
    return sum(len(group) for group in groups if len(group)>1),sum(len(group)>1 for group in groups)

def clean_datasets(facilities,places):
    facilities=[clean_record(p) for p in facilities];places=[clean_record(p) for p in places]
    records=facilities+places;complete_parking_names(records);group_records(records)
    return facilities,places

def stats(records):
    names=[str(p.get('name','')) for p in records if DISPLAY_KINDS.get(str(p.get('kind')))]
    return {'records':len(records),'changedNames':sum('sourceName' in p and p.get('sourceName')!=p.get('name') for p in records),
            'sourceCodeNames':sum(bool(CODE.match(n)) for n in names),'capacityInName':sum(bool(PARKING_COUNTS.search(n)) for n in names),
            'htmlInName':sum(bool(TAG.search(n)) for n in names),'unmatchedClosing':sum((n.endswith(')') and n.count(')')>n.count('(')) or (n.endswith('）') and n.count('）')>n.count('（')) for n in names),
            'addressInName':sum(bool(ADDRESS.search(n)) for n in names),'questionMarkNames':sum('?' in n or '\ufffd' in n for n in names),
            'genericNames':sum(canonical(n) in GENERIC_KEYS for n in names),
            'possibleTruncatedParkingNames':sum(p.get('sourceId')=='wheel-15' and len(str(p.get('name','')))==10 and not canonical(p.get('name','')).endswith('停車場') for p in records),
            'groupedRecords':sum('mapGroupId' in p for p in records),'groups':len({p['mapGroupId'] for p in records if 'mapGroupId' in p})}

def read_gzip(path):
    with gzip.open(path,'rt',encoding='utf-8') as f:return json.load(f)

def write_gzip(path, value):
    blob=json.dumps(value,ensure_ascii=False,separators=(',',':')).encode('utf-8')
    data=gzip.compress(blob,compresslevel=9,mtime=0)
    with tempfile.NamedTemporaryFile(dir=path.parent,delete=False) as f:f.write(data);tmp=f.name
    os.replace(tmp,path)

def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--input',type=Path,default=DATA);parser.add_argument('--output',type=Path,default=DATA);parser.add_argument('--report',type=Path);args=parser.parse_args()
    facilities=read_gzip(args.input/'facilities.json.gz');places=read_gzip(args.input/'places.json.gz')
    if not isinstance(facilities,list) or not isinstance(places,list):raise ValueError('Expected two arrays')
    input_hashes={f:hashlib.sha256((args.input/(f+'.json.gz')).read_bytes()).hexdigest() for f in ['facilities','places']}
    before=stats(facilities+places);out_fac,out_places=clean_datasets(facilities,places);after=stats(out_fac+out_places)
    if [(p.get('id'),p.get('lat'),p.get('lon')) for p in facilities+places] != [(p.get('id'),p.get('lat'),p.get('lon')) for p in out_fac+out_places]:raise ValueError('Source identity or geometry changed')
    args.output.mkdir(parents=True,exist_ok=True);write_gzip(args.output/'facilities.json.gz',out_fac);write_gzip(args.output/'places.json.gz',out_places)
    unresolved=[{'id':p.get('id'),'sourceId':p.get('sourceId'),'name':p.get('name')} for p in out_fac+out_places if DISPLAY_KINDS.get(str(p.get('kind'))) and ('?' in str(p.get('name','')) or '\ufffd' in str(p.get('name','')))]
    report={'inputSha256':input_hashes,'before':before,'after':after,'unresolvedNames':unresolved,'method':'source IDs and coordinates retained; conservative same-category map grouping only; unknown characters remain unchanged'}
    if args.report:args.report.parent.mkdir(parents=True,exist_ok=True);args.report.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'inputSha256':input_hashes,'before':before,'after':after,'unresolvedCount':len(unresolved)},ensure_ascii=False))
if __name__=='__main__':main()
