// Collapse viewport, data, and rotation updates into one marker redraw.
export function createMapRedrawScheduler(redraw, {delay=60, setTimer=setTimeout, clearTimer=clearTimeout}={}) {
 let timer=null,active=true;
 return {
  schedule() {
   if(!active)return;
   if(timer!==null)clearTimer(timer);
   timer=setTimer(()=>{timer=null;if(active)redraw();},delay);
  },
  dispose() {active=false;if(timer!==null)clearTimer(timer);timer=null;},
 };
}
