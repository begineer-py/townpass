export async function compareRoutesOnServer({currentRoute,localCandidates,referenceCandidates,start,end,referenceSourceHash,snapshot},signal,fetcher=fetch){
 const task={type:'compare-sidewalk',id:0,currentRoute,localCandidates,referenceCandidates,start,end,referenceSourceHash};
 const response=await fetcher('./api/route-compute',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({task,constructionSourceUpdatedAt:snapshot?.sourceUpdatedAt}),signal,cache:'no-store'});
 if(!response.ok)throw Error('ROUTE_BACKEND_UNAVAILABLE');
 const data=await response.json();
 if(data?.type!=='compare-sidewalk'||data.id!==0||!data.result?.comparison)throw Error('ROUTE_COMPARISON_UNAVAILABLE');
 return data.result;
}
