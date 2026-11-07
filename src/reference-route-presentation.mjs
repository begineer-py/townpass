export const REFERENCE_NOTICE='路側、銜接與樓層未確認';
export const REFERENCE_STYLES=Object.freeze({
  sidewalk:{color:'#5B8996',weight:5,label:'一般人行道'},
  shared:{color:'#765A25',weight:5,dashArray:'16 5 3 5',label:'人車共行'},
  crossing:{color:'#263C46',weight:5,dashArray:'1 5',label:'過街'},
  join:{color:'#AE501F',weight:5,dashArray:'3 6',label:'銜接與入口位置未確認'},
});
const validLine=line=>Array.isArray(line)&&line.length>=2&&line.every(p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)&&p[0]>=24.9&&p[0]<=25.3&&p[1]>=121.4&&p[1]<=121.8);
const distance=(a,b)=>Math.hypot((a[0]-b[0])*111195,(a[1]-b[1])*100700);
const pointOf=p=>Array.isArray(p)?p:p&&[p.lat,p.lon];
const same=(a,b)=>Array.isArray(a)&&Array.isArray(b)&&a.length===2&&b.length===2&&a.every(Number.isFinite)&&b.every(Number.isFinite)&&distance(a,b)<=.05;

// Explicit osm-join metadata retains connector and OSM geometry independent
// of travel direction. Never bridge gaps between separate segments.
export function referenceRouteLines(route,{start,end}={}){
 if(route?.kind!=='official-passageway'||route.navigationAllowed!==true||route.verification!=='official-source-screened-v1'||!Array.isArray(route.segments)||!route.segments.length)return [];
 const first=route.segments[0],last=route.segments.at(-1);
 if(first?.kind!=='endpoint-approach'||first.side!=='start'||last?.kind!=='endpoint-approach'||last.side!=='end')return [];
 if(!validLine(first.coordinates)||!validLine(last.coordinates)||!same(first.coordinates[0],pointOf(start))||!same(last.coordinates.at(-1),pointOf(end)))return [];
 const lines=[];
 for(const [index,segment] of route.segments.entries()){
  const {kind,coordinates}=segment||{};
  if(!validLine(coordinates)||!['official-line','osm','osm-join','source-join','endpoint-approach'].includes(kind))return [];
  if(index&&!same(route.segments[index-1].coordinates?.at(-1),coordinates[0]))return [];
  if((kind==='osm-join'||kind==='source-join')&&(coordinates.length!==2||distance(coordinates[0],coordinates[1])>2.000001))return [];
  const displayKind=kind==='osm-join'||kind==='source-join'||kind==='endpoint-approach'?'join':segment.crossing?'crossing':segment.sharedRoad?'shared':'sidewalk';
  lines.push({kind:displayKind,coordinates,...(segment.approximateCrossing===true?{approximateCrossing:true}:{})});
 }
 return lines;
}

export function referenceRouteDistance(route){
 const distance=route?.distanceMetres;
 if(!Number.isFinite(distance)||distance<0)return null;
 return distance>=1000?`${(distance/1000).toFixed(1)} 公里`:`${Math.round(distance)} 公尺`;
}

export function referenceMetric(value,unit='公尺'){
 return Number.isFinite(value)&&value>=0?`${Math.round(value)} ${unit}`:'未提供';
}
