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
    // 縮放 17 起地圖會畫自己的店家名稱，OpenStreetMap 圖磚上的店名會重複，
    // 改用國土測繪中心「無文字」電子地圖，再疊「道路路網」（只有路名）。
    close: {
      minZoom: 17,
      url: `${nlsc}/EMAPX99/default/GoogleMapsCompatible/{z}/{y}/{x}`,
      overlay: `${nlsc}/ROAD/default/GoogleMapsCompatible/{z}/{y}/{x}`,
      attribution: credit.replace("影像", "電子地圖"),
    },
  },
  aerial: {
    label: "航照",
    url: `${nlsc}/PHOTO2/default/GoogleMapsCompatible/{z}/{y}/{x}`,
    attribution: credit,
  },
};
