"""Check exported edges follow consecutive source OSM nodes, including at the bbox boundary."""
import osmium,json,gzip,os
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent;os.chdir(ROOT);p=ROOT/'public/data/graph.json.gz';g=json.loads(gzip.decompress(p.read_bytes()));wanted={w['osmId']for w in g['ways']if w.get('osmId')};valid=set()
class H(osmium.SimpleHandler):
 def way(self,w):
  if w.id not in wanted:return
  ids=[n.ref for n in w.nodes]
  valid.update((w.id,a,b)for a,b in zip(ids,ids[1:]))
H().apply_file('data/raw/taiwan.osm.pbf')
kept=[];removed=0
for e in g['edges']:
 w=g['ways'][e[3]]
 if w.get('isConnector'):kept.append(e);continue
 a,b=g['nodes'][e[0]][3],g['nodes'][e[1]][3]
 if (w['osmId'],a,b)in valid or(w['osmId'],b,a)in valid:kept.append(e)
 else:removed+=1
g['edges']=kept;p.write_bytes(gzip.compress(json.dumps(g,ensure_ascii=False,separators=(',',':')).encode(),9,mtime=0));report={'checkedEdges':len(kept)+removed,'nonconsecutiveEdgesRemoved':removed,'method':'original OSM way ID and consecutive node IDs'};(ROOT/'reports/source-topology-audit.json').write_text(json.dumps(report,indent=2));print(json.dumps(report),flush=True)
