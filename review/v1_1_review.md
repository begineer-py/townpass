# v1.1 審查

## 預設搜尋

**需求**：「使用者只需要看到夠用的資訊,不要無關標語,一個搜尋框預設界面」

```jsx
const [sheetSnap, setSheetSnap] = useState(0);
```

```jsx
<button
  className="omnibox"
  onClick={() => openSearch("explore")}
  aria-label="搜尋地點、捷運站或路名"
>
  <Search size={20} aria-hidden="true" />
  <span>搜尋地點、捷運站或路名</span>
</button>
```

## 字重

**需求**：「使用.agents\skills\townpass-web-design設計」

```css
font-weight: 600;
```

## 測量輸出

**需求**：「不要把開發的無用side code 上傳」

```gitignore
reports/*benchmark*.json
reports/debug-*.md
reports/*-findings.md
```
