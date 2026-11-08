const valid=p=>Array.isArray(p)&&p.length>=2&&p.slice(0,2).every(Number.isFinite);
const xy=p=>[p[1]*100700,p[0]*111195];

// Project only onto the actual displayed route; do not invent a road or use
// stale/poor GPS to advance a turn instruction.
function project(point,line,minAlong=0){
 const [x,y]=xy(point);let cumulative=0,best=null;
 for(let i=1;i<line.length;i++){
  const [ax,ay]=xy(line[i-1]),[bx,by]=xy(line[i]),dx=bx-ax,dy=by-ay,len=Math.hypot(dx,dy);if(!len)continue;
  const t=Math.max(0,Math.min(1,((x-ax)*dx+(y-ay)*dy)/(len*len))),along=cumulative+len*t,distance=Math.hypot(x-ax-t*dx,y-ay-t*dy);
  if(along+1>=minAlong&&(!best||distance<best.distance))best={along,distance};cumulative+=len;
 }
 return {best,total:cumulative};
}
// Heading comes from the route ahead, not a stationary device's noisy compass.
export function navigationBearing(line,along){
 if(!Array.isArray(line)||line.length<2||!line.every(valid)||!Number.isFinite(along)||along<0)return null;
 const pointAt=distance=>{let done=0;for(let i=1;i<line.length;i++){const a=xy(line[i-1]),b=xy(line[i]),length=Math.hypot(b[0]-a[0],b[1]-a[1]);if(!length)continue;if(done+length>=distance){const t=Math.min(1,Math.max(0,(distance-done)/length));return [a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];}done+=length;}return xy(line.at(-1));};
 const a=pointAt(along),b=pointAt(along+12),dx=b[0]-a[0],dy=b[1]-a[1];
 return Math.hypot(dx,dy)<1?null:(Math.atan2(dx,dy)*180/Math.PI+360)%360;
}
export function navigationProgress(route,position,previous=0){
 const line=route?.coordinates;if(!Array.isArray(line)||line.length<2||!line.every(valid)||!Number.isFinite(position?.lat)||!Number.isFinite(position?.lon)||!Number.isFinite(position?.accuracy)||position.accuracy<0||position.accuracy>30)return null;
 const {best,total}=project([position.lat,position.lon],line,Math.max(0,previous-20));
 if(!best||!total||best.distance>Math.max(25,position.accuracy*1.5))return null;
 const along=Math.min(total,Math.max(previous,best.along)),routeDistance=Number.isFinite(route.distanceMetres)?route.distanceMetres:route.distance,scale=Number.isFinite(routeDistance)&&routeDistance>0?routeDistance/total:1;
 let prior=0,next=null;
 for(const step of route.steps||[]){
  if(!Number.isFinite(step?.lat)||!Number.isFinite(step?.lon))continue;
  const match=project([step.lat,step.lon],line,prior);if(!match.best||match.best.distance>25)continue;prior=Math.max(prior,match.best.along);
  if(prior>=along-5&&['左轉','右轉','迴轉'].includes(step.turn)){next={step,distanceMetres:Math.max(0,(prior-along)*scale)};break;}
 }
 const remainingMetres=Math.max(0,(total-along)*scale),[ex,ey]=xy(line.at(-1)),[px,py]=xy([position.lat,position.lon]);
 const arrived=remainingMetres<=8&&Math.hypot(px-ex,py-ey)<=Math.max(8,Math.min(15,position.accuracy));
 return {along,remainingMetres,next,arrived,bearing:arrived?null:navigationBearing(line,along)};
}
export function estimatedWalkingMinutes(metres){return Number.isFinite(metres)&&metres>=0?Math.max(1,Math.ceil(metres/48)):null;}
