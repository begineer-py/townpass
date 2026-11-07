// Diagnostic sample: do not infer traversability or add edges from this audit.
import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {polygonConnectorChecker,roadConnectorChecker} from '../src/geometry.mjs';
import {officialGeometryEvidence} from '../src/supplemental-evidence.mjs';
import {createOfficialConditionIndex} from '../src/official-conditions.mjs';
const input=n=>fs.readFileSync(`public/data/${n}.json.gz`),sha=b=>createHash('sha256').update(b).digest('hex');
const graphBytes=input('graph'),sidewalkBytes=input('sidewalks'),conditionBytes=input('official-conditions');
const graph=JSON.parse(gunzipSync(graphBytes)),sidewalks=JSON.parse(gunzipSync(sidewalkBytes)),data=JSON.parse(gunzipSync(conditionBytes));
const evidence=officialGeometryEvidence(graph),covered=polygonConnectorChecker(evidence.areas),road=roadConnectorChecker(graph.roadGeometries,evidence.crossings),conditions=createOfficialConditionIndex(data);
const results=[];
// Three long lines with >50m discrepancy from proximity audit plus a short
// first source line. These are stress cases, not a random or citywide sample.
for(const index of [0,43737,28847,55065]){
 const row=sidewalks.lines[index],points=[];for(let i=4;i+1<row.length;i+=2)points.push([row[i]/sidewalks.scale,row[i+1]/sidewalks.scale]);
 let length=0,uncoveredSegmentLength=0,roadConflictSegmentLength=0,roadConflictSegments=0;
 for(let i=1;i<points.length;i++){
  const a=points[i-1],b=points[i],d=Math.hypot((a[0]-b[0])*111195,(a[1]-b[1])*100700);length+=d;
  if(!covered(a,b))uncoveredSegmentLength+=d;
  if(!road(a,b)){roadConflictSegmentLength+=d;roadConflictSegments++;}
 }
 results.push({index,start:points[0],end:points.at(-1),vertices:points.length,lengthMetres:length,segmentsNotEntirelyCoveredMetres:uncoveredSegmentLength,roadConflictSegmentMetres:roadConflictSegmentLength,roadConflictSegments,nearbyConditionsWithin2m:conditions.find(points,2).length});
}
const report={checkedAt:new Date().toISOString(),graphSha256:sha(graphBytes),sidewalkSha256:sha(sidewalkBytes),conditionSha256:sha(conditionBytes),method:'Four deliberately selected stress examples; whole original segments checked using current official area and road crossing geometry. Not a complete or random sample. Segment lengths are conservative upper bounds for geometry not fully covered, not exact uncovered lengths.',limitations:'Display source lacks original IDs and elevation attributes; no construction snapshot, source topology, missing road geometry, human field validation, or accessibility verification. A successful geometry test alone does not authorize new route edges.',officialAreas:evidence.areas.length,officialCrossingAreas:evidence.crossings.length,roadLines:graph.roadGeometries.length,results};
const output=process.env.AUDIT_OUTPUT||'reports/official-line-candidate-examples.json';fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({...report,output}));
