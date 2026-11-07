---
name: townpass-web-design
description: >-
  Town Pass (臺北通 / 城市通) Design System, visual language, UI component specifications,
  and WebView JS Bridge (`flutterObject`) integration guide. Use this skill whenever
  building, styling, or reviewing a web page, web app, or micro-service intended to be
  embedded inside the Town Pass App WebView so that it looks and behaves like a native
  part of the app.
---

# Town Pass Web Micro-Service Design System & Integration Skill

When building a web application or micro-service to be embedded inside **Town Pass (`TPWebView`)**, follow these exact design tokens, typography scales, layout rules, component specs, and WebView JS Bridge protocols so the web page blends seamlessly with the native Flutter shell.

---

## 1. Visual Philosophy & Native WebView Context

1. **No Duplicate Top AppBar**:
   - `TPWebView` in the native Flutter shell **already renders a top `TPAppBar`** (56px height, `#5AB4C5` primary500 background, white centered title `16px SemiBold`, left back arrow when history exists, right `×` close button).
   - **DO NOT** render a duplicate top navigation bar/header with a back button or app title inside your web page unless the page is a multi-tab view (use `TPTabBar` at the top instead).
   - Set `<title>` dynamically (`document.title = '...'`) so `TPWebView.onTitleChanged` updates the native AppBar title automatically (unless overridden by `forceTitle`).
2. **Mobile-First Viewport & Touch Feel**:
   - Default background color of pages: **`#F1F3F4` (`grayscale-50`)** for card/list pages, or **`#FFFFFF` (`white`)** for form/detail pages.
   - Disable browser bounce/rubber-banding and tap highlight flash (`-webkit-tap-highlight-color: transparent; user-select: none;`).
   - Standard horizontal page padding: **`16px`**.
   - Sticky bottom action bars (`TPBottomSheet` style) must respect `env(safe-area-inset-bottom)`.

---

## 2. Color Tokens (`TPColors`)

Always use the official Town Pass color palette. You can copy [townpass-tokens.css](./resources/townpass-tokens.css) directly into the web project.

### Brand Primary (Teal / Cyan)
| Token | Hex | Common Usage |
| :--- | :--- | :--- |
| `--tp-primary-50` | `#EDF8FA` | Secondary button active/pressed background, subtle highlight |
| `--tp-primary-100` | `#DBF1F5` | Tag background, light badge fill |
| `--tp-primary-200` | `#B4E2EA` | Light border, accent illustration |
| `--tp-primary-300` | `#93D4DF` | Secondary accent |
| `--tp-primary-400` | `#71C5D5` | Hover/highlight accent |
| `--tp-primary-500` | `#5AB4C5` | **Brand Primary**: Primary buttons, active tabs, switches, links, WebView AppBar, 48px circle icons |
| `--tp-primary-600` | `#468D9B` | Primary button `:active` / pressed state |
| `--tp-primary-700` | `#356C77` | Dark teal text/icon accent (`#279EAE` also used for 24px dual-tone SVG accents) |
| `--tp-primary-800` | `#22474E` | Deep teal |
| `--tp-primary-900` | `#112629` | Darkest teal surface |
| `--tp-primary-950` | `#081315` | Near-black teal |

### Secondary (Warm Amber / Gold)
| Token | Hex | Common Usage |
| :--- | :--- | :--- |
| `--tp-secondary-50` | `#FDF8ED` | Warm light background |
| `--tp-secondary-100` | `#FCF2DF` | Warm badge fill |
| `--tp-secondary-300` | `#F4D69E` | Warm accent |
| `--tp-secondary-500` | `#F5BA4B` | **Brand Secondary**: Reminder buttons, star/highlight badges |
| `--tp-secondary-600` | `#E7A43C` | Secondary pressed state |
| `--tp-secondary-700` | `#AD7B2B` | Dark amber text |

### Grayscale (Cool Slate Gray)
| Token | Hex | Common Usage |
| :--- | :--- | :--- |
| `--tp-grayscale-50` | `#F1F3F4` | **Default scaffold / page background**, form input fill (`#F3F5F6`) |
| `--tp-grayscale-100` | `#E3E7E9` | **Dividers (`TPLine`)**, disabled button background, inactive switch track |
| `--tp-grayscale-200` | `#CAD1D5` | Borders, inactive switch outline |
| `--tp-grayscale-300` | `#ADB8BE` | Inactive carousel dots, subtle icons |
| `--tp-grayscale-400` | `#91A0A8` | Input placeholder text |
| `--tp-grayscale-500` | `#738995` | Secondary/muted text, disabled button text, list trailing content |
| `--tp-grayscale-600` | `#5E6D76` | Subtitles |
| `--tp-grayscale-700` | `#475259` | **Standard UI label / list title / unselected tab / form label** |
| `--tp-grayscale-800` | `#30383D` | Primary body copy |
| `--tp-grayscale-900` | `#171B1D` | Section headings (`我的服務`, `熱門`) |
| `--tp-grayscale-950` | `#0B0D0E` | Dialog titles and high-emphasis text |

