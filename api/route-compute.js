import { getConstructionSnapshot } from './construction.js';
import { createRoutePool } from '../server/route-pool.mjs';
import { compareSidewalkRouteScores, chooseSidewalkImprovement } from '../src/sidewalk-route-choice.mjs';
import { planOfficialRoute } from '../server/official-plan.mjs';

const pool=createRoutePool();
const types=new Set(['route','plan-places','verify-official','reference-route','snap-map-point','nearby-positions','avoid-official-condition','avoid-construction','compare-sidewalk','official-plan']);
const responseType=type=>['plan-places','official-plan'].includes(type)?'route':type==='verify-official'?'verified-official':type;
const validPoint=p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)&&p[0]>=24.9&&p[0]<=25.3&&p[1]>=121.4&&p[1]<=121.8;
const validPlace=p=>p&&validPoint([p.lat,p.lon]);
export function validRouteTask(task){
 if(!task||typeof task!=='object'||!types.has(task.type)||!(Number.isSafeInteger(task.id)||typeof task.id==='string'&&task.id.length<=80))return false;
 if(task.options!=null&&(typeof task.options!=='object'||Array.isArray(task.options)))return false;
 if(task.options?.avoidPoints!=null&&(!Array.isArray(task.options.avoidPoints)||task.options.avoidPoints.length>5000||!task.options.avoidPoints.every(validPoint)))return false;
 if(['plan-places','nearby-positions','avoid-official-condition','avoid-construction','official-plan'].includes(task.type)&&(!validPlace(task.startPlace)||!validPlace(task.endPlace)))return false;
 if(['route','verify-official','reference-route','official-plan'].includes(task.type)&&(!validPoint(task.start)||!validPoint(task.end)))return false;
 if(task.type==='route'&&task.via!=null&&!validPoint(task.via))return false;
 if(task.type==='verify-official'&&(!task.route||!Array.isArray(task.route.coordinates)||task.route.coordinates.length>30000))return false;
 if(task.type==='snap-map-point'&&(!validPoint(task.point)||!validPlace(task.place)||!['start','end'].includes(task.side)))return false;
 if(task.type==='compare-sidewalk'&&(!validPlace(task.start)||!validPlace(task.end)||!task.currentRoute||!Array.isArray(task.localCandidates)||task.localCandidates.length>20||!Array.isArray(task.referenceCandidates)||task.referenceCandidates.length>20))return false;
 if(task.type==='avoid-construction'&&(!Array.isArray(task.ids)||task.ids.length>100))return false;
 if(task.type==='avoid-official-condition'&&(!Array.isArray(task.targets)||task.targets.length>100))return false;
 return true;
}
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json; charset=utf-8');
 const send=(status,value)=>{if(!res.writableEnded&&!res.destroyed){res.statusCode=status;res.end(JSON.stringify(value));}};
 if(req.method!=='POST'){res.setHeader('Allow','POST');return send(405,{error:'METHOD_NOT_ALLOWED'});}
 let body;
 try{
  body=req.body;
  if(body==null){let text='';for await(const chunk of req){text+=chunk;if(Buffer.byteLength(text)>2000000)return send(413,{error:'TOO_LARGE'});}body=JSON.parse(text);}
  else if(typeof body==='string')body=JSON.parse(body);
  if(Buffer.byteLength(JSON.stringify(body))>2000000)return send(413,{error:'TOO_LARGE'});
 }catch{return send(400,{error:'INVALID_REQUEST'});}
 const task=body?.task;
 if(!validRouteTask(task)||typeof body.constructionSourceUpdatedAt!=='string')return send(400,{error:'INVALID_REQUEST'});
 const abort=new AbortController();const deadline=setTimeout(()=>abort.abort('timeout'),50000);const close=()=>{if(!res.writableEnded)abort.abort('client');};res.once('close',close);
 try{
  const snapshot=await getConstructionSnapshot();
  if(abort.signal.aborted){if(abort.signal.reason==='timeout')return send(504,{error:'ROUTE_BACKEND_TIMEOUT'});return;}
  if(snapshot.sourceUpdatedAt!==body.constructionSourceUpdatedAt)return send(200,{type:responseType(task.type),id:task.id,result:{error:'CONSTRUCTION_UNAVAILABLE'}});
  if(task.type==='official-plan'){const result=await planOfficialRoute(task,snapshot,{pool,signal:abort.signal});return send(200,{type:'route',id:task.id,result});}
  if(task.type==='compare-sidewalk'){
   const options={currentRoute:task.currentRoute,localCandidates:task.localCandidates,referenceCandidates:task.referenceCandidates,start:task.start,end:task.end,snapshot,referenceSnapshot:snapshot,referenceSourceHash:task.referenceSourceHash};
   const compared=compareSidewalkRouteScores(options),improved=chooseSidewalkImprovement(options);
   const compact=item=>({candidate:{id:item.candidate.id},metrics:item.metrics,score:item.score});
   const comparison=compared.status==='ready'?{status:compared.status,shortestDistanceMetres:compared.shortestDistanceMetres,scoreMeaning:compared.scoreMeaning,current:{metrics:compared.current.metrics,score:compared.current.score},localCandidates:compared.localCandidates.map(compact),referenceCandidates:compared.referenceCandidates.map(compact)}:compared;
   return send(200,{type:task.type,id:task.id,result:{comparison,improvedCandidateId:improved?.candidate?.id??null}});
  }
  const result=await pool.execute({...task,construction:snapshot},{signal:abort.signal});
  return send(200,result);
 }catch(error){
  if(abort.signal.aborted){if(abort.signal.reason==='timeout')return send(504,{error:'ROUTE_BACKEND_TIMEOUT'});return;}
  const code=error?.message==='ROUTING_BUSY'?503:error?.message==='ROUTING_TIMEOUT'?504:503;
  return send(code,{error:'ROUTE_BACKEND_UNAVAILABLE'});
 }finally{clearTimeout(deadline);res.off('close',close);}
}
