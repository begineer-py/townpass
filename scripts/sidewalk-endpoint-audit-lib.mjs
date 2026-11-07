// Canonical decimal tokens without rounding or conversion to floating point.
export function decimalKey(token) {
 const m=/^([+-]?)(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:[eE]([+-]?\d+))?$/.exec(String(token));
 if(!m)throw Error('INVALID_DECIMAL_TOKEN');
 const fraction=m[3]??m[4]??'';
 let digits=((m[2]||'')+fraction).replace(/^0+/,'');
 if(!digits)return '0';
 let exponent=Number(m[5]||0)-fraction.length;
 while(digits.endsWith('0')){digits=digits.slice(0,-1);exponent++;}
 return `${m[1]==='-'?'-':''}${digits}e${exponent}`;
}
export const endpointKey=pair=>pair.map(decimalKey).join(',');

export function groupOriginalEndpoints(parts){
 const groups=new Map();
 for(const [lineIndex,part] of parts.entries())for(const [end,coordinate] of [['start',part.coordinates[0]],['end',part.coordinates.at(-1)]]){
  const key=endpointKey(coordinate);if(!groups.has(key))groups.set(key,[]);
  groups.get(key).push({lineIndex,sourceId:part.sourceId,partIndex:part.partIndex,end,coordinate});
 }
 return groups;
}
