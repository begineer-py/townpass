// Older locally saved parking records can predate the data-cleaning pipeline.
// Normalize their display fields without removing IDs or source information.
export function normalizeSavedFacility(place){
 if(!place||typeof place!=='object'||!['15','16','parking'].includes(String(place.kind))||typeof place.name!=='string')return place;
 const original=place.name;
 const pattern=/^TPE\d+\s*[-_]\s*(?:(臺北市|台北市))?([^\s-]{1,4}區)\s*[-_]\s*/i;
 const namePrefix=pattern.exec(original),prefix=namePrefix||pattern.exec(String(place.sourceName||''));
 let name=namePrefix?original.slice(namePrefix[0].length):original;
 const counts=/[（(]\s*(?:大型車|小型車|機車|汽車|充電格位)\s*[:：]/.exec(name);
 let parkingDetails=place.parkingDetails;
 if(counts){
  const detail=name.slice(counts.index).trim();name=name.slice(0,counts.index).trim();
  if(!parkingDetails)parkingDetails=((detail.startsWith('(')&&detail.endsWith(')'))||(detail.startsWith('（')&&detail.endsWith('）')))?detail.slice(1,-1):detail;
 }
 if(!name||(!prefix&&!counts))return place;
 return {...place,name,...(parkingDetails?{parkingDetails}:{}),...(prefix&&!place.district?{district:`${prefix[1]||''}${prefix[2]}`} : {}),sourceName:place.sourceName||original};
}
