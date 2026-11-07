// Coverage refers to the original graph edge. A projected sub-edge inherits
// its parent evidence and is never presented as a pinpoint coverage survey.
export function crossingEvidence(way,proof){
 if(way?.crossing!==true)return null;
 const coverage=proof?.crossingCoverage;
 if(!Number.isFinite(coverage)||coverage<=0)return 'none';
 return coverage>=1?'full':'partial';
}

export function crossingUncertainty(way,proof,coordinates){
 const officialCoverage=crossingEvidence(way,proof);
 if(!officialCoverage||officialCoverage==='full')return null;
 const osm=Number.isSafeInteger(way?.osmId),label=osm?'OSM 過街':'過街';
 return {
  coordinates,
  reason:proof?.derivedFrom!=null?`此${label}的原始路段未被官方過街資料完整覆蓋；拆分後區段的覆蓋情況未確認`:officialCoverage==='partial'?`此${label}路段部分未被官方過街資料覆蓋`:`此${label}路段未被官方過街資料覆蓋`,
  officialCoverage,
  coverageScope:proof?.derivedFrom!=null?'source-edge':'edge',
  osmWayId:osm?way.osmId:null,
 };
}
