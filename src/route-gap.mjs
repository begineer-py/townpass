// Locate two real, reachable graph nodes near each other after a complete
// unsuccessful search. They are context, not a connecting path or proof of a
// closure. This function never creates an edge between them.
export function diagnoseRouteGap({graph,adjacency,forwardDist,ends,canTraverse,groundEdge,maxMs=2500,maxComparisons=10000000,maxMetres=250,now=()=>Date.now(),includeIndices=false}){
 const deadline=now()+maxMs,n=graph.nodes.length,back=new Uint8Array(n),queue=new Int32Array(n);
 let head=0,tail=0,work=0;
 const expired=()=>now()>deadline||work>maxComparisons;
 for(const end of ends){if(!back[end.index]){back[end.index]=1;queue[tail++]=end.index;}}
 while(head<tail){
  if((head&255)===0&&expired())return {status:'unavailable'};
  const u=queue[head++];
  for(const [v,ei] of adjacency[u]){work++;if(!back[v]&&!graph.nodes[v][2]&&canTraverse(ei)){back[v]=1;queue[tail++]=v;}}
 }
 const cachedGround=new Int8Array(n);
 function eligible(i){
  if(cachedGround[i])return cachedGround[i]===1;
  const node=graph.nodes[i];
  const yes=!node[2]&&Number.isSafeInteger(node[3])&&adjacency[i].some(([v,ei])=>!graph.nodes[v][2]&&groundEdge(ei)&&canTraverse(ei));
  cachedGround[i]=yes?1:-1;return yes;
 }
 let left=[],right=[];
 for(let i=0;i<n;i++){
  if((i&1023)===0&&expired())return {status:'unavailable'};
  if(!Number.isFinite(forwardDist[i])&&!back[i])continue;
  if(!eligible(i))continue;
  const p=graph.nodes[i],item={i,x:p[1]*100700,y:p[0]*111195};
  if(Number.isFinite(forwardDist[i]))left.push(item);
  if(back[i])right.push(item);
 }
 if(!left.length||!right.length)return {status:'unavailable'};
 // A balanced k-d tree avoids all-pairs comparison for large city networks.
 const stopped={};
 function build(points,depth=0){
  if(!points.length)return null;
  if(expired())throw stopped;
  const axis=depth%2?'y':'x';points.sort((a,b)=>{work++;if((work&4095)===0&&expired())throw stopped;return a[axis]-b[axis]||a.i-b.i;});
  const m=points.length>>1;
  return {point:points[m],axis,left:build(points.slice(0,m),depth+1),right:build(points.slice(m+1),depth+1)};
 }
 let tree;try{tree=build(right);}catch(error){if(error===stopped)return {status:'unavailable'};throw error;}
 if(expired())return {status:'unavailable'};
 let best=maxMetres*maxMetres,bestPair=null;
 function nearest(node,p){
  if(!node||expired())return;
  work++;const q=node.point,dx=p.x-q.x,dy=p.y-q.y,d=dx*dx+dy*dy;
  if(d<best){best=d;bestPair=[p.i,q.i];}
  const delta=p[node.axis]-q[node.axis],first=delta<0?node.left:node.right,second=delta<0?node.right:node.left;
  nearest(first,p);if(delta*delta<best)nearest(second,p);
 }
 for(const p of left){nearest(tree,p);if(expired())return {status:'unavailable'};}
 if(!bestPair)return {status:'unavailable'};
 return {status:'candidate',startSide:graph.nodes[bestPair[0]].slice(0,2),endSide:graph.nodes[bestPair[1]].slice(0,2),
   straightMetres:Math.round(Math.sqrt(best)),...(includeIndices?{startIndex:bestPair[0],endIndex:bestPair[1]}:{})};
}
