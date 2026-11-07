// 不利通行標示：仿「禁止行人通行」號誌——白底、粗紅圈、深色行人、紅色斜線，一眼看出「這裡走不過去」。
// 地圖（canvas）和圖層圖例共用同一張圖。
import { TPColors } from "./tp-colors.mjs";

const red = TPColors.red600,
  ink = TPColors.grayscale900;

export const NO_WALK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 48 48">
<circle cx="24" cy="24" r="21" fill="#fff" stroke="${red}" stroke-width="5"/>
<g fill="none" stroke="${ink}" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round">
<path d="M24.5 17.5 21.5 28"/>
<path d="M16 23.5 20 19.5 23.5 18.5 28 23"/>
<path d="M21.5 28 17 36.5"/>
<path d="M21.5 28 26.5 31.5 27.5 37.5"/>
</g>
<circle cx="25.6" cy="11.6" r="3.4" fill="${ink}"/>
<path d="M9.6 9.6 38.4 38.4" stroke="${red}" stroke-width="5" stroke-linecap="round"/>
</svg>`;

export const NO_WALK_URL = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(NO_WALK_SVG)}`;
