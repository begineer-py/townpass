export const travelProfiles = {
  walking: {
    label: "一般步行",
    preferences: { minWidth: 0.6, maxSlope: 15, mode: "balanced" },
  },
  wheelchair: {
    label: "輪椅",
    preferences: { minWidth: 0.9, maxSlope: 8, mode: "gentle" },
  },
  powerWheelchair: {
    label: "電動輪椅",
    preferences: { minWidth: 1.2, maxSlope: 8, mode: "gentle" },
  },
  cane: {
    label: "拐杖",
    preferences: { minWidth: 0.6, maxSlope: 10, mode: "gentle" },
  },
  walker: {
    label: "助行器",
    preferences: { minWidth: 0.8, maxSlope: 6, mode: "gentle" },
  },
  stroller: {
    label: "推嬰兒車",
    preferences: { minWidth: 0.9, maxSlope: 8, mode: "gentle" },
  },
  visual: {
    label: "視障",
    preferences: { minWidth: 0.8, maxSlope: 8, mode: "crossings" },
  },
  hearing: {
    label: "聽障",
    preferences: { minWidth: 0.8, maxSlope: 8, mode: "balanced" },
  },
  limitedDistance: {
    label: "步行距離有限",
    preferences: { minWidth: 0.8, maxSlope: 6, mode: "gentle" },
  },
};
