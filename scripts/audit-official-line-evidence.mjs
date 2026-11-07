// Read-only diagnostic: geometry checks alone do not establish connectivity,
// level, physical access or present-day passability.
import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {polygonConnectorChecker,roadConnectorChecker} from '../src/geometry.mjs';
import {officialGeometryEvidence} from '../src/supplemental-evidence.mjs';

const hash=b=>createHash('sha256').update(b).digest('hex');
const graphBytes=fs.readFileSync('public/data/graph.json.gz'),lineBytes=fs.readFileSync('public/data/sidewalks.json.gz');
const graph=JSON.parse(gunzipSync(graphBytes)),data=JSON.parse(gunzipSync(lineBytes));
const {areas,crossings}=officialGeometryEvidence(graph),covered=polygonConnectorChecker(areas),roadClear=roadConnectorChecker(graph.roadGeometries,crossings);
const count={lines:0,segments:0,invalidLines:0,zeroLength:0,covered:0,roadClear:0,both:0};
const metres={total:0,covered:0,roadClear:0,both:0};
for(const row of data.lines){
 if(!Array.isArray(row)||row.length<8||(row.length-4)%2){count.invalidLines++;continue;}
 count.lines++;
 for(let i=6;i+1<row.length;i+=2){
  const a=[row[i-2]/data.scale,row[i-1]/data.scale],b=[row[i]/data.scale,row[i+1]/data.scale];
  const length=Math.hypot((b[0]-a[0])*111195,(b[1]-a[1])*100700);
  if(!Number.isFinite(length)||length===0){count.zeroLength++;continue;}
  count.segments++;metres.total+=length;
  const c=covered(a,b),r=roadClear(a,b);
  if(c){count.covered++;metres.covered+=length;}
  if(r){count.roadClear++;metres.roadClear+=length;}
  if(c&&r){count.both++;metres.both+=length;}
 }
 if(count.lines%10000===0)console.log(JSON.stringify({progress:count.lines,total:data.lines.length}));
}
const codePaths=['src/geometry.mjs','src/supplemental-evidence.mjs','scripts/audit-official-line-evidence.mjs'];
const report={checkedAt:new Date().toISOString(),sourceFetchedAt:data.fetchedAt,graphSha256:hash(graphBytes),linesSha256:hash(lineBytes),codeHashes:Object.fromEntries(codePaths.map(path=>[path,hash(fs.readFileSync(path))])),method:'Whole original quantized line segments, exact polygon-union and OSM road/crossing checks. A segment must pass end-to-end; length is the sum of segment lengths, not a Taipei ground-truth or route coverage percentage.',limitations:'No guarantee of layer, topology, barriers, endpoint connectivity, actual construction or on-site accessibility. The line source is rounded to 1e-6 degrees. This audit does not authorize route generation.',count,metres};
const target=process.env.AUDIT_OUTPUT||'reports/official-line-evidence.json';fs.writeFileSync(target,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
