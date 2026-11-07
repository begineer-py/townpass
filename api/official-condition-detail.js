const upstream='https://tppano.gov.taipei/tp_roadsidewalkplatform_be/api/C00/C10/C11_mapStreetView/detail_v2';
const types=new Set(['missing_noCurbSlope','missing_crosswalkNoRamp']);
export default async function handler(req,res){
 res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');
 const send=(status,data)=>{res.statusCode=status;res.end(JSON.stringify(data));};
 if(req.method!=='GET'){res.setHeader('Allow','GET');return send(405,{error:'METHOD_NOT_ALLOWED'});}
 const q=new URL(req.url,'http://localhost').searchParams,type=q.get('type'),id=q.get('id');
 if(!types.has(type)||!/^\d{1,12}$/.test(id||''))return send(400,{error:'INVALID_CONDITION'});
 try{
  const response=await fetch(upstream,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tableName:type,qgs_fid:id}),signal:AbortSignal.timeout(10000)});
  if(!response.ok)return send(502,{error:'UPSTREAM_UNAVAILABLE'});
  const result=await response.json(),record=result?.data?.data;
  if(result?.code!=='101'||String(record?.qgs_fid)!==id||result?.data?.tableName?.enName!==type)return send(502,{error:'UPSTREAM_INVALID'});
  const clean=x=>typeof x==='string'?x.trim().slice(0,120):null;
  return send(200,{id,type,cause:clean(record.missing_cause)||null,activity:clean(record.areaType)||null});
 }catch{return send(502,{error:'UPSTREAM_UNAVAILABLE'});}
}
