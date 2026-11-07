import {generalSidewalkEdge} from './general-sidewalk.mjs';
// Tiers express routing preference, not a wheelchair-accessibility certification.
export const ROUTE_TIERS = Object.freeze({
 official:{factor:1,color:'#15803D',label:'官方圖資覆蓋',dash:undefined},
 osm:{factor:1.8,color:'#1D4ED8',label:'OSM 人行路段',dash:'9 4'},
 shared:{factor:3.2,color:'#AE501F',label:'人車共道',dash:'12 5'},
 connector:{factor:3.5,color:'#AE501F',label:'入口銜接',dash:'4 6'},
});
export function edgeTier(proof){return proof?.sharedRoad===true?'shared':proof?.connectorVerified===true?'connector':!proof?.gradeSeparatedPedestrian&&proof?.coverage>=.9999&&proof?.maxUncoveredMetres<=.05?'official':'osm';}
export function edgeCostDetails(way,proof,options={}){
 const tier=edgeTier(proof);
 const sourceFactor=tier==='osm' && (options.preferOfficial===false || generalSidewalkEdge(way,proof)) ? 1 : ROUTE_TIERS[tier].factor;
 // Prefer wider recorded paths with a smooth penalty above the hard minimum.
 // This is a tunable ranking preference, not a measurement of safety.
 const minWidth=Number.isFinite(options.minWidth)?options.minWidth:.8;
 const preferredWidth=Math.max(1.5,minWidth+.3);
 const widthPenalty=Number.isFinite(way.width)?Math.min(.8,Math.max(0,(preferredWidth-way.width)/.3*.4)):0;
 return {
  base:1,
  source:sourceFactor-1,
  // Missing width must not appear preferable merely because its narrowness is
  // unknown; retain the separate 0.12 uncertainty cost for either attribute.
  unknown:(way.width==null ? .8 : 0)+((way.width==null||way.slope==null)? .12:0),
  surface:['gravel','unpaved','cobblestone','ground','sand','dirt'].includes(way.surface)?(options.mode==='gentle'?2:.8):0,
  width:widthPenalty,
  slope:options.mode==='gentle'&&way.slope!=null?Math.abs(way.slope)/6:0,
  crossing:options.mode==='crossings'&&way.crossing?3:0,
 };
}
export function edgeCostFactor(way,proof,options={}){
 return Object.values(edgeCostDetails(way,proof,options)).reduce((sum,value)=>sum+value,0);
}
