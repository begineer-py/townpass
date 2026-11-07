# v1 審查

## 預設搜尋介面

**需求**：「使用者只需要看到夠用的資訊,不要無關標語,一個搜尋框預設界面」

```jsx
<button
  className="map-search-button"
  onClick={() => openSearch("explore")}
  aria-label="搜尋地點、地址或路名"
>
  <Search size={20} aria-hidden="true" />
  <span>搜尋地點、地址或路名</span>
</button>
```

## 首次選擇出行方式與定位

**需求**：「使用者第一次使用時 詢問類型 紀錄到資料庫,使用小紅標標記當前位置」

```jsx
{profileReady && modal === "profile" && (
  <Sheet
    title="設定主要出行方式"
    dismissible={false}
    onClose={() => {}}
  >
    <p>選一種最符合你這次出行需要的方式，之後可隨時調整。</p>
    <label className="select-row profile-select">
      主要出行方式
      <select
        value={profileDraft}
        onChange={(event) => setProfileDraft(event.target.value)}
      >
        {Object.entries(travelProfiles).map(([id, profile]) => (
          <option key={id} value={id}>
            {profile.label}
          </option>
        ))}
      </select>
    </label>
  </Sheet>
)}
```

```js
if (useAsStart) setStart(p);
setCurrentLocation(p);
```

```js
const marker = L.circleMarker([location.lat, location.lon], {
  radius: 7,
  fillColor: TPColors.red500,
  fillOpacity: 1,
}).addTo(ends.current);
```

## 出行方式預設條件

**需求**：「類型」「同時符合多種時，記限制最嚴的一種」

```js
wheelchair: {
  label: "輪椅",
  preferences: { minWidth: 0.9, maxSlope: 8, mode: "gentle" },
},
powerWheelchair: {
  label: "電動輪椅",
  preferences: { minWidth: 1.2, maxSlope: 8, mode: "gentle" },
},
```

## 本機資料庫與搜尋補全

**需求**：「設計簡單資料庫 紀錄曾經用戶路線 自動補全」

```js
export async function saveTrips(profileKey, trips) {
  const key = `trips-${profileKey}`;
  const fallbackKey =
    profileKey === "hhz-profile-local"
      ? "hhz-trips"
      : `hhz-trips-${profileKey.replace("hhz-profile-", "")}`;
  const fallbackSaved = writeFallback(fallbackKey, trips);
  const databaseSaved = await writeRecord("trips", key, trips);
  return fallbackSaved || databaseSaved;
}
```

```js
const recentPlaces = trips
  .flatMap((trip) => [trip.start, trip.end])
  .filter((place) => Number.isFinite(place?.lat) && Number.isFinite(place?.lon));
const list = q
  ? [
      ...recentPlaces.filter((p) =>
        normalize(p.name + " " + (p.address || "")).includes(q),
      ),
      ...data.all.filter((p) =>
        normalize(p.name + " " + (p.address || "")).includes(q),
      ),
    ]
  : [...recentPlaces, ...saved, ...data.fac.filter((p) => p.kind === "20")];
```

## 台北通帳號與出行類型

**需求**：「通過台北通的UserinfoWebMessageHandler記憶用戶是誰和他們的類型」

```js
const user = await requestUserInfo();
const id = user?.id ?? user?.userId;
const digest = await crypto.subtle.digest(
  "SHA-256",
  new TextEncoder().encode(String(id)),
);
```

## 部署文件

**需求**：「把部屬統一到vercel上面的教學放到 /deployment下」

```md
[Vercel 部署](deployment/README.md)
```

## 手冊與編輯器檢視

**需求**：「把人類需要監視的檔案和說明統一放在/handbook內」

```text
handbook/
  intro.md
  current.md
  fronted.md
  apis/data.md
```

**需求**：「設計.vscode自動排除人類不需要看的test檔案」

```json
"files.exclude": {
  "**/tests": true,
  "**/*.test.*": true,
  "**/*.spec.*": true
}
```

## README 與部署說明

**需求**：「Readme.md不應提到部屬方式 而是鏈接到/deployment」

```md
- [Vercel 部署](deployment/README.md)
```
