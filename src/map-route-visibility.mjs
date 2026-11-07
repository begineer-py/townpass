// Hide old or preliminary map paths during a new route and its automatic
// comparison. Explicit detour searches retain their verified current route.
export function mapRouteVisibility({tab,routing,automaticComparisonLoading,route,partialRoute,simpleNoRoute}){
 const pending=routing||automaticComparisonLoading;
 return {route:tab&&!pending?route:null,partialRoute:tab==='plan'&&!pending&&!simpleNoRoute?partialRoute:null,pending};
}
