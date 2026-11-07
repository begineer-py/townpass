// 規劃好路線後，地圖要把整條路線放在「沒被面板蓋住」的地方。
// 手機：面板會從下方滑到半高（56dvh，內容較少時更矮），所以用面板的目標高度算，不用動畫中的高度。
// 平板與電腦：面板浮在地圖左側，路線要放在面板右邊。
const GAP = 24;
const CONTROLS = 56; // 右側縮放、指南針等按鈕的寬度
const MIN_VISIBLE = 140; // 可視區至少留這麼高／寬，免得 fitBounds 縮得太遠

export function routeFitPadding({
  mapRect,
  panelRect,
  phone,
  viewportHeight,
  sheetFraction = 0.56,
  sheetMax = Infinity,
}) {
  // 上方多留一些：終點旗子畫在點的上方，地圖頂端還有圖資來源文字。
  let top = GAP + 16,
    right = GAP + CONTROLS,
    bottom = GAP,
    left = GAP;
  if (mapRect && panelRect) {
    if (phone) {
      const sheetHeight = Math.min(viewportHeight * sheetFraction, sheetMax);
      const sheetTop = panelRect.bottom - sheetHeight;
      bottom = Math.max(GAP, mapRect.bottom - sheetTop + GAP);
      bottom = Math.min(bottom, mapRect.height - top - MIN_VISIBLE);
    } else if (panelRect.left < mapRect.left + mapRect.width / 2) {
      left = Math.max(GAP, panelRect.right - mapRect.left + GAP);
      left = Math.min(left, mapRect.width - right - MIN_VISIBLE);
    }
  }
  const clean = (v) => Math.max(0, Math.round(v));
  return {
    paddingTopLeft: [clean(left), clean(top)],
    paddingBottomRight: [clean(right), clean(bottom)],
  };
}
