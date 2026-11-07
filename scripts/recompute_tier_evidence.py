"""Recompute tier coverage using polygon unions, not duplicate overlap sums."""
import gzip,json
from pathlib import Path
from datetime import datetime,timezone
from shapely.geometry import shape,LineString
from shapely.ops import transform
from shapely import union_all
from shapely.strtree import STRtree
from pyproj import Transformer
ROOT=Path(__file__).resolve().parent.parent;p=ROOT/'public/data/graph.json.gz';g=json.loads(gzip.decompress(p.read_bytes()));project=Transformer.from_crs(4326,3826,always_xy=True)
areas=[transform(project.transform,shape(x))for x in g['officialAreas']]+[transform(project.transform,shape(f['geometry']))for f in g.get('supplementalEvidence',{}).get('features',[])]
cross=[transform(project.transform,shape(x))for x in g['officialCrossingAreas']]+[transform(project.transform,shape(f['geometry']))for f in g.get('supplementalEvidence',{}).get('features',[])if f['crossing']]
tree=STRtree(areas);ctree=STRtree(cross)
for i,e in enumerate(g['edges']):
 coords=[g['nodes'][e[0]][:2]]+e[4]+[g['nodes'][e[1]][:2]];line=LineString([project.transform(lon,lat)for lat,lon in coords]);length=line.length
 area=union_all([areas[int(j)]for j in tree.query(line,predicate='intersects')]);crossing=union_all([cross[int(j)]for j in ctree.query(line,predicate='intersects')]);proof=e[5]
 proof['coverage']=round(min(1,line.intersection(area).length/length),6);proof['maxUncoveredMetres']=round(line.difference(area).length,4);proof['crossingCoverage']=round(min(1,line.intersection(crossing).length/length),6)
 if i%60000==0:print('union coverage',i,flush=True)
g['tierEvidenceUpdatedAt']=datetime.now(timezone.utc).isoformat();p.write_bytes(gzip.compress(json.dumps(g,ensure_ascii=False,separators=(',',':')).encode(),9,mtime=0));print('done',len(g['edges']),flush=True)