### Semantic Status (Red / Orange)
- **Red (Danger / Alarm)**:
  - `--tp-red-50`: `#FAEEEE`
  - `--tp-red-300`: `#E29494` (Alarm button pressed)
  - `--tp-red-500`: `#D45251` (Error text, Alarm button background, destructive actions)
  - `--tp-red-600`: `#C2332F`
- **Orange (Warning)**:
  - `--tp-orange-50`: `#FDF3EC`
  - `--tp-orange-300`: `#F4B992` (Reminder button pressed)
  - `--tp-orange-500`: `#FD853A` (Warning highlights)

---

## 3. Typography (`TPTextStyles`)

- **Font Family**: `'PingFang TC', 'Noto Sans TC', -apple-system, BlinkMacSystemFont, sans-serif`
- **Weights Used**: Only **`400` (Regular)** and **`600` (SemiBold)**. Avoid `700`/`800` heavy weights to preserve Town Pass's clean civic aesthetic.

| Token Name | Size | Weight | Line Height | Typical Usage |
| :--- | :--- | :--- | :--- | :--- |
| `h1Regular` | `36px` (`2.25rem`) | `400` | `1.25` | Large numeric display / hero metric |
| `h1SemiBold` | `36px` (`2.25rem`) | `600` | `1.25` | Large hero title |
| `h2Regular` | `24px` (`1.5rem`) | `400` | `1.35` | Page title |
| `h2SemiBold` | `24px` (`1.5rem`) | `600` | `1.35` | Modal/Dialog title, major heading |
| `titleSemiBold` | `18px` (`1.125rem`) | `600` | `1.4` | Section header (`我的服務`, `熱門`), dialog subtitle |
| `h3Regular` | `16px` (`1rem`) | `400` | `1.5` | **Button text**, list item title, unselected tab label, input text |
| `h3SemiBold` | `16px` (`1rem`) | `600` | `1.5` | **AppBar title**, card title, selected tab label, form field label |
| `bodyRegular` | `14px` (`0.875rem`) | `400` | `1.5` | Standard body text, descriptions, list subtitles |
| `bodySemiBold` | `14px` (`0.875rem`) | `600` | `1.5` | Emphasized body text, subheadings |
| `caption` | `12px` (`0.75rem`) | `600` | `1.4` | Badges, tags, helper text, timestamps |

---

## 4. Component Specifications

### 4.1 Buttons (`TPButton`)
- **Border Radius**: `10px`
- **Padding**: `8px 16px` (min-height `44px`–`48px`)
- **Typography**: `16px` (`h3Regular`), centered
- **Variants**:
  - **Primary (`TPButton.primary`)**: Background `#5AB4C5`, Text `#FFFFFF`, Active/Pressed `#468D9B`, Border `none`.
  - **Secondary (`TPButton.secondary`)**: Background `#FFFFFF`, Text `#5AB4C5`, Border `1px solid #5AB4C5`, Active/Pressed Background `#EDF8FA`.
  - **Alarm (`TPButton.alarm`)**: Background `#D45251`, Text `#FFFFFF`, Active/Pressed `#E29494`.
  - **Remainder (`TPButton.remainder`)**: Background `#F5BA4B`, Text `#FFFFFF`, Active/Pressed `#F4B992`.
  - **Disabled (`enable: false`)**: Background `#E3E7E9` (`grayscale-100`), Text `#738995` (`grayscale-500`), Border `none`.

### 4.2 Cards (`TPCard`)
- **Background**: `#FFFFFF`
- **Border Radius**:
  - Compact `TPCard`: `8px`–`12px` (or `3px` for flat list cards)
  - Feature / Service Cards: `12px`–`16px`
- **Box Shadow**: `0 4px 12px rgba(0, 0, 0, 0.04)` (`Color(0x0A000000)`)
- **Padding**: `16px`

### 4.3 Tabs (`TPTabView` / `_TPTabBar`)
- **Container Background**: `#FFFFFF`
- **Selected Tab**: Text `#5AB4C5` (`primary-500`), `16px` SemiBold (`600`)
- **Unselected Tab**: Text `#475259` (`grayscale-700`), `16px` Regular (`400`)
- **Tab Padding**: `12px 0`
- **Active Indicator**: Bottom bar `4px` height, `#5AB4C5` color, `border-radius: 2px`, inset horizontally by `16px` (`indicatorPadding: symmetric(horizontal: 16)`). No bottom divider line (`dividerHeight: 0`).

### 4.4 Form Controls (Micro-service Standard)
- **Field Label**: `16px` SemiBold (`#475259`), required asterisk `*` in `#5AB4C5` (`margin-left: 4px`).
- **Text Input / Select / Textarea**:
  - Background: `#F1F3F4` (`grayscale-50`)
  - Border: `1px solid transparent` (Focus: `1px solid #5AB4C5`, Error: `1px solid #D45251`)
  - Border Radius: `10px`
  - Padding: `12px 16px`
  - Text Color: `#30383D` (`grayscale-800`), Placeholder: `#91A0A8` (`grayscale-400`)
