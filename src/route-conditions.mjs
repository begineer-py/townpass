import { TPColors } from './tp-colors.mjs';

// These describe available attributes, not a safety certification. In
// particular, missing surface data is not evidence of a smooth surface.
export const ROUTE_CONDITIONS = Object.freeze({
  known: { label:'寬度與坡度有資料', color:TPColors.primary700, dash:undefined },
  unknown: { label:'寬度或坡度未知', color:TPColors.orange700, dash:'3 7' },
  rough: { label:'路面可能較顛簸', color:TPColors.red700, dash:'14 5 3 5' },
  roughUnknown: { label:'路面可能較顛簸，寬度或坡度未知', color:TPColors.red700, dash:'3 4 12 4' },
  approach: { label:'起終點銜接', color:TPColors.grayscale700, dash:'10 5 2 5 2 5' },
});

export function conditionForSegment(segment) {
  // Missing flags are unknown, including when loading older route objects.
  const unknown = segment?.unknownWidth !== false || segment?.unknownSlope !== false;
  const rough = segment?.roughSurface === true;
  return rough ? (unknown ? 'roughUnknown' : 'rough') : (unknown ? 'unknown' : 'known');
}
