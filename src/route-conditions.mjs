import { TPColors } from './tp-colors.mjs';

// These describe available attributes, not a safety certification. In
// particular, missing surface data is not evidence of a smooth surface.
export const ROUTE_CONDITIONS = Object.freeze({
  sidewalk: { label:'一般人行道，寬度與坡度有資料', color:TPColors.primary600, dash:undefined },
  sidewalkUnknown: { label:'一般人行道，寬度或坡度未知', color:TPColors.primary600, dash:undefined },
  sidewalkRough: { label:'一般人行道，路面可能較顛簸', color:TPColors.red700, dash:undefined },
  sidewalkRoughUnknown: { label:'一般人行道，路面可能較顛簸且寬度或坡度未知', color:TPColors.red700, dash:undefined },
  shared: { label:'可能人車共行，通行條件未確認', color:TPColors.secondary800, dash:'16 5 2 5' },
  sharedUnknown: { label:'可能人車共行，通行條件及寬度或坡度未知', color:TPColors.secondary800, dash:'16 4 2 4 2 4' },
  sharedRough: { label:'可能人車共行，通行條件未確認，路面可能較顛簸', color:TPColors.red700, dash:'16 4 6 4' },
  sharedRoughUnknown: { label:'可能人車共行，通行條件未確認，路面可能較顛簸，寬度或坡度未知', color:TPColors.red700, dash:'16 4 6 4 2 4' },
  crossing: { label:'過街', color:TPColors.primary900, dash:'2 5' },
  approach: { label:'起終點銜接', color:TPColors.grayscale700, dash:'10 5 2 5 2 5' },
});

export function conditionForSegment(segment) {
  // Missing flags are unknown, including when loading older route objects.
  const unknown = segment?.unknownWidth !== false || segment?.unknownSlope !== false;
  const rough = segment?.roughSurface === true;
  if (segment?.crossing === true) return 'crossing';
  if (segment?.sharedRoad === true)
    return rough ? (unknown ? 'sharedRoughUnknown' : 'sharedRough') : (unknown ? 'sharedUnknown' : 'shared');
  return rough ? (unknown ? 'sidewalkRoughUnknown' : 'sidewalkRough') : (unknown ? 'sidewalkUnknown' : 'sidewalk');
}

// Official route geometries have no per-edge attributes. Verification proves
// polygon coverage, not sidewalk tagging, width, slope, or surface quality.
export function fallbackRouteCondition() {
  return 'sidewalkUnknown';
}