- **Switch (`TPSwitch`)**:
  - Dimensions: `48px × 32px`
  - Active Track: `#5AB4C5`, Thumb: `#FFFFFF`
  - Inactive Track: `#E3E7E9`, Outline: `#CAD1D5`, Thumb: `#FFFFFF`
- **Checkbox / Radio**:
  - Accent / Checked Fill: `#5AB4C5`, Unchecked Border: `#91A0A8` (`grayscale-400`)

### 4.5 Lists & Dividers (`TPSettingListTile` & `TPLine`)
- **List Row**: Background `#FFFFFF`, Padding `16px`, flex row with `16px` gap after leading icon, title (`16px` Regular `#475259`), subtitle (`14px` Regular `#475259`), right content (`14px` Regular `#738995`), and chevron icon (`24px`).
- **Divider (`TPLine`)**: `1px solid #E3E7E9` (`grayscale-100`).

### 4.6 Sticky Bottom Action Bar (`TPBottomSheet`)
- **Container**: Background `#FFFFFF`, Padding `10px 16px calc(10px + env(safe-area-inset-bottom))`, Box Shadow `0 0 6px rgba(0, 0, 0, 0.10)` (`Color(0x19000000)`).

### 4.7 Dialogs / Modals (`TPDialog`)
- **Container**: Background `#FFFFFF`, Border Radius `10px`, Padding `24px 24px 0 24px`.
- **Structure**: Optional top icon (`margin-bottom: 24px`), centered title (`24px` SemiBold `#0B0D0E`), body (`14px` Regular `#0B0D0E`, `margin-top: 16px`), full-width horizontal divider (`1px solid #E3E7E9`, `margin-top: 24px`), bottom full-width action button (`48px` height, `16px` SemiBold `#5AB4C5` for confirm or `#738995` for close).

### 4.8 Iconography Style
- **Trending / Circular Feature Icons (`48×48`)**: `<rect width="48" height="48" rx="24" fill="#5AB4C5"/>` with pure `#FFFFFF` vector line/fill paths inside.
- **Compact Dual-Tone Service Icons (`24×24`)**: Primary strokes in `#424343` (dark charcoal) paired with accent elements in `#279EAE` / `#5AB4C5` (teal).

---

## 5. Town Pass WebView JS Bridge (`flutterObject`)

When running inside Town Pass's `TPInAppWebView`, a global `window.flutterObject` is injected by `flutter_inappwebview`. Use this helper pattern to communicate with the host App (with graceful browser fallback for standalone preview):

```ts
export type TPBridgeRequestName =
  | 'userinfo'
  | 'location'
  | 'deviceinfo'
  | 'launch_map'
  | 'phone_call'
  | '1999agree'
  | 'open_link'
  | 'notify'
  | 'qr_code_scan';

export function sendToTownPass<T = unknown>(
  name: TPBridgeRequestName,
  data: unknown = null,
): Promise<T | null> {
  return new Promise((resolve) => {
    const bridge = (window as unknown as { flutterObject?: {
      postMessage: (msg: string) => void;
      addEventListener: (type: 'message', cb: (e: MessageEvent) => void) => void;
      removeEventListener: (type: 'message', cb: (e: MessageEvent) => void) => void;
    } }).flutterObject;

    if (!bridge) {
      console.warn(`[TownPass Bridge Fallback] ${name}`, data);
      resolve(null);
      return;
    }

    const handler = (event: MessageEvent) => {
      try {
        const parsed = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (parsed && parsed.name === name) {
          bridge.removeEventListener('message', handler);
          resolve(parsed.data as T);
        }
      } catch {
        // Ignore unrelated messages
      }
    };

    bridge.addEventListener('message', handler);
    bridge.postMessage(JSON.stringify({ name, data }));
  });
}
```

### Supported Bridge Actions (`name` / `data`)
- **`userinfo`** (`data: null`): Returns the current user's account object (`id`, `name`, `idNumber`, `phoneNumber`, `email`, `address`).
- **`location`** (`data: null`): Returns GPS coordinates from `GeoLocatorService` (`latitude`, `longitude`, `accuracy`, etc.).
- **`deviceinfo`** (`data: null`): Returns device hardware/OS metadata.
- **`launch_map`** (`data: "https://maps.google.com/..."`): Opens external map URL.
- **`phone_call`** (`data: "02-..."`): Triggers `tel://` dialer.
- **`1999agree`** (`data: true`): Checks 1999 user agreement and opens the native 1999 voice call dialog.
- **`open_link`** (`data: "https://..."` or `"local://route_name"`): Opens another `TPWebView` or navigates to a native `TPRoute`.
- **`notify`** (`data: { title: string, content: string }`): Triggers a local push notification (if `content` matches `已訂閱(.+)` or `已取消訂閱(.+)`, also updates `SubscriptionService`).
- **`qr_code_scan`** (`data: null`): Opens the native QR Code scanner page and replies with the scanned string.
