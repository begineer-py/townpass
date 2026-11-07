// 不利通行（淨寬不足）標示：仿「禁止行人通行」號誌——白底、粗色圈、深色行人、斜線，一眼看出「這裡走不過去」。
// 依市府無障礙通行路線平臺的活動區域分級上色（與平臺圖示同色）：高＝紫、中＝黃、低＝青綠。
// 外緣加一圈細深色邊，黃色、青綠在淺色底圖上也看得清楚。地圖（canvas）和圖層圖例共用同一組圖。
import { TPColors } from "./tp-colors.mjs";

const ink = TPColors.grayscale900;

// 順序對應 SIDEWALK_ISSUE_KINDS 的 0 高、1 中、2 低。
export const ISSUE_LEVELS = [
  { label: "高", color: "#A960E8" },
  { label: "中", color: "#F0B800" },
  { label: "低", color: "#48B8B0" },
];

export const noWalkSvg = (color) => `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 48 48">
<defs><clipPath id="in"><circle cx="24" cy="24" r="16.2"/></clipPath></defs>
<circle cx="24" cy="24" r="23.6" fill="${ink}"/>
<circle cx="24" cy="24" r="18.9" fill="#fff" stroke="${color}" stroke-width="5.6"/>
<g fill="none" stroke="${ink}" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round">
<path d="M24.5 17.5 21.5 28"/>
<path d="M16 23.5 20 19.5 23.5 18.5 28 23"/>
<path d="M21.5 28 17 36.5"/>
<path d="M21.5 28 26.5 31.5 27.5 37.5"/>
</g>
<circle cx="25.6" cy="11.6" r="3.4" fill="${ink}"/>
<g clip-path="url(#in)">
<path d="M8 8 40 40" stroke="${ink}" stroke-width="7.4"/>
<path d="M8 8 40 40" stroke="${color}" stroke-width="4.6"/>
</g>
</svg>`;

export const NO_WALK_URLS = ISSUE_LEVELS.map(
  ({ color }) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(noWalkSvg(color))}`,
);
export const UNKNOWN_NO_WALK_URL = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(noWalkSvg(TPColors.grayscale600))}`;
