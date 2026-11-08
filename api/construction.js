import {normalizeConstruction,constructionFresh} from '../src/construction.mjs';

export function createConstructionSnapshotSource({fetcher=(...args)=>fetch(...args),now=()=>Date.now()}={}){
 let cached=null,inflight=null;
 const wait=async pending=>{try{return await pending;}catch(error){if(cached&&constructionFresh(cached,now()))return cached;throw error;}};
 return async function getSnapshot(){
  if(cached&&now()-Date.parse(cached.fetchedAt)<120000&&constructionFresh(cached,now()))return cached;
  if(inflight)return wait(inflight);
  const pending=(async()=>{
   const r=await fetcher('https://tpnco.blob.core.windows.net/blobfs/Todaywork.json',{signal:AbortSignal.timeout(15000),cache:'no-store'});
   if(!r.ok)throw Error('upstream');
   const result=normalizeConstruction(await r.json(),r.headers.get('last-modified'),now());
   if(!constructionFresh(result,now()))throw Error('stale');
   cached=result;return result;
  })();
  inflight=pending;
  try{return await wait(pending);}finally{if(inflight===pending)inflight=null;}
 };
}
export const getConstructionSnapshot=createConstructionSnapshotSource();
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json; charset=utf-8');
 const send=(status,value)=>{res.statusCode=status;res.end(JSON.stringify(value));};
 if(req.method!=='GET'){res.setHeader('Allow','GET');return send(405,{error:'METHOD_NOT_ALLOWED'});}
 try{return send(200,await getConstructionSnapshot());}
 catch{return send(503,{error:'CONSTRUCTION_UNAVAILABLE'});}
}
