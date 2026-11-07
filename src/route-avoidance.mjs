import { STEP_DIAGNOSTIC } from "./routing.mjs";

export function stairDetails(route) {
  const used = new Set();
  return (route?.steps || [])
    .filter((step) => step.highway === "steps")
    .filter((step) => {
      const key = `${step.way}:${step.lat}:${step.lon}`;
      if (used.has(key)) return false;
      used.add(key);
      return true;
    })
    .map((step) => ({
      way: step.way,
      name: step.name || "未命名階梯",
      lat: step.lat,
      lon: step.lon,
      distance: Math.round(step.distance || 0),
    }))
    .filter((step) => Number.isFinite(step.lat) && Number.isFinite(step.lon));
}

// This unrestricted result is diagnostic only. It identifies stair segments
// considered by the graph; it is never returned as a navigable route.
export function diagnoseAvoidedStairs(router, start, end, options = {}) {
  const candidate = router(start, end, {
    ...options,
    avoidSteps: false,
    stepDiagnostic: STEP_DIAGNOSTIC,
  });
  if (candidate?.error) return [];
  return stairDetails(candidate);
}
