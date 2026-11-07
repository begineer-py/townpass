import {useLayoutEffect} from 'react';
import {isVerifiedNavigationRoute} from './route-trust.mjs';

// Invalidate previous endpoint work before starting a comparison for the new
// resolved endpoints. Both effects must run in this order before paint.
export function useReferenceComparison({start,end,prefs,avoidPoints,tab,graphReady,routing,routeError,route,referenceState,referenceSearch,referenceSnapshot,setReferenceState,referenceAutoAttempt,request,manualRouteSelection,followSession,findReferenceRoute}){
 useLayoutEffect(()=>{
  referenceSearch.current.cancel(false);referenceSnapshot.current=null;setReferenceState({status:'idle'});
 },[start,end,prefs,avoidPoints]);
 useLayoutEffect(()=>{
  if(tab!=='plan'||!start||!end||!graphReady||routing||routeError||!isVerifiedNavigationRoute(route)||route.viaName||followSession.current||manualRouteSelection.current||referenceState.status!=='idle'||referenceAutoAttempt.current===request.current)return;
  if(!route.tierSegments?.some(segment=>segment.sharedRoad===true&&segment.distance>0))return;
  findReferenceRoute(route,true);
 },[tab,start,end,graphReady,routing,routeError,route,referenceState.status]);
}
