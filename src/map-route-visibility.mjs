// Hide old or preliminary map paths during a new route and its automatic
// comparison. Explicit detour searches retain their verified current route.
export function mapRouteVisibility({tab,routing,automaticComparisonLoading,route,partialRoute,simpleNoRoute}){
 const pending=routing||automaticComparisonLoading;
 return {route:tab&&!pending?route:null,partialRoute:tab==='plan'&&!pending&&!simpleNoRoute?partialRoute:null,pending};
}

// Navigation hides display overlays only; saved preferences and route safety
// checks remain unchanged and are restored when returning to route choices.
export function routeViewLayers({stage,hideMapIcons,showOfficialSidewalk,showConstruction}){
 const focus=stage==='preview'||stage==='navigation';
 return {focus,hideMapIcons:!!hideMapIcons||focus,showOfficialSidewalk:!!showOfficialSidewalk&&!focus,showConstruction:!!showConstruction&&!focus,animateRoute:stage==='preview'};
}
