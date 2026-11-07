// A capacity failure is a result for the caller's request, not a successful
// partial route and not a missing connection.
export function projectionLimitResponse(type,id){
 const response=type==='nearby-positions'?'nearby-positions':type==='avoid-official-condition'?'avoid-official-condition':type==='verify-official'?'verified-official':'route';
 return {type:response,id,result:{error:'PROJECTION_LIMIT'}};
}
