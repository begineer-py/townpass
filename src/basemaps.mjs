// WMTS TileRow is y and TileCol is x. Only visible tiles are requested.
const nlsc = "https://wmts.nlsc.gov.tw/wmts";
const credit =
  '影像 © <a href="https://maps.nlsc.gov.tw/" target="_blank" rel="noopener">內政部國土測繪中心</a>';
export const BASEMAPS = {
  street: {
    label: "地圖",
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution:
      '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
  },
  aerial: {
    label: "航照",
    url: `${nlsc}/PHOTO2/default/GoogleMapsCompatible/{z}/{y}/{x}`,
    attribution: credit,
  },
};
