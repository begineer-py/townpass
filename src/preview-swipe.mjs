export function previewSwipeDirection(start,end){
 if(!start||!end||![start.x,start.y,end.x,end.y].every(Number.isFinite))return 0;
 const dx=end.x-start.x,dy=end.y-start.y;
 return Math.abs(dx)>=45&&Math.abs(dx)>Math.abs(dy)*1.25?(dx<0?1:-1):0;
}
