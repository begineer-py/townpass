// Tiers express routing preference, not a wheelchair-accessibility certification.
export const ROUTE_TIERS = Object.freeze({
 official:{factor:1,color:'#15803D',label:'官方圖資覆蓋',dash:undefined},
 osm:{factor:1.8,color:'#1D4ED8',label:'OSM 人行路段',dash:'9 4'},
 connector:{factor:3.5,color:'#AE501F',label:'入口銜接',dash:'4 6'},
});
export function edgeTier(proof){return proof?.connectorVerified===true?'connector':!proof?.gradeSeparatedPedestrian&&proof?.coverage>=.9999&&proof?.maxUncoveredMetres<=.05?'official':'osm';}
export function edgeCostFactor(way,proof,options={}){
 const tier=edgeTier(proof);
 let factor=options.preferOfficial===false&&tier!=='connector'?1:ROUTE_TIERS[tier].factor;
 if(way.width==null||way.slope==null)factor+=.12;
 if(['gravel','unpaved','cobblestone','ground','sand','dirt'].includes(way.surface))factor+=options.mode==='gentle'?2:.8;
 if(options.mode==='gentle'&&way.slope!=null)factor+=Math.abs(way.slope)/6;
 if(options.mode==='crossings'&&way.crossing)factor+=3;
 return factor;
}
