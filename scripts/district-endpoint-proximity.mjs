// Pure geometry only: proximity to an official line is not a connection,
// accessible entrance, safe crossing, or evidence of present passability.
export function endpointLineProximity(payload, points, radius=10){
 if(!Array.isArray(payload?.lines)||!Number.isFinite(payload.scale)||payload.scale<=0||!Number.isFinite(radius)||radius<=0)throw Error('INVALID_OFFICIAL_LINES');
 const scale=payload.scale,latPad=radius/111195,lonPad=radius/100700;
 return points.map(point=>{
  if(!point?.id||!Number.isFinite(point.lat)||!Number.isFinite(point.lon))throw Error('INVALID_ENDPOINT');
  let best=Infinity;
  const x=point.lon*100700,y=point.lat*111195;
  for(const row of payload.lines){
   if(!Array.isArray(row)||row.length<8||(row.length-4)%2)continue;
   if(row[0]/scale>point.lat+latPad||row[2]/scale<point.lat-latPad||row[1]/scale>point.lon+lonPad||row[3]/scale<point.lon-lonPad)continue;
   for(let i=6;i+1<row.length;i+=2){
    const ax=row[i-1]/scale*100700,ay=row[i-2]/scale*111195,bx=row[i+1]/scale*100700,by=row[i]/scale*111195,dx=bx-ax,dy=by-ay;
    if(![ax,ay,bx,by].every(Number.isFinite))continue;
    const t=Math.max(0,Math.min(1,((x-ax)*dx+(y-ay)*dy)/(dx*dx+dy*dy||1)));
    best=Math.min(best,Math.hypot(x-ax-t*dx,y-ay-t*dy));
   }
  }
  return {id:point.id,nearOfficialLine:best<=radius,nearestWithinRadiusMetres:best<=radius?Math.round(best*100)/100:null};
 });
}
