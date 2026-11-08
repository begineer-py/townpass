import {normalizeConstruction,constructionFresh} from '../src/construction.mjs';
let cached;
export async function getConstructionSnapshot(){
 if(cached&&Date.now()-Date.parse(cached.fetchedAt)<120000&&constructionFresh(cached))return cached;
 const r=await fetch('https://tpnco.blob.core.windows.net/blobfs/Todaywork.json',{signal:AbortSignal.timeout(15000),cache:'no-store'});
 if(!r.ok)throw Error('upstream');
 const result=normalizeConstruction(await r.json(),r.headers.get('last-modified'));
 if(!constructionFresh(result))throw Error('stale');
 cached=result;return result;
}
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json; charset=utf-8');
 const send=(status,value)=>{res.statusCode=status;res.end(JSON.stringify(value));};
 if(req.method!=='GET'){res.setHeader('Allow','GET');return send(405,{error:'METHOD_NOT_ALLOWED'});}
 try{return send(200,await getConstructionSnapshot());}
 catch{return send(503,{error:'CONSTRUCTION_UNAVAILABLE'});}
}
