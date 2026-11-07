import {endpointKey} from './sidewalk-endpoint-audit-lib.mjs';

class Components {
 constructor(){this.nodes=new Map();this.edges=[];}
 node(key){if(!this.nodes.has(key))this.nodes.set(key,{parent:key,rank:0,degree:0});return this.nodes.get(key);}
 root(key){const node=this.node(key);if(node.parent!==key)node.parent=this.root(node.parent);return node.parent;}
 join(a,b,distance){
  const left=this.node(a),right=this.node(b);left.degree++;right.degree++;let x=this.root(a),y=this.root(b);
  if(x!==y){let nx=this.node(x),ny=this.node(y);if(nx.rank<ny.rank){[x,y]=[y,x];[nx,ny]=[ny,nx];}ny.parent=x;if(nx.rank===ny.rank)nx.rank++;}
  this.edges.push({a,distance});
 }
 summary(){
  const comps=new Map();for(const key of this.nodes.keys()){const root=this.root(key);if(!comps.has(root))comps.set(root,{nodes:0,edges:0,metres:0});comps.get(root).nodes++;}
  for(const edge of this.edges){const c=comps.get(this.root(edge.a));c.edges++;c.metres+=edge.distance;}
  const sorted=[...comps.values()].sort((a,b)=>b.metres-a.metres||b.edges-a.edges);
  const nodeDegrees={};for(const n of this.nodes.values())nodeDegrees[n.degree]=(nodeDegrees[n.degree]||0)+1;
  return {nodes:this.nodes.size,edges:this.edges.length,components:comps.size,nodeDegrees,largestByLength:sorted.slice(0,10),totalMetres:sorted.reduce((n,c)=>n+c.metres,0)};
 }
}

// Only full-part endpoints may coincide across parts. Interior vertices are
// private to their part even if another line passes through their coordinate.
export function buildShadowGraphs(parts,evaluate){
 const source=new Components(),shadow=new Components();let accepted=0,areaRejected=0,roadRejected=0,bothRejected=0,zeroSegments=0,segments=0;
 for(const [line,part] of parts.entries()){
  const points=part.coordinates,coordinates=points.map(pair=>pair.map(Number));
  const vertexKey=i=>i===0||i===points.length-1?`e:${endpointKey(points[i])}`:`i:${line}:${i}`;
  let lineLength=0;
  for(let i=1;i<points.length;i++){
   const a=coordinates[i-1],b=coordinates[i],length=Math.hypot(b[0]-a[0],b[1]-a[1]);lineLength+=length;segments++;
   const from=vertexKey(i-1),to=vertexKey(i);
   if(length===0){zeroSegments++;shadow.join(from,to,0);continue;}
   const {area,road}=evaluate(a,b,line,i-1);
   if(area&&road){accepted++;shadow.join(from,to,length);}
   else {if(!area)areaRejected++;if(!road)roadRejected++;if(!area&&!road)bothRejected++;}
  }
  source.join(vertexKey(0),vertexKey(points.length-1),lineLength);
 }
 return {source:source.summary(),shadow:shadow.summary(),segments,accepted,areaRejected,roadRejected,bothRejected,zeroSegments};
}
