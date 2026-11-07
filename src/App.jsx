import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  MapPin,
  ArrowUpDown,
  ArrowRight,
  ArrowLeft,
  ChevronRight,
  ChevronDown,
  Navigation,
  LocateFixed,
  Search,
  Plus,
  Minus,
  X,
  Route,
  Heart,
  SlidersHorizontal,
  TrainFront,
  Accessibility,
  Footprints,
  Toilet,
  ArrowUpFromLine,
  Armchair,
  GlassWater,
  TreePine,
  Store,
  Car,
  BusFront,
  Hospital,
  Info,
  Check,
  CheckCircle2,
  AlertTriangle,
  Volume2,
  VolumeX,
  Share2,
  Layers,
  LoaderCircle,
  Bookmark,
  ExternalLink,
  Clock,
  WifiOff,
  Compass,
  HelpCircle,
} from "lucide-react";
import MapView from "./MapView";
import { ROUTING_POLICY } from "./routing.mjs";
import { BASEMAPS } from "./basemaps.mjs";
// Layer-picker preview: the z15 tile covering Taipei Main Station.
const layerThumb = (url) =>
  url.replace("{z}", 15).replace("{x}", 27444).replace("{y}", 14027);
import {
  loadData,
  dataUrl,
  distance,
  formatDistance,
  category,
  labels,
  cleanName,
  normalize,
  readSaved,
  saveLocal,
  currentConstruction,
} from "./data";
import { getLocation } from "./location";
import { addressSearch } from "./address-search";
import { maintenanceText, stationKey, stepText } from "./format.mjs";
const icons = {
  elevator: ArrowUpFromLine,
  toilet: Toilet,
  "public-toilet": Toilet,
  rest: Armchair,
  water: GlassWater,
  park: TreePine,
  friendly: Store,
  ramp: Accessibility,
  entrance: MapPin,
  parking: Car,
  station: TrainFront,
  bus: BusFront,
  health: Hospital,
  facility: Accessibility,
  place: MapPin,
  road: Route,
};
const filters = [
  ["all", "常用設施", Layers],
  ["elevator", "電梯出口", ArrowUpFromLine],
  ["toilet", "無障礙廁所", Toilet],
  ["ramp", "坡道", Accessibility],
  ["rest", "歇歇腳", Armchair],
  ["water", "飲水處", GlassWater],
  ["park", "公園", TreePine],
  ["friendly", "友善店家", Store],
  ["bus", "公車站", BusFront],
  ["parking", "停車設施", Car],
  ["health", "醫療與藥局", Hospital],
];
// Shown before 更多: the four a wheelchair or low-vision user reaches for first.
const MAIN_FILTERS = 4;
const basePrefs = {
  avoidSteps: true,
  minWidth: 0.8,
  maxSlope: 8,
  knownOnly: false,
  officialOnly: false,
  preferOfficial: true,
  mode: "balanced",
  largeText: false,
  contrast: false,
};
function Icon({ kind, ...props }) {
  const C = icons[kind] || MapPin;
  return <C size={20} aria-hidden="true" {...props} />;
}
function Sheet({ title, onClose, children }) {
  const ref = useRef();
  useLayoutEffect(() => {
    const dialog = ref.current;
    const trigger = document.activeElement;
    dialog.showModal();
    return () => {
      dialog.close();
      trigger?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="sheet-dialog"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      aria-label={title}
    >
      <div className="sheet-head">
        <h2>{title}</h2>
        <button className="icon-button" onClick={onClose} aria-label="關閉">
          <X />
        </button>
      </div>
      <div className="sheet-body">{children}</div>
    </dialog>
  );
}
function FacilityRow({ p, from, onSelect, saved, onSave }) {
  const k = category(p),
    sub = labels[k] || "設施";
  return (
    <div className="facility-row">
      <button className="facility-main" onClick={() => onSelect(p)}>
        <span className={`facility-icon ${k}`}>
          <Icon kind={k} />
        </span>
        <span className="facility-copy">
          <strong>{cleanName(p.name)}</strong>
          {(sub !== cleanName(p.name) || p.exit) && (
            <span>
              {sub}
              {p.exit ? ` · ${p.exit}` : ""}
            </span>
          )}
        </span>
        <span className="distance">{formatDistance(distance(from, p))}</span>
      </button>
      {onSave && (
        <button
          className={`save-icon ${saved ? "active" : ""}`}
          onClick={() => onSave(p)}
          aria-label={`${saved ? "取消收藏" : "收藏"}${cleanName(p.name)}`}
        >
          <Heart size={18} fill={saved ? "currentColor" : "none"} />
        </button>
      )}
    </div>
  );
}
export default function App() {
  const [data, setData] = useState(null),
    [loading, setLoading] = useState(false),
    [loadError, setLoadError] = useState(false);
  const [allFilters, setAllFilters] = useState(false);
  const [tab, setTab] = useState("plan"),
    [filter, setFilter] = useState("all"),
    [viewport, setViewport] = useState({
      lat: 25.0478,
      lon: 121.517,
      bounds: [25.03, 121.49, 25.06, 121.54],
      zoom: 15,
    });
  const [focus, setFocus] = useState(null),
    [start, setStart] = useState(null),
    [end, setEnd] = useState(null),
    [pick, setPick] = useState(null),
    [searchFor, setSearchFor] = useState(null),
    [query, setQuery] = useState("");
  const [selected, setSelected] = useState(null),
    [modal, setModal] = useState(null),
    [prefs, setPrefs] = useState(() => ({
      ...basePrefs,
      ...readSaved("hhz-preferences", {}),
      avoidSteps: true,
      officialOnly: false,
    }));
  const [saved, setSaved] = useState(() => readSaved("hhz-saved", [])),
    [trips, setTrips] = useState(() => readSaved("hhz-trips", []));
  const [route, setRoute] = useState(null),
    [routeError, setRouteError] = useState(""),
    [routing, setRouting] = useState(false),
    [graphRequested, setGraphRequested] = useState(false),
    [graphReady, setGraphReady] = useState(false),
    [graphError, setGraphError] = useState(false),
    [status, setStatus] = useState(""),
    [locating, setLocating] = useState(false),
    [listLimit, setListLimit] = useState(12),
    [stationQuery, setStationQuery] = useState(""),
    [speaking, setSpeaking] = useState(false),
    [stepIndex, setStepIndex] = useState(0),
    [online, setOnline] = useState(navigator.onLine);
  const [basemap, setBasemap] = useState(() => {
    const v = readSaved("hhz-basemap", "street");
    return Object.prototype.hasOwnProperty.call(BASEMAPS, v) ? v : "street";
  });
  const [basemapStatus, setBasemapStatus] = useState("loading");
  const [layersOpen, setLayersOpen] = useState(false),
    layersRef = useRef();
  useEffect(() => {
    if (!layersOpen) return;
    const away = (e) => {
      if (!layersRef.current?.contains(e.target)) setLayersOpen(false);
    };
    const esc = (e) => e.key === "Escape" && setLayersOpen(false);
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [layersOpen]);
  const [showMapFacilities, setShowMapFacilities] = useState(false);
  const needsData = showMapFacilities || tab !== "saved" || modal === "sources";
  const waitingForData = needsData && !data && !loadError;
  // Tab change: facilities show on the map only while browsing them, the route
  // graph loads the first time 規劃路線 opens, and stale locate() replies drop.
  const tabVersion = useRef(0);
  useEffect(() => {
    tabVersion.current++;
    setShowMapFacilities(tab === "explore");
    if (tab === "plan") setGraphRequested(true);
  }, [tab]);
  useEffect(() => {
    saveLocal("hhz-basemap", basemap);
  }, [basemap]);
  const [addressResults, setAddressResults] = useState([]);
  useEffect(() => {
    const ctl = new AbortController();
    setAddressResults([]);
    const t = setTimeout(() => {
      addressSearch(query, ctl.signal)
        .then((r) => {
          if (!ctl.signal.aborted) setAddressResults(r);
        })
        .catch(() => {});
    }, 350);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [query]);
  const panelScroll = useRef();
  const routeFeedback = useRef();
  // Phone bottom sheet: 0 = peek, 1 = half, 2 = full (heights in style.css).
  const panelEl = useRef(),
    gripDragged = useRef(false);
  const [sheetSnap, setSheetSnap] = useState(1);
  const SHEET_SNAPS = [0.24, 0.56, 0.9];
  function gripDown(e) {
    const el = panelEl.current;
    if (!el || e.button > 0) return;
    const startY = e.clientY,
      startH = el.getBoundingClientRect().height;
    gripDragged.current = false;
    el.classList.add("dragging");
    const move = (ev) => {
      const dy = startY - ev.clientY;
      if (Math.abs(dy) > 5) gripDragged.current = true;
      el.style.setProperty("--sheet-h", `${Math.max(110, startH + dy)}px`);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      el.classList.remove("dragging");
      const f = el.getBoundingClientRect().height / window.innerHeight;
      el.style.removeProperty("--sheet-h");
      if (!gripDragged.current) return;
      let best = 0;
      SHEET_SNAPS.forEach((v, i) => {
        if (Math.abs(v - f) < Math.abs(SHEET_SNAPS[best] - f)) best = i;
      });
      setSheetSnap(best);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  }
  useEffect(() => {
    if (routeError)
      routeFeedback.current?.scrollIntoView({
        block: "nearest",
        behavior: "auto",
      });
  }, [routeError]);
  useEffect(() => {
    if (panelScroll.current) panelScroll.current.scrollTop = 0;
  }, [tab]);
  const worker = useRef(),
    request = useRef(0),
    map = useRef(),
    announceTimer = useRef();
  const announce = (text) => {
    setStatus(text);
    clearTimeout(announceTimer.current);
    announceTimer.current = setTimeout(() => setStatus(""), 7000);
  };
  const boot = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const [fac, places, metro, sources, construction] = await Promise.all(
        ["facilities", "places", "metro", "sources", "construction"].map(
          loadData,
        ),
      );
      const all = [...fac, ...places];
      setData({ fac, places, metro, sources, construction, all });
    } catch (error) {
      console.error("Data load failed", error);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    if (needsData && !data && !loadError && !loading) boot();
  }, [needsData, data, loadError, loading, boot]);
  useEffect(() => {
    const off = () => setOnline(false),
      on = () => setOnline(true);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
      clearTimeout(announceTimer.current);
      window.speechSynthesis?.cancel();
    };
  }, []);
  useEffect(() => {
    saveLocal("hhz-preferences", prefs);
    document.documentElement.classList.toggle("large-text", prefs.largeText);
    document.documentElement.classList.toggle("high-contrast", prefs.contrast);
  }, [prefs]);
  useEffect(() => {
    if (!graphRequested) return;
    const w = new Worker(new URL("./route-worker.js", import.meta.url), {
      type: "module",
    });
    worker.current = w;
    w.onmessage = ({ data: d }) => {
      if (d.type === "ready") setGraphReady(true);
      if (d.type === "route" && d.id === request.current) {
        setRouting(false);
        if (d.result.error || d.result.policyVersion !== ROUTING_POLICY) {
          clearRoute();
          setRouteError(d.result.error || "UNVERIFIED_NETWORK");
        } else {
          window.speechSynthesis?.cancel();
          setSpeaking(false);
          setRoute(d.result);
          setRouteError("");
          setStepIndex(0);
        }
      }
      if (d.type === "error") {
        if (d.id != null && d.id !== request.current) return;
        clearRoute();
        setRouting(false);
        setGraphError(true);
      }
    };
    w.postMessage({
      type: "init",
      url: new URL(
        dataUrl("graph") + "?policy=" + ROUTING_POLICY,
        location.href,
      ).href,
    });
    return () => w.terminate();
  }, [graphRequested]);
  const changePoint = (which, p) => {
    request.current++;
    setRouting(false);
    clearRoute();
    setRouteError("");
    which === "start" ? setStart(p) : setEnd(p);
    setSearchFor(null);
    setQuery("");
    setPick(null);
    setTab("plan");
    setFocus({ ...p, token: Date.now() });
  };
  function clearRoute() {
    request.current++;
    window.speechSynthesis?.cancel();
    setSpeaking(false);
    setRouting(false);
    setRoute(null);
  }
  function selectPoint(p) {
    if (pick) changePoint(pick, p);
  }
  function updatePrefs(patch) {
    request.current++;
    setRouting(false);
    clearRoute();
    setPrefs({ ...prefs, ...patch, avoidSteps: true, officialOnly: false });
  }
  function toggleSave(p) {
    const next = saved.some((x) => x.id === p.id)
      ? saved.filter((x) => x.id !== p.id)
      : [p, ...saved];
    setSaved(next);
    if (!saveLocal("hhz-saved", next))
      announce("這次沒能儲存收藏。請確認瀏覽器有可用的儲存空間。");
  }
  function openSearch(which) {
    setSearchFor(which);
    setQuery("");
  }
  async function locate(which) {
    const version = tabVersion.current;
    setLocating(true);
    try {
      const p = await getLocation();
      if (which && version !== tabVersion.current) return;
      if (p.lat < 24.94 || p.lat > 25.24 || p.lon < 121.42 || p.lon > 121.69) {
        announce(
          "你目前的位置在服務範圍外。可以搜尋臺北的地點，或直接在地圖上選擇。",
        );
        return;
      }
      setFocus({ ...p, token: Date.now() });
      if (which) changePoint(which, p);
      else announce("已找到你的位置，可以看看附近有哪些設施。");
    } catch {
      if (!which || version === tabVersion.current)
        announce("目前無法取得位置。你仍可以搜尋地點，或在地圖上選擇。");
    } finally {
      setLocating(false);
    }
  }
  function calculate() {
    if (!start || !end) {
      announce("選好出發地和目的地，就能一起看看適合的走法。");
      return;
    }
    if (!graphReady) {
      announce(
        graphError
          ? "路線資料暫時讀取不到，請重新整理後再試一次。"
          : "正在準備路線資料，附近設施已經可以先查看。",
      );
      return;
    }
    clearRoute();
    setRouting(true);
    setRouteError("");
    if (!worker.current) return;
    worker.current.postMessage({
      type: "route",
      id: ++request.current,
      start: [start.lat, start.lon],
      end: [end.lat, end.lon],
      options: prefs,
    });
  }
  const essential = new Set([
    "elevator",
    "toilet",
    "rest",
    "water",
    "park",
    "friendly",
  ]);
  const facilities = useMemo(
    () =>
      data?.all.filter((p) =>
        filter === "all" ? essential.has(category(p)) : category(p) === filter,
      ) || [],
    [data, filter],
  );
  const nearby = useMemo(
    () =>
      facilities
        .map((p) => ({ ...p, dist: distance(viewport, p) }))
        .sort((a, b) => a.dist - b.dist),
    [facilities, viewport.lat, viewport.lon],
  );
  const mapItems = useMemo(
    () =>
      facilities.filter(
        (p) =>
          p.lat >= viewport.bounds[0] &&
          p.lat <= viewport.bounds[2] &&
          p.lon >= viewport.bounds[1] &&
          p.lon <= viewport.bounds[3],
      ),
    [facilities, viewport],
  );
  const searchResults = useMemo(() => {
    if (!searchFor || !data) return [];
    const q = normalize(query);
    const list = q
      ? data.all.filter((p) =>
          normalize(p.name + " " + (p.address || "")).includes(q),
        )
      : saved.length
        ? saved
        : data.fac.filter((p) => p.kind === "20");
    const used = new Set();
    return [...addressResults, ...list]
      .sort(
        (a, b) =>
          (a.name === query ? -1 : 0) - (b.name === query ? -1 : 0) ||
          distance(viewport, a) - distance(viewport, b),
      )
      .filter((p) => {
        const key =
          normalize(p.name) +
          Math.round(p.lat * 1000) +
          Math.round(p.lon * 1000);
        if (used.has(key)) return false;
        used.add(key);
        return true;
      })
      .slice(0, 35);
  }, [
    data,
    query,
    searchFor,
    saved,
    addressResults,
    viewport.lat,
    viewport.lon,
  ]);
  const stations = useMemo(
    () =>
      data?.metro["metro-elevators"]?.filter((s) =>
        normalize(s["車站名稱"]).includes(normalize(stationQuery)),
      ) || [],
    [data, stationQuery],
  );
  const construction = useMemo(
    () => currentConstruction(data?.construction || []),
    [data],
  );
  const routeWorks = useMemo(
    () =>
      route
        ? construction
            .filter((c) =>
              route.coordinates.some(
                (a, i) =>
                  i % 5 === 0 && distance(c, { lat: a[0], lon: a[1] }) < 70,
              ),
            )
            .slice(0, 6)
        : [],
    [route, construction],
  );
  function readRoute() {
    if (speaking) {
      speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }
    if (!route || route.policyVersion !== ROUTING_POLICY) return;
    const text = `從${start.name}前往${end.name}，路線長約${formatDistance(route.distance)}。${route.steps.map((s) => `${stepText(s)}約${Math.round(s.distance)}公尺。`).join("")}路況仍需留意現場，這是路線預覽。`;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "zh-TW";
    u.rate = 0.9;
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    speechSynthesis.speak(u);
    setSpeaking(true);
  }
  function saveTrip() {
    if (!route || route.policyVersion !== ROUTING_POLICY) return;
    const entry = {
      id: Date.now().toString(),
      start,
      end,
      route,
      prefs,
      date: new Date().toISOString(),
    };
    const next = [entry, ...trips].slice(0, 12);
    if (saveLocal("hhz-trips", next)) {
      setTrips(next);
      announce("行程已存好，稍後可以從「收藏」再打開。");
    } else announce("儲存空間不足，這次沒能存下行程。");
  }
  async function share() {
    if (!route || route.policyVersion !== ROUTING_POLICY) return;
    const text = `好好走｜${start.name} → ${end.name}\n約 ${formatDistance(route.distance)}\n${route.steps
      .slice(0, 20)
      .map((s) => `${s.name} ${Math.round(s.distance)}公尺`)
      .join("\n")}\n路線依公開路網規劃，部分通行條件尚未確認，請留意現場。`;
    try {
      if (navigator.share)
        await navigator.share({ title: "好好走・行程", text });
      else {
        await navigator.clipboard.writeText(text);
        announce("行程文字已複製，可以貼給同行的人。");
      }
    } catch {
      announce("這次沒有分享行程，你可以稍後再試。");
    }
  }
  const inspect = (p) => {
    setSelected(p);
    setFocus({ ...p, token: Date.now() });
  };
  const errorText = {
    UNVERIFIED_NETWORK:
      "人行路網資料尚未完成驗證，暫時無法規劃。請重新載入後再試。",
    NO_CONNECTION:
      "這個位置尚未確認能接上人行道。請改選實際入口或人行道上的位置；系統不會跨越車道替你接路。",
    NO_ROUTE:
      "目前沒有足夠資料確認兩點間有連續人行路線。我們不會改走車道補接；可以更換入口，或先查詢附近設施。",
    SAME_POINT: "這兩個位置很接近，可以再確認一下目的地入口。",
  };
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        跳至服務內容
      </a>
      <div className="workspace">
        <aside
          className="panel"
          id="main-content"
          ref={panelEl}
          data-snap={sheetSnap}
        >
          <button
            className="sheet-grip"
            onPointerDown={gripDown}
            onClick={() => {
              if (gripDragged.current) {
                gripDragged.current = false;
                return;
              }
              setSheetSnap((v) => (v + 1) % SHEET_SNAPS.length);
            }}
            aria-label={
              ["展開面板", "面板放到最大", "收合面板，顯示更多地圖"][sheetSnap]
            }
          />
          <div className="omnibox-wrap">
            <button className="omnibox" onClick={() => openSearch("explore")}>
              <Search size={20} />
              <span>搜尋地點、捷運站或路名</span>
            </button>
            <button
              className="omnibox-settings"
              aria-label="閱讀與通行設定"
              onClick={() => setModal("prefs")}
            >
              <SlidersHorizontal size={21} />
            </button>
          </div>
          <nav className="main-nav" aria-label="主要功能">
            {[
              ["explore", "找設施", Compass],
              ["plan", "規劃路線", Route],
              ["stations", "捷運出口", TrainFront],
              ["saved", "收藏", Heart],
            ].map(([id, label, C]) => (
              <button
                key={id}
                className={tab === id ? "active" : ""}
                onClick={() => {
                  setTab(id);
                  setPick(null);
                  setSheetSnap((v) => Math.max(v, 1));
                }}
                aria-current={tab === id ? "page" : undefined}
              >
                <C size={20} />
                <span>{label}</span>
              </button>
            ))}
          </nav>
          <div className="panel-scroll" ref={panelScroll}>
            {waitingForData && (
              <div className="loading-note">
                <LoaderCircle className="spin" size={18} /> 正在載入設施…
              </div>
            )}
            {needsData && loadError && (
              <div className="empty-state">
                <WifiOff />
                <h2>資料暫時沒有載入</h2>
                <p>可以稍後再試，已收藏的行程仍可從「收藏」查看。</p>
                <button className="primary" onClick={boot}>
                  再試一次
                </button>
              </div>
            )}
            {tab === "explore" && (
              <>
                <h1 className="sr-only">找設施</h1>
                <div className="filter-grid" aria-label="設施類別">
                  {(allFilters ||
                  filters.findIndex(([id]) => id === filter) >= MAIN_FILTERS
                    ? filters
                    : filters.slice(0, MAIN_FILTERS)
                  ).map(([id, label, C]) => (
                    <button
                      key={id}
                      className={filter === id ? "selected" : ""}
                      aria-pressed={filter === id}
                      onClick={() => {
                        setFilter(id);
                        setListLimit(12);
                      }}
                    >
                      <C size={17} />
                      {label}
                    </button>
                  ))}
                  {!allFilters &&
                    filters.findIndex(([id]) => id === filter) <
                      MAIN_FILTERS && (
                      <button onClick={() => setAllFilters(true)}>
                        更多
                        <ChevronDown size={16} />
                      </button>
                    )}
                </div>
                <p className="list-caption">離地圖中心由近到遠</p>
                {nearby.slice(0, listLimit).map((p) => (
                  <FacilityRow
                    key={p.id}
                    p={p}
                    from={viewport}
                    onSelect={inspect}
                  />
                ))}
                {data && !nearby.length && (
                  <p className="quiet-note">
                    這類設施的資料還在補齊，可以先看看其他設施。
                  </p>
                )}
                {nearby.length > listLimit && (
                  <button
                    className="load-more"
                    onClick={() => setListLimit((n) => n + 15)}
                  >
                    查看更多設施
                    <ChevronDown size={16} />
                  </button>
                )}
              </>
            )}
            {tab === "plan" && (
              <>
                <h1 className="sr-only">規劃路線</h1>
                <div className="endpoints">
                  <span className="route-dots">
                    <i />
                    <span />
                    <i />
                  </span>
                  <div className="point-fields">
                    <button
                      onClick={() => openSearch("start")}
                      aria-label="選擇出發地"
                    >
                      <small>從哪裡出發</small>
                      <strong>{start?.name || "選擇出發地"}</strong>
                    </button>
                    <button
                      onClick={() => openSearch("end")}
                      aria-label="選擇目的地"
                    >
                      <small>想去哪裡</small>
                      <strong>{end?.name || "選擇目的地"}</strong>
                    </button>
                  </div>
                  <button
                    className="icon-button swap"
                    aria-label="交換起點與終點"
                    onClick={() => {
                      setStart(end);
                      setEnd(start);
                      clearRoute();
                      setRouting(false);
                      request.current++;
                    }}
                  >
                    <ArrowUpDown size={20} />
                  </button>
                </div>
                <div className="point-actions">
                  <button
                    className="text-button"
                    onClick={() => locate("start")}
                    disabled={locating}
                  >
                    <LocateFixed size={16} />
                    從我的位置出發
                  </button>
                  <button
                    className="text-button"
                    onClick={() => {
                      setPick(start ? "end" : "start");
                      announce(
                        start
                          ? "請在地圖上點選目的地。"
                          : "請在地圖上點選出發地。",
                      );
                    }}
                  >
                    <MapPin size={16} />
                    在地圖選點
                  </button>
                </div>
                <div className="preference-bar">
                  <Accessibility size={20} />
                  <span>
                    {prefs.avoidSteps ? "避開階梯" : "允許階梯"} ·{" "}
                    {prefs.minWidth}m 以上已知寬度
                  </span>
                  <button
                    onClick={() => setModal("prefs")}
                    aria-label="調整通行偏好"
                  >
                    <SlidersHorizontal size={18} />
                  </button>
                </div>
                <div className="mode-tabs" aria-label="路線偏好">
                  {[
                    ["balanced", "均衡走法"],
                    ["gentle", "偏好平緩"],
                    ["crossings", "減少過街"],
                  ].map(([id, name]) => (
                    <button
                      key={id}
                      aria-pressed={prefs.mode === id}
                      className={prefs.mode === id ? "active" : ""}
                      onClick={() => updatePrefs({ mode: id })}
                    >
                      {name}
                    </button>
                  ))}
                </div>
                <button
                  className="primary full"
                  onClick={calculate}
                  disabled={routing || waitingForData}
                >
                  {routing ? (
                    <LoaderCircle className="spin" size={19} />
                  ) : (
                    <Route size={19} />
                  )}{" "}
                  {routing ? "正在找路線…" : "規劃路線"}
                  <ArrowRight size={19} />
                </button>
                {!graphReady && (
                  <p className="quiet-note">
                    {graphError
                      ? "路線資料暫時讀取不到，請重新整理再試。"
                      : "路網正在背景準備，請先選擇起點與終點。"}
                  </p>
                )}
                {routeError && (
                  <div className="notice" role="alert" ref={routeFeedback}>
                    <Info />
                    <p>
                      {errorText[routeError] || "暫時無法規劃，請稍後再試。"}
                    </p>
                  </div>
                )}
                {route && (
                  <>
                    <div className="route-summary">
                      <div>
                        <span className="eyebrow">路線預覽</span>
                        <h2>{formatDistance(route.distance)}</h2>
                        <p>依公開路網規劃，尚未逐段現勘確認</p>
                      </div>
                      <span className="route-symbol">
                        <Footprints size={32} />
                      </span>
                    </div>
                    {route.officialCoveragePct != null && (
                      <div className="notice soft">
                        <Info size={20} />
                        <p>
                          約 {route.officialCoveragePct}%
                          路程與市府人行道、標線型人行道或行穿線圖資重疊。這表示有官方人行空間資料，並非已確認輪椅可全程通行。
                        </p>
                      </div>
                    )}
                    <div className="notice warm">
                      <Info size={20} />
                      <p>
                        約 {route.unknownPct}%
                        路程缺少完整寬度或坡度資料。沿途請留意現場，覺得不合適時可以先停下來，換個走法。
                      </p>
                    </div>
                    {(route.startGap > 10 || route.endGap > 10) && (
                      <p className="quiet-note">
                        起點距路網約 {route.startGap} 公尺，終點距路網約{" "}
                        {route.endGap} 公尺；這兩段銜接尚未確認。
                      </p>
                    )}
                    {route.roadPct > 0 && (
                      <p className="quiet-note">
                        約 {route.roadPct}%
                        路程使用一般道路路網，尚未確認是否有連續人行空間。
                      </p>
                    )}
                    <div className="route-tools">
                      <button onClick={saveTrip}>
                        <Bookmark size={17} />
                        存下行程
                      </button>
                      <button onClick={share}>
                        <Share2 size={17} />
                        分享
                      </button>
                      {"speechSynthesis" in window && (
                        <button onClick={readRoute}>
                          {speaking ? (
                            <VolumeX size={17} />
                          ) : (
                            <Volume2 size={17} />
                          )}{" "}
                          {speaking ? "停止朗讀" : "聽路線"}
                        </button>
                      )}
                    </div>
                    <div className="section-top">
                      <h2>一步一步看路</h2>
                      <span className="muted">共 {route.steps.length} 段</span>
                    </div>
                    <ol className="steps">
                      {route.steps.map((s, i) => (
                        <li
                          key={i}
                          className={stepIndex === i ? "current" : ""}
                        >
                          <button
                            onClick={() => {
                              setStepIndex(i);
                              setFocus({ ...s, token: Date.now(), zoom: 18 });
                            }}
                          >
                            <span className="step-number">{i + 1}</span>
                            <span>
                              <b>{stepText(s)}</b>
                              <small>
                                約 {formatDistance(s.distance)}
                                {s.unknown ? " · 通行條件待確認" : ""}
                              </small>
                            </span>
                          </button>
                        </li>
                      ))}
                    </ol>
                    {routeWorks.length > 0 && (
                      <>
                        <h2 className="section-title">沿途施工資料</h2>
                        <p className="quiet-note">
                          以下是取得資料時的施工紀錄，並非現場即時狀態。
                        </p>
                        {routeWorks.map((c, i) => (
                          <div className="notice" key={i}>
                            <AlertTriangle size={18} />
                            <p>
                              <b>{c.Addr}</b>
                              <br />
                              {c.Cb_Da}—{c.Ce_Da}
                              <br />
                              {c.PlanB || "通行影響請依現場指引確認。"}
                            </p>
                          </div>
                        ))}
                      </>
                    )}
                  </>
                )}
              </>
            )}
            {tab === "stations" && (
              <>
                <h1 className="sr-only">捷運電梯出口</h1>
                <label className="search-launch input">
                  <Search size={20} />
                  <input
                    value={stationQuery}
                    onChange={(e) => setStationQuery(e.target.value)}
                    placeholder="搜尋捷運站，例如：台北車站"
                    aria-label="搜尋捷運站"
                  />
                </label>
                <div className="notice soft">
                  <Info size={18} />
                  <p>資料來自捷運公司，出發前可再向車站確認電梯是否維修。</p>
                </div>
                {stations
                  .map((s) => {
                    const name = s["車站名稱"];
                    const exits = data.fac.filter(
                      (p) =>
                        p.kind === "metro-elevator" &&
                        stationKey(p.station) === stationKey(name),
                    );
                    const near = exits.length
                      ? Math.min(...exits.map((p) => distance(viewport, p)))
                      : Infinity;
                    return { s, name, exits, near };
                  })
                  .sort((a, b) => a.near - b.near)
                  .map(({ s, name, exits }) => {
                    return (
                      <button
                        className="station-card"
                        key={`${name}-${s["路線別"]}`}
                        onClick={() =>
                          setSelected({
                            id: `station-${name}-${s["路線別"]}`,
                            name: `${name}站`,
                            kind: "station-detail",
                            record: s,
                            exits,
                          })
                        }
                      >
                        <span className="station-icon">
                          <TrainFront size={22} />
                        </span>
                        <span>
                          <strong>{name}</strong>
                          <small>
                            {s["路線別"]} ·{" "}
                            {exits.length
                              ? `${exits.length} 處電梯／坡道出口`
                              : "查看電梯位置說明"}
                          </small>
                        </span>
                        <ChevronRight size={18} />
                      </button>
                    );
                  })}
                {!stations.length && data && (
                  <p className="quiet-note">
                    還沒找到這個站名，試試少打幾個字。
                  </p>
                )}
              </>
            )}
            {tab === "saved" && (
              <>
                <h1 className="sr-only">收藏</h1>
                {!trips.length && !saved.length && (
                  <div className="empty-card">
                    <Heart size={25} />
                    <p>
                      還沒有收藏。在地點資訊按「收藏」，或規劃路線後按「存下行程」。
                    </p>
                  </div>
                )}
                {trips.length > 0 && (
                  <h2 className="section-title">已存行程</h2>
                )}
                {trips.length > 0 &&
                  trips.map((t) => (
                    <div className="trip-card" key={t.id}>
                      <button
                        onClick={() => {
                          request.current++;
                          setStart(t.start);
                          setEnd(t.end);
                          clearRoute();
                          setPrefs({
                            ...basePrefs,
                            ...t.prefs,
                            avoidSteps: true,
                            officialOnly: false,
                          });
                          setTab("plan");
                          setRouteError("");
                          setRouting(false);
                          announce(
                            "已帶入起點與終點。舊路線不會沿用，請按「規劃路線」重新確認。",
                          );
                        }}
                      >
                        <Route size={22} />
                        <span>
                          <b>
                            {t.start.name} → {t.end.name}
                          </b>
                          <small>
                            {formatDistance(t.route.distance)} ·{" "}
                            {new Date(t.date).toLocaleDateString("zh-TW")} 儲存
                          </small>
                        </span>
                      </button>
                      <button
                        className="icon-button"
                        aria-label="移除這筆行程"
                        onClick={() => {
                          const next = trips.filter((x) => x.id !== t.id);
                          setTrips(next);
                          saveLocal("hhz-trips", next);
                        }}
                      >
                        <X size={17} />
                      </button>
                    </div>
                  ))}
                {saved.length > 0 && (
                  <h2 className="section-title">想再去的地方</h2>
                )}
                {saved.length > 0 &&
                  saved.map((p) => (
                    <FacilityRow
                      key={p.id}
                      p={p}
                      from={viewport}
                      onSelect={inspect}
                      saved
                      onSave={toggleSave}
                    />
                  ))}
              </>
            )}
            <footer className="panel-footer">
              <button onClick={() => setModal("sources")}>資料來源</button>
              <button onClick={() => setModal("about")}>關於服務</button>
            </footer>
          </div>
        </aside>
        <main className="map-area" aria-label="地圖與設施">
          <MapView
            items={showMapFacilities ? mapItems : []}
            basemap={basemap}
            onBasemapStatus={setBasemapStatus}
            route={route}
            start={start}
            end={end}
            focus={{ ...viewport, ...focus }}
            pick={pick}
            onPick={selectPoint}
            onSelect={inspect}
            onViewport={setViewport}
            onMapReady={(m) => (map.current = m)}
            onGesture={() => {
              if (matchMedia("(max-width: 700px)").matches) setSheetSnap(0);
            }}
          />
          <div className="map-dock" ref={layersRef}>
            <div className="dock-group">
              <button
                aria-label="地圖圖層"
                aria-expanded={layersOpen}
                aria-controls="layers-panel"
                onClick={() => {
                  // Phone: lower the sheet so the whole picker sits on open map.
                  if (!layersOpen && matchMedia("(max-width: 700px)").matches)
                    setSheetSnap(0);
                  setLayersOpen(!layersOpen);
                }}
              >
                <Layers size={20} />
              </button>
              <button
                aria-label="移至我的位置"
                onClick={() => locate()}
                disabled={locating}
              >
                {locating ? (
                  <LoaderCircle className="spin" size={20} />
                ) : (
                  <Navigation size={19} />
                )}
              </button>
            </div>
            {layersOpen && (
              <div
                className="layers-panel"
                id="layers-panel"
                role="group"
                aria-labelledby="layers-title"
              >
                <div className="layers-head">
                  <b id="layers-title">地圖</b>
                  <button
                    className="icon-button"
                    aria-label="關閉地圖圖層"
                    onClick={() => setLayersOpen(false)}
                  >
                    <X size={18} />
                  </button>
                </div>
                <div className="layers-grid">
                  {Object.entries(BASEMAPS).map(([id, spec]) => (
                    <button
                      key={id}
                      className="layer-option"
                      aria-pressed={basemap === id}
                      onClick={() => setBasemap(id)}
                    >
                      <span className="layer-thumb">
                        {[spec.url, spec.overlay].filter(Boolean).map((u) => (
                          <img
                            key={u}
                            src={layerThumb(u)}
                            alt=""
                            loading="lazy"
                          />
                        ))}
                      </span>
                      <span>{spec.label}</span>
                    </button>
                  ))}
                </div>
                <label className="toggle-row layers-toggle">
                  <b>在地圖上顯示無障礙設施</b>
                  <input
                    type="checkbox"
                    checked={showMapFacilities}
                    onChange={(e) => setShowMapFacilities(e.target.checked)}
                  />
                </label>
              </div>
            )}
          </div>
          <div className="dock-group map-zoom">
            <button aria-label="放大地圖" onClick={() => map.current?.zoomIn()}>
              <Plus size={20} />
            </button>
            <button
              aria-label="縮小地圖"
              onClick={() => map.current?.zoomOut()}
            >
              <Minus size={20} />
            </button>
          </div>
          {pick && (
            <div className="pick-prompt">
              <MapPin size={19} />
              <span>
                點一下地圖，選擇{pick === "start" ? "出發地" : "目的地"}
              </span>
              <button onClick={() => setPick(null)} aria-label="取消地圖選點">
                <X size={18} />
              </button>
            </div>
          )}
          {basemap !== "street" && basemapStatus === "error" && (
            <button
              className="basemap-error"
              onClick={() => setBasemap("street")}
            >
              影像暫時讀取不到，切回一般地圖
            </button>
          )}
          {basemap !== "street" && (
            <div className="map-bottom">
              <span className="map-footnote">
                航照為歷史拍攝影像，非即時路況
              </span>
            </div>
          )}
        </main>
      </div>
      {!online && (
        <div className="offline-banner">
          <WifiOff size={16} />
          目前離線，已載入的資料仍可查看，最新路況暫時無法確認。
        </div>
      )}
      <div
        className={`toast ${status ? "visible" : ""}`}
        role="status"
        aria-live="polite"
      >
        {status && (
          <>
            <Info size={18} />
            <span>{status}</span>
            <button onClick={() => setStatus("")} aria-label="關閉提示">
              <X size={16} />
            </button>
          </>
        )}
      </div>
      {searchFor && (
        <Sheet
          title={
            searchFor === "start"
              ? "從哪裡出發？"
              : searchFor === "end"
                ? "想去哪裡？"
                : "找個想去的地方"
          }
          onClose={() => setSearchFor(null)}
        >
          <label className="search-launch input">
            <Search size={21} />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="輸入地點、捷運站、地址或路名"
              aria-label="搜尋地點"
            />
          </label>
          <div className="search-options">
            <button
              onClick={() => {
                const which = searchFor === "explore" ? null : searchFor;
                setSearchFor(null);
                locate(which);
              }}
            >
              <LocateFixed size={20} />
              <span>使用我的位置</span>
            </button>
            <button
              onClick={() => {
                setPick(searchFor === "explore" ? "end" : searchFor);
                setSearchFor(null);
                setTab("plan");
              }}
            >
              <MapPin size={20} />
              <span>直接在地圖上選擇</span>
            </button>
          </div>
          <p className="list-caption">
            {query ? "找到這些地方" : "附近車站與收藏"}
          </p>
          {searchResults.map((p) => (
            <FacilityRow
              key={p.id}
              p={p}
              from={viewport}
              onSelect={(p) => {
                if (searchFor === "explore") {
                  setSearchFor(null);
                  inspect(p);
                } else changePoint(searchFor, p);
              }}
            />
          ))}
          {query && !searchResults.length && (
            <div className="empty-card">
              <Search />
              <p>
                還沒找到這個名稱。可以改用附近路名、捷運站，或在地圖上選擇位置。
              </p>
            </div>
          )}
        </Sheet>
      )}
      {selected && (
        <Sheet
          title={cleanName(selected.name)}
          onClose={() => setSelected(null)}
        >
          {selected.kind === "station-detail" ? (
            <>
              <div className="detail-badge">
                <TrainFront size={17} />
                {selected.record["路線別"]}
              </div>
              <h3>電梯在哪裡</h3>
              <p className="station-description">
                {selected.record["電梯位置"]}
              </p>
              <h3>地圖上的出口</h3>
              {selected.exits.length ? (
                selected.exits.map((p) => (
                  <FacilityRow
                    key={p.id}
                    p={p}
                    from={viewport}
                    onSelect={(p) => {
                      setSelected(p);
                      setFocus({ ...p, token: Date.now() });
                    }}
                  />
                ))
              ) : (
                <p className="quiet-note">
                  這個車站目前沒有可對應的出口座標，先參考上方位置說明。
                </p>
              )}
              <h3>維修與保養資訊</h3>
              {data.metro["metro-alerts"]
                .filter((r) =>
                  normalize(r["車站"]).includes(
                    normalize(selected.record["車站名稱"]),
                  ),
                )
                .map((r, i) => (
                  <div className="notice" key={i}>
                    <Info size={17} />
                    <p>
                      {r["說明"]}
                      <br />
                      <small>公告時間：{r["日期時間"]}</small>
                    </p>
                  </div>
                ))}
              <p className="quiet-note">
                以下為預定保養，並非即時故障狀態；實際時間請依車站告示。
              </p>
              {data.metro["metro-maintenance"]
                .filter((r) =>
                  normalize(r["車站"]).includes(
                    normalize(selected.record["車站名稱"]),
                  ),
                )
                .slice(0, 12)
                .map((r, i) => (
                  <div className="maintenance" key={i}>
                    <Clock size={16} />
                    <span>{maintenanceText(r)}</span>
                  </div>
                ))}
              <a
                className="external-link"
                href="https://www.metro.taipei/cp.aspx?n=D6B0BA338E694562"
                target="_blank"
                rel="noopener"
              >
                查看捷運最新電梯公告
                <ExternalLink size={15} />
              </a>
            </>
          ) : (
            <>
              <div className="detail-badge">
                <Icon kind={category(selected)} />
                {labels[category(selected)] || "地點"}
              </div>
              {selected.address && (
                <p className="detail-address">
                  <MapPin size={18} />
                  {selected.address}
                </p>
              )}
              {(selected.accessibleCount > 0 ||
                selected.exit ||
                selected.slopePct != null) && (
                <div className="detail-facts">
                  {selected.accessibleCount > 0 && (
                    <div>
                      <small>無障礙廁座</small>
                      <b>{selected.accessibleCount} 座</b>
                    </div>
                  )}
                  {selected.exit && (
                    <div>
                      <small>出入口</small>
                      <b>{selected.exit}</b>
                    </div>
                  )}
                  {selected.slopePct != null && (
                    <div>
                      <small>資料記載坡度</small>
                      <b>{selected.slopePct}%</b>
                    </div>
                  )}
                </div>
              )}
              {selected.careBed && <p>照護床：{selected.careBed}</p>}
              {selected.routes && (
                <p>
                  此站路線：{selected.routes.join("、")}
                  。低地板車輛與班次請另向營運單位確認。
                </p>
              )}
              {selected.openingHours && (
                <p>開放時間（來源記載）：{selected.openingHours}</p>
              )}
              <div className="notice soft">
                <Info size={19} />
                <p>
                  {category(selected) === "elevator"
                    ? "資料記載此處設有電梯或坡道，並非即時可用狀態。出發前可以看看車站的維修資訊。"
                    : category(selected) === "toilet"
                      ? "資料記載設有無障礙廁所，實際開放時間與內部設備請以現場為準。"
                      : "這是公開資料記載的位置，實際通行與開放情形請留意現場。"}
                </p>
              </div>
              <button
                className="primary full"
                onClick={() => {
                  changePoint("end", selected);
                  setSelected(null);
                }}
              >
                我要到這裡
                <ArrowRight size={18} />
              </button>
              <div className="detail-actions">
                <button
                  className="secondary"
                  onClick={() => {
                    changePoint("start", selected);
                    setSelected(null);
                  }}
                >
                  從這裡出發
                </button>
                <button
                  className="secondary"
                  onClick={() => toggleSave(selected)}
                >
                  <Heart
                    size={18}
                    fill={
                      saved.some((x) => x.id === selected.id)
                        ? "currentColor"
                        : "none"
                    }
                  />
                  {saved.some((x) => x.id === selected.id) ? "已收藏" : "收藏"}
                </button>
              </div>
              {selected.station && (
                <button
                  className="full text-button"
                  onClick={() => {
                    setStationQuery(selected.station);
                    setTab("stations");
                    setSelected(null);
                  }}
                >
                  查看這個車站的電梯資訊
                  <ChevronRight size={16} />
                </button>
              )}
              <p className="source-note">
                資料來源：
                {selected.sourceId === "osm"
                  ? "OpenStreetMap contributors"
                  : data?.sources.sources.find(
                      (s) => s.id === selected.sourceId,
                    )?.name || "臺北市開放資料"}
              </p>
            </>
          )}
        </Sheet>
      )}
      {modal === "prefs" && (
        <Sheet title="通行與閱讀設定" onClose={() => setModal(null)}>
          <h3>閱讀</h3>
          <label className="toggle-row">
            <b>放大文字</b>
            <input
              type="checkbox"
              checked={prefs.largeText}
              onChange={(e) =>
                setPrefs({ ...prefs, largeText: e.target.checked })
              }
            />
          </label>
          <label className="toggle-row">
            <b>提高對比</b>
            <input
              type="checkbox"
              checked={prefs.contrast}
              onChange={(e) =>
                setPrefs({ ...prefs, contrast: e.target.checked })
              }
            />
          </label>
          <h3>路線</h3>
          <label className="range-row">
            <span>
              希望通道至少多寬<b>{prefs.minWidth} 公尺</b>
            </span>
            <input
              type="range"
              min="0.6"
              max="1.5"
              step="0.1"
              value={prefs.minWidth}
              onChange={(e) =>
                updatePrefs({ minWidth: Number(e.target.value) })
              }
            />
            <small>沒有寬度資料的路段會另外提醒。</small>
          </label>
          <label className="range-row">
            <span>
              可接受的已知坡度<b>{prefs.maxSlope}%</b>
            </span>
            <input
              type="range"
              min="2"
              max="15"
              step="1"
              value={prefs.maxSlope}
              onChange={(e) =>
                updatePrefs({ maxSlope: Number(e.target.value) })
              }
            />
            <small>依自己的需求選擇，不是安全認證標準。</small>
          </label>
          <label className="toggle-row">
            <span>
              <b>只走寬度、坡度都有資料的路段</b>
              <small>資料還不完整，可能找不到路線。</small>
            </span>
            <input
              type="checkbox"
              checked={prefs.knownOnly}
              onChange={(e) => updatePrefs({ knownOnly: e.target.checked })}
            />
          </label>
          <p className="quiet-note">
            路線不走車道與階梯。有市府人行空間圖資的路段會優先。
          </p>
          <button className="primary full" onClick={() => setModal(null)}>
            完成
            <Check size={18} />
          </button>
        </Sheet>
      )}
      {modal === "about" && (
        <Sheet title="關於好好走" onClose={() => setModal(null)}>
          <div className="about-logo">
            <Route size={35} />
          </div>
          <h2>臺北通行與設施查詢</h2>
          <p>
            好好走整理臺北的通行路網、電梯出口、廁所與休息設施，供出門前確認沿途資訊。
          </p>
          <p>
            你可以搜尋地點、直接在地圖選兩點，或先找一個附近的設施。收藏與通行偏好留在你的裝置，不需要登入。
          </p>
          <div className="notice">
            <Info />
            <p>
              資料可能有缺漏或尚未反映現場變化。路線是出行參考，並非無障礙通行保證；遇到不合適的路段，可以停下來，重新找路。
            </p>
          </div>
          <button
            className="secondary full"
            onClick={() => setModal("sources")}
          >
            查看資料來源與更新時間
            <ArrowRight size={17} />
          </button>
        </Sheet>
      )}
      {modal === "sources" && (
        <Sheet title="資料從哪裡來" onClose={() => setModal(null)}>
          <p>
            下載時間與現場調查時間不同。這些資料不是即時感測，設施狀況仍請留意現場。
          </p>
          <p className="quiet-note">
            本次資料整理：
            {data?.sources.generatedAt
              ? new Date(data.sources.generatedAt).toLocaleString("zh-TW")
              : loadError
                ? "暫時無法載入"
                : "讀取中"}
          </p>
          {loadError && (
            <button className="text-button" onClick={boot}>
              再試一次
            </button>
          )}
          {data?.sources.sources.map((s) => (
            <div className="source-card" key={s.id}>
              <b>{s.name}</b>
              <span>
                {s.status === "ok"
                  ? `${s.count.toLocaleString()} 筆來源紀錄`
                  : "目前未取得資料"}{" "}
                · {s.updateFrequency || "依來源更新"}
              </span>
              <a href={s.url} target="_blank" rel="noopener">
                查看官方來源
                <ExternalLink size={14} />
              </a>
            </div>
          ))}
          <div className="source-card">
            <b>國土測繪中心・航照與路名底圖</b>
            <span>
              正射影像 PHOTO2、透明電子地圖
              EMAP2；各區拍攝時間不同，非即時影像。
            </span>
            <a
              href="https://maps.nlsc.gov.tw/S09SOA/pro/Wmts_ajax_main.jsp"
              target="_blank"
              rel="noopener"
            >
              圖資來源與介接說明
              <ExternalLink size={14} />
            </a>
          </div>
          <div className="source-card">
            <b>OpenStreetMap contributors</b>
            <span>路網、地名及補充設施；ODbL 授權</span>
            <a
              href="https://www.openstreetmap.org/copyright"
              target="_blank"
              rel="noopener"
            >
              來源與授權
              <ExternalLink size={14} />
            </a>
          </div>
          <p className="quiet-note">
            輪行臺北部分寬度值與文件單位有疑義，尚未用於路線寬度判定。路線只走獨立標示的人行路段，不把車道當路；過街只沿標成行穿線的路段，或落在官方行穿線範圍內的路段。圖資重疊不代表現場已確認可通行。
          </p>
        </Sheet>
      )}
    </div>
  );
}
