import { TPColors } from './tp-colors.mjs';

// These describe available attributes, not a safety certification. In
// particular, missing surface data is not evidence of a smooth surface.
export const ROUTE_CONDITIONS = Object.freeze({
  known: { label:'其他人行路段，寬度與坡度有資料', color:TPColors.primary700, dash:undefined },
  unknown: { label:'其他人行路段，寬度或坡度未知', color:TPColors.orange700, dash:'3 7' },
  rough: { label:'其他人行路段，路面可能較顛簸', color:TPColors.red700, dash:'14 5 3 5' },
  roughUnknown: { label:'其他人行路段，路面可能較顛簸，寬度或坡度未知', color:TPColors.red700, dash:'3 4 12 4' },
  official: { label:'官方人行面域覆蓋，寬度與坡度有資料', color:TPColors.primary800, dash:'20 4' },
  officialUnknown: { label:'官方人行面域覆蓋，寬度或坡度未知', color:TPColors.primary800, dash:'7 4' },
  officialRough: { label:'官方人行面域覆蓋，路面可能較顛簸', color:TPColors.red700, dash:'13 3 5 3' },
  officialRoughUnknown: { label:'官方人行面域覆蓋，路面可能較顛簸且寬度或坡度未知', color:TPColors.red700, dash:'7 3 13 3' },
  sidewalk: { label:'有記錄的人行道，寬度與坡度有資料', color:TPColors.primary600, dash:'18 3' },
  sidewalkUnknown: { label:'有記錄的人行道，寬度或坡度未知', color:TPColors.primary600, dash:'5 3' },
  sidewalkRough: { label:'有記錄的人行道，路面可能較顛簸', color:TPColors.red700, dash:'11 3 3 3' },
  sidewalkRoughUnknown: { label:'有記錄的人行道，路面可能較顛簸且寬度或坡度未知', color:TPColors.red700, dash:'5 3 11 3' },
  shared: { label:'可能人車共行，通行條件未確認', color:TPColors.secondary800, dash:'16 5 2 5' },
  sharedUnknown: { label:'可能人車共行，通行條件及寬度或坡度未知', color:TPColors.secondary800, dash:'16 4 2 4 2 4' },
  sharedRough: { label:'可能人車共行，通行條件未確認，路面可能較顛簸', color:TPColors.red700, dash:'16 4 6 4' },
  sharedRoughUnknown: { label:'可能人車共行，通行條件未確認，路面可能較顛簸，寬度或坡度未知', color:TPColors.red700, dash:'16 4 6 4 2 4' },
  approach: { label:'起終點銜接', color:TPColors.grayscale700, dash:'10 5 2 5 2 5' },
});

export function conditionForSegment(segment) {
  // Missing flags are unknown, including when loading older route objects.
  const unknown = segment?.unknownWidth !== false || segment?.unknownSlope !== false;
  const rough = segment?.roughSurface === true;
  if (segment?.sharedRoad === true)
    return rough ? (unknown ? 'sharedRoughUnknown' : 'sharedRough') : (unknown ? 'sharedUnknown' : 'shared');
  if (segment?.explicitSidewalk === true)
    return rough ? (unknown ? 'sidewalkRoughUnknown' : 'sidewalkRough') : (unknown ? 'sidewalkUnknown' : 'sidewalk');
  if (segment?.tier === 'official')
    return rough ? (unknown ? 'officialRoughUnknown' : 'officialRough') : (unknown ? 'officialUnknown' : 'official');
  return rough ? (unknown ? 'roughUnknown' : 'rough') : (unknown ? 'unknown' : 'known');
}

// Official route geometries have no per-edge attributes. Verification proves
// polygon coverage, not sidewalk tagging, width, slope, or surface quality.
export function fallbackRouteCondition(route) {
  return route?.geometryVerification === 'official-polygons-and-crossings-v1' ? 'officialUnknown' : 'unknown';
}
