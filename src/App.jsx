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
  Phone,
} from "lucide-react";
import MapView from "./MapView";
import VoiceSearch from "./VoiceSearch";
import {searchVerifiedAlternatives} from "./alternative-routes.mjs";
import {fetchConstruction} from "./construction-client.mjs";
import {constructionFresh, CONSTRUCTION_MAX_AGE} from "./construction.mjs";
import { requestOfficialRoute } from "./official-router.mjs";
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
} from "./data";
import { getLocation, locationErrorText } from "./location";
import { installTownPassLinks, postToTownPass, townPassUserKey } from "./townpass-bridge";
import {
  activeElevatorStops,
  facilitiesAlongRoute,
  nearestStop,
} from "./trip-extras.mjs";
import { travelProfiles } from "./travel-profiles";
import { clearLocalData, loadProfile, loadTrips, saveProfile, saveTrips } from "./local-database";
import { addressSearch } from "./address-search";
import { nearestSheetSnapIndex } from "./sheet-snap.mjs";
import {
  metroStationCodes,
  metroStationIconUrl,
} from "./metro-station-icons.mjs";
import { metroExitIconUrl, metroExitLabel } from "./metro-exits.mjs";
import {
  maintenanceText,
  sourceCountLabel,
  stationKey,
  stepText,
} from "./format.mjs";
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
  ["toilet", "無障礙廁所", Toilet],
  ["rest", "歇歇腳", Armchair],
  ["water", "飲水處", GlassWater],
];
const sidewalkStatusText = {
  loading: "載入中…",
  zoom: "請放大地圖",
  error: "暫時無法載入",
};
const routeModes = {
  balanced: "均衡走法",
  gentle: "偏好平緩",
  crossings: "減少過街",
};
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
  colorFriendly: false,
  voiceRate: 0.9,
};
function Icon({ kind, ...props }) {
  const C = icons[kind] || MapPin;
  return <C size={20} aria-hidden="true" {...props} />;
}
function MetroStationIcon({ codes, value }) {
  const stationCodes = metroStationCodes(codes, value);
  if (!stationCodes.length) return <TrainFront size={20} aria-hidden="true" />;
  return (
    <span className="metro-station-icons" aria-hidden="true">
      <TrainFront className="metro-station-icon-fallback" size={20} />
      {stationCodes.filter((code) => metroStationIconUrl(code)).map((code) => (
        <img
          key={code}
          src={metroStationIconUrl(code)}
          alt=""
          loading="lazy"
          onError={(event) => {
            event.currentTarget.hidden = true;
          }}
        />
      ))}
    </span>
  );
}
function Sheet({ title, onClose, children, dismissible = true }) {
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
        if (dismissible) onClose();
      }}
      onClick={(e) => {
        if (dismissible && e.target === ref.current) onClose();
      }}
      aria-label={title}
    >
      <div className="sheet-head">
        <h2>{title}</h2>
        {dismissible && (
          <button className="icon-button" onClick={onClose} aria-label="關閉">
            <X />
          </button>
        )}
      </div>
      <div className="sheet-body">{children}</div>
    </dialog>
  );
}
// 車站名稱補上「站」，但「台北車站」這類已經以站結尾的不再重複。
const stationLabel = (name) => (/站$/.test(name) ? name : `${name}站`);
function FacilityRow({ p, from, onSelect, saved, onSave, note, stationCode }) {
  const k = category(p),
    sub = labels[k] || "設施";
  return (
    <div className="facility-row">
      <button className="facility-main" onClick={() => onSelect(p)}>
        <span className={`facility-icon ${k}`}>
          {p.kind === "metro-elevator" ? (
            metroExitIconUrl(p) ? (
              <img className="metro-exit-icon" src={metroExitIconUrl(p)} alt="" aria-hidden="true" />
            ) : (
              <span className="metro-exit-label" aria-hidden="true">
                {metroExitLabel(p)}
              </span>
            )
          ) : k === "station" ? (
            <MetroStationIcon codes={stationCode} value={p.name} />
          ) : (
            <Icon kind={k} />
          )}
        </span>
        <span className="facility-copy">
          <strong>{cleanName(p.name)}</strong>
          {(sub !== cleanName(p.name) || p.exit) && (
            <span>
              {sub}
              {p.exit ? ` · ${p.exit}` : ""}
            </span>
          )}
          {note && <span className="facility-note">{note}</span>}
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
  const [tab, setTab] = useState("plan"),
    [filter, setFilter] = useState("toilet"),
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
    [travelProfile, setTravelProfile] = useState(null),
    [profileDraft, setProfileDraft] = useState("walking"),
    [profileStorageKey, setProfileStorageKey] = useState("hhz-profile-local"),
    [profileReady, setProfileReady] = useState(false),
    [prefs, setPrefs] = useState(() => ({
      ...basePrefs,
      ...readSaved("hhz-preferences", {}),
      avoidSteps: true,
      officialOnly: false,
    }));
  // 搜尋紀錄：最近選過的地點，只存在這支手機（hhz- 開頭，設定裡的清除資料會一起刪）。
  const [recents, setRecents] = useState(() => readSaved("hhz-recent-places", []));
  const rememberPlace = (p) => {
    if (!p || !Number.isFinite(p.lat) || !Number.isFinite(p.lon) || p.id === "my-location")
      return;
    const keep = {
      id: p.id, name: p.name, lat: p.lat, lon: p.lon, kind: p.kind,
      address: p.address, station: p.station, exit: p.exit, sourceId: p.sourceId,
    };
    setRecents((list) => {
      const next = [keep, ...list.filter((x) => x.id !== p.id)].slice(0, 10);
      saveLocal("hhz-recent-places", next);
      return next;
    });
  };
  const clearRecents = () => {
    setRecents([]);
    saveLocal("hhz-recent-places", []);
  };
  const [saved, setSaved] = useState(() => readSaved("hhz-saved", [])),
    [trips, setTrips] = useState([]);
  const [route, setRoute] = useState(null),
    [routeError, setRouteError] = useState(""),
    [routing, setRouting] = useState(false),
    [graphRequested, setGraphRequested] = useState(true),
    [graphReady, setGraphReady] = useState(false),
    [graphError, setGraphError] = useState(false),
    [status, setStatus] = useState(""),
    [srStatus, setSrStatus] = useState(""),
    [confirmClear, setConfirmClear] = useState(false),
    [locating, setLocating] = useState(false),
    [listLimit, setListLimit] = useState(12),
    [speaking, setSpeaking] = useState(false),
    [stepIndex, setStepIndex] = useState(0),
    [online, setOnline] = useState(navigator.onLine);
  const [currentLocation, setCurrentLocation] = useState(null);
  const [basemap, setBasemap] = useState(() => {
    const v = readSaved("hhz-basemap", "street");
    return Object.prototype.hasOwnProperty.call(BASEMAPS, v) ? v : "street";
  });
  const [basemapStatus, setBasemapStatus] = useState("loading");
  // 官方通行線（人行道）預設顯示；使用者關掉後會記住。
  const [showOfficialSidewalk, setShowOfficialSidewalk] = useState(() =>
    readSaved("hhz-show-sidewalk", true),
  );
  useEffect(() => {
    saveLocal("hhz-show-sidewalk", showOfficialSidewalk);
  }, [showOfficialSidewalk]);
  const [officialSidewalkStatus, setOfficialSidewalkStatus] = useState("idle");
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
  const needsData =
    tab !== "saved" ||
    modal === "sources" ||
    Boolean(searchFor);
  const waitingForData = needsData && !data && !loadError;
  // Tab change: facilities show on the map only while browsing them, the route
  // graph loads the first time 規劃路線 opens, and stale locate() replies drop.
  const tabVersion = useRef(0);
  useEffect(() => {
    tabVersion.current++;
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
  const officialRequest = useRef();
  const pendingVerifications = useRef(new Map());
  const lastConstruction = useRef(null);
  const [constructionConflict,setConstructionConflict] = useState(null);
  const [routeAttempt,setRouteAttempt]=useState(0);
  function verifyOnlineRoute(route, start, end, id, construction) {
    return new Promise(resolve => {
      const timer=setTimeout(()=>{pendingVerifications.current.delete(id);resolve({error:'UNVERIFIED_NETWORK'});},30000);
      pendingVerifications.current.set(id,result=>{clearTimeout(timer);resolve(result);});
      if (!worker.current) { clearTimeout(timer); pendingVerifications.current.delete(id); resolve({error:'UNVERIFIED_NETWORK'}); return; }
      worker.current.postMessage({type:'verify-official',id,route,start,end,construction,options:prefs});
    });
  }
  const panelScroll = useRef();
  const autoLocated = useRef(false);
  const routeFeedback = useRef();
  // Phone bottom sheet: 0 = peek, 1 = half, 2 = full (heights in style.css).
  const panelEl = useRef(),
    gripDragged = useRef(false);
  const [sheetSnap, setSheetSnap] = useState(1);
  // 地圖目前旋轉的角度（不是手機朝向）。指南針指針用它轉回正北。
  const [bearing, setBearing] = useState(0);
  const SHEET_SNAPS = [0.24, 0.56, 0.9];
  useEffect(()=>{if(route || routeError)setSheetSnap(v=>Math.max(v,1));},[route,routeError]);
  // 抽屜最高只拉到內容的高度：內容短時，拉到最上面下面不會留白。
  useLayoutEffect(() => {
    const el = panelEl.current,
      scroll = panelScroll.current;
    if (!el || !scroll) return;
    const measure = () => {
      const last = scroll.lastElementChild;
      if (!last) return;
      const pad = parseFloat(getComputedStyle(scroll).paddingBottom) || 0;
      const panelTop = el.getBoundingClientRect().top;
      const contentBottom =
        last.getBoundingClientRect().bottom + scroll.scrollTop + pad - panelTop;
      el.style.setProperty("--sheet-max", `${Math.ceil(contentBottom)}px`);
    };
    measure();
    const ro = new ResizeObserver(measure);
    for (const child of scroll.children) ro.observe(child);
    const mo = new MutationObserver(() => {
      ro.disconnect();
      for (const child of scroll.children) ro.observe(child);
      measure();
    });
    mo.observe(scroll, { childList: true });
    addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      mo.disconnect();
      removeEventListener("resize", measure);
    };
  });
  function gripDown(e) {
    const el = panelEl.current;
    if (!el || e.button > 0) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const startY = e.clientY,
      startH = el.getBoundingClientRect().height;
    gripDragged.current = false;
    el.classList.add("dragging");
    const move = (ev) => {
      const dy = startY - ev.clientY;
      if (Math.abs(dy) > 5) gripDragged.current = true;
      const max = parseFloat(el.style.getPropertyValue("--sheet-max")) || Infinity;
      el.style.setProperty("--sheet-h", `${Math.min(max, Math.max(110, startH + dy))}px`);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      el.classList.remove("dragging");
      const height = el.getBoundingClientRect().height;
      const max =
        parseFloat(el.style.getPropertyValue("--sheet-max")) || Infinity;
      el.style.removeProperty("--sheet-h");
      if (!gripDragged.current) return;
      setSheetSnap(
        nearestSheetSnapIndex(
          height,
          max,
          window.innerHeight,
          SHEET_SNAPS,
        ),
      );
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  }
  function resetNorth() {
    map.current?.setBearing?.(0);
    setBearing(0);
    announce("地圖已轉回正北。", { quiet: true });
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
  // 台北通 WebView 不支援新視窗：外部連結改用 open_link。
  useEffect(() => installTownPassLinks(), []);
  useEffect(() => {
    let active = true;
    townPassUserKey().then(async (userKey) => {
      if (!active) return;
      const key = userKey ? `hhz-profile-${userKey}` : "hhz-profile-local";
      const [stored, storedTrips] = await Promise.all([
        loadProfile(key),
        loadTrips(key),
      ]);
      if (!active) return;
      const savedPrefs = readSaved(
        userKey ? `${key}-preferences` : "hhz-preferences",
        null,
      );
      setProfileStorageKey(key);
      setTravelProfile(travelProfiles[stored] ? stored : null);
      setTrips(storedTrips);
      setPrefs({
        ...basePrefs,
        ...(savedPrefs || travelProfiles[stored]?.preferences || {}),
        avoidSteps: true,
        officialOnly: true,
      });
      setProfileReady(true);
      if (!travelProfiles[stored]) setModal("profile");
    });
    return () => {
      active = false;
    };
  }, []);
  const worker = useRef(),
    request = useRef(0),
    map = useRef(),
    announceTimer = useRef();
  // 提示分兩種：
  // - 一般提示（錯誤、需要使用者處理的事）：畫面上一定顯示。
  // - 操作確認（quiet）：只給螢幕報讀器唸；選了「聽障」出行方式或開啟「顯示操作提示」時，畫面上才顯示。
  // 所有提示都會送到報讀用的 live region，視障者不會漏聽。
  const showConfirmations =
    prefs.visualPrompts ?? travelProfile === "hearing";
  const announce = (text, { quiet = false } = {}) => {
    // 先清空再填入，同一句話重複出現時報讀器也會再唸一次。
    setSrStatus("");
    setTimeout(() => setSrStatus(text), 50);
    if (quiet && !showConfirmations) return;
    setStatus(text);
    clearTimeout(announceTimer.current);
    announceTimer.current = setTimeout(() => setStatus(""), 7000);
  };
  const boot = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const [fac, places, metro, sources] = await Promise.all(
        ["facilities", "places", "metro", "sources"].map(
          loadData,
        ),
      );
      const all = [...fac, ...places];
      setData({ fac, places, metro, sources, all });
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
    saveLocal(
      profileStorageKey === "hhz-profile-local"
        ? "hhz-preferences"
        : `${profileStorageKey}-preferences`,
      prefs,
    );
    document.documentElement.classList.toggle("large-text", prefs.largeText);
    document.documentElement.classList.toggle("high-contrast", prefs.contrast);
    document.documentElement.classList.toggle("color-friendly", prefs.colorFriendly);
  }, [prefs, profileStorageKey]);
  useEffect(() => {
    if (!graphRequested) return;
    const w = new Worker(new URL("./route-worker.js", import.meta.url), {
      type: "module",
    });
    worker.current = w;
    w.onmessage = ({ data: d }) => {
      if (d.type === 'verified-official') {
        pendingVerifications.current.get(d.id)?.(d.result);
        pendingVerifications.current.delete(d.id);
        return;
      }
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
        for(const resolve of pendingVerifications.current.values()) resolve({error:'UNVERIFIED_NETWORK'});
        pendingVerifications.current.clear();
        if (d.id != null && d.id !== request.current) return;
        clearRoute();
        setRouting(false);
        setGraphError(true);
        setRouteError('UNVERIFIED_NETWORK');
      }
    };
    w.postMessage({
      type: "init",
      url: new URL(
        dataUrl("graph") + "?policy=" + ROUTING_POLICY,
        location.href,
      ).href,
    });
    return () => { w.terminate(); for(const resolve of pendingVerifications.current.values()) resolve({error:'UNVERIFIED_NETWORK'}); pendingVerifications.current.clear(); };
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
    setConstructionConflict(null);
    setRouteAttempt(0);
    for(const resolve of pendingVerifications.current.values()) resolve({error:'UNVERIFIED_NETWORK'});
    pendingVerifications.current.clear();
    officialRequest.current?.abort();
    request.current++;
    window.speechSynthesis?.cancel();
    setSpeaking(false);
    setRouting(false);
    setRoute(null);
  }
  function selectPoint(p) {
    if (pick) changePoint(pick, p);
  }
  // 顯示、語音這類設定不影響路線，改了不清掉目前的路線。
  function updateDisplay(patch) {
    setPrefs((current) => ({ ...current, ...patch }));
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
  async function locate(which, useAsStart = false) {
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
      setCurrentLocation(p);
      setFocus({ ...p, token: Date.now() });
      if (useAsStart) setStart(p);
      if (which) changePoint(which, p);
      else if (!useAsStart) announce("已找到你的位置，可以看看附近有哪些設施。", { quiet: true });
    } catch (error) {
      if (!which || version === tabVersion.current)
        announce(locationErrorText(error));
    } finally {
      setLocating(false);
    }
  }
  function saveTravelProfile(id, closeSheet = true) {
    const profile = travelProfiles[id];
    if (!profile) return;
    setTravelProfile(id);
    void saveProfile(profileStorageKey, id);
    updatePrefs(profile.preferences);
    if (closeSheet) setModal(null);
  }
  useEffect(() => {
    if (!profileReady || !travelProfile || autoLocated.current) return;
    autoLocated.current = true;
    locate(null, true);
  }, [profileReady, travelProfile]);
  async function calculate(via = null) {
    if (start && end && navigator.onLine) {
      setGraphRequested(true);
      clearRoute();
      setRouteError("");
      setRouting(true);
      setTab("plan");
      const id = request.current,
        controller = new AbortController();
      officialRequest.current = controller;
      const timer = setTimeout(() => controller.abort(), 90000);
      try {
        const [result, construction] = await Promise.all([requestOfficialRoute(
          [start.lat, start.lon],
          [end.lat, end.lon],
          via ? { ...prefs, via: [via.lat, via.lon] } : prefs,
          controller.signal,
        ), fetchConstruction(controller.signal)]);
        if (!construction.error) lastConstruction.current=construction;
        if (id !== request.current) return;
        if (result.error) setRouteError(result.error);
        else if(construction.error) setRouteError(construction.error);
        else {
          let verified=await verifyOnlineRoute(result,[start.lat,start.lon],[end.lat,end.lon],id,construction);
          if(id!==request.current)return;
          if(!via && verified.error && verified.detourWaypoints?.length){
            const alternatives=await searchVerifiedAlternatives({start:[start.lat,start.lon],end:[end.lat,end.lon],waypoints:verified.detourWaypoints,signal:controller.signal,
              onProgress:n=>{if(id===request.current)setRouteAttempt(n);},
              query:(a,b,via,signal)=>requestOfficialRoute(a,b,{...prefs,via},signal),
              verify:candidate=>verifyOnlineRoute(candidate,[start.lat,start.lon],[end.lat,end.lon],id,construction)});
            if(id!==request.current)return;
            if(alternatives.route)verified={...alternatives.route,alternativeAttempts:alternatives.attempts};
            else if(alternatives.error==='CONSTRUCTION_UNAVAILABLE')verified=alternatives;
          }
          setConstructionConflict(verified.construction || null);
          if(verified.error || verified.geometryVerification !== 'official-polygons-and-crossings-v1' || verified.policyVersion !== ROUTING_POLICY) setRouteError(verified.error || 'UNVERIFIED_NETWORK');
          else { setRoute(via ? { ...verified, viaName: via.name } : verified); setStepIndex(0); }
        }
      } catch (error) {
        if (id === request.current) setRouteError(error.name === "AbortError" ? "OFFICIAL_TIMEOUT" : "OFFICIAL_UNAVAILABLE");
      } finally {
        clearTimeout(timer);
        if (id === request.current) setRouting(false);
      }
      return;
    }
    if (!start || !end) {
      announce("選好出發地和目的地，就能一起看看適合的走法。");
      return;
    }
    if (via) {
      announce("順路停靠需要網路連線，目前先維持原本的路線。");
      return;
    }
    if(!constructionFresh(lastConstruction.current)){setRouteError('CONSTRUCTION_UNAVAILABLE');return;}
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
      options: { ...prefs, avoidPoints },
      construction:lastConstruction.current,
    });
  }
  // 從詳細卡直接導航：沒有出發地時先取得目前位置，再規劃路線。
  const [routeRequest, setRouteRequest] = useState(0);
  useEffect(() => {
    if (routeRequest) calculate();
  }, [routeRequest]);
  async function navigateTo(place) {
    setSelected(null);
    changePoint("end", place);
    if (!start) {
      setLocating(true);
      try {
        const here = await getLocation();
        if (here.lat < 24.94 || here.lat > 25.24 || here.lon < 121.42 || here.lon > 121.69) {
          announce("你目前的位置在服務範圍外。可以先選一個臺北的出發地。");
          return;
        }
        setStart(here);
        setCurrentLocation(here);
      } catch (error) {
        announce(locationErrorText(error));
        return;
      } finally {
        setLocating(false);
      }
    }
    announce(`正在規劃前往${cleanName(place.name)}的路線。`, { quiet: true });
    setRouteRequest((n) => n + 1);
  }
  function addStop(kind) {
    const hit = nearestStop(route, data?.all, kind);
    if (!hit) {
      announce("這條路線 150 公尺內沒有這類設施。");
      return;
    }
    calculate({ lat: hit.place.lat, lon: hit.place.lon, name: cleanName(hit.place.name) });
  }
  // 台北通的 1999agree 會開啟 1999 語音通報對話框（需使用者同意）。
  function report1999() {
    if (!postToTownPass("1999agree", true)) window.location.href = "tel:1999";
  }
  const facilities = useMemo(
    () => data?.all.filter((p) => category(p) === filter) || [],
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
  const avoidPoints = useMemo(() => activeElevatorStops(data), [data]);
  const searchResults = useMemo(() => {
    if (!searchFor || !data || !profileReady) return [];
    const q = normalize(query);
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
      : [...recents, ...recentPlaces, ...saved];
    const used = new Set();
    return [...addressResults, ...list]
      .sort(
        (a, b) => {
          const exact = (a.name === query ? -1 : 0) - (b.name === query ? -1 : 0);
          if (exact) return exact;
          // 沒有輸入時保留紀錄原本的順序（最近的在最上面）。
          if (!q) return 0;
          return distance(viewport, a) - distance(viewport, b);
        },
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
    profileReady,
    query,
    searchFor,
    saved,
    trips,
    recents,
    addressResults,
    viewport.lat,
    viewport.lon,
  ]);
  // 搜尋到捷運站時，在結果最上方直接列出該站的電梯／坡道出口。
  const stationsFor = (name) =>
    data?.fac.filter(
      (p) => p.kind === "metro-elevator" && stationKey(p.station) === stationKey(name),
    ) || [];
  const stationCodesFor = (name) =>
    metroStationCodes(
      (data?.metro["metro-elevators"] || [])
        .filter(
          (record) =>
            stationKey(record["車站名稱"]) === stationKey(name),
        )
        .map((record) => record["車站編號"]),
    );
  const selectSearchPlace = (p) => {
    if (searchFor === "explore") {
      rememberPlace(p);
      setSearchFor(null);
      inspect(p);
      return;
    }
    const exits = ["20", "station"].includes(String(p.kind))
      ? stationsFor(p.name)
      : [];
    if (exits.length) {
      setQuery(exits[0].station || cleanName(p.name));
      announce(`請選擇${cleanName(p.name)}的電梯或坡道出口。`, {
        quiet: true,
      });
      return;
    }
    rememberPlace(p);
    changePoint(searchFor, p);
  };
  const exitUnderMaintenance = (p) =>
    avoidPoints.some(([lat, lon]) => lat === p.lat && lon === p.lon);
  const stationMatches = useMemo(() => {
    const q = normalize(query).replace(/站$/, "");
    if (!searchFor || !q || !data) return [];
    const seen = new Set();
    return (data.metro["metro-elevators"] || [])
      .filter((s) => {
        const n = normalize(s["車站名稱"]).replace(/站$/, "");
        return n && (n.includes(q) || q.includes(n));
      })
      .filter((s) => (seen.has(s["車站名稱"]) ? false : seen.add(s["車站名稱"])))
      .sort((a, b) => {
        const exact = (s) => normalize(s["車站名稱"]).replace(/站$/, "") === q;
        return exact(b) - exact(a);
      })
      .slice(0, 2)
      .map((s) => ({ s, name: s["車站名稱"], exits: stationsFor(s["車站名稱"]) }));
  }, [searchFor, query, data]);
  const routeWorks = route?.construction?.nearby?.slice(0,6) || [];
  const routeFacilities = useMemo(
    () =>
      ["toilet", "rest", "water", "health"]
        .flatMap((kind) =>
          facilitiesAlongRoute(route, data?.all, kind, 100, 4),
        )
        .sort((a, b) => a.order - b.order || a.near - b.near)
        .slice(0, 12),
    [route, data],
  );
  const endpointStationExits = useMemo(() => {
    const stationKeys = new Set(
      [start, end]
        .map((point) =>
          stationKey(
            point?.station ||
              (category(point || {}) === "station" ? point?.name : ""),
          ),
        )
        .filter(Boolean),
    );
    return (data?.fac || []).filter(
      (place) =>
        place.kind === "metro-elevator" &&
        stationKeys.has(stationKey(place.station)),
    );
  }, [data, start, end]);
  const routeMapItems = useMemo(() => {
    const unique = new Map();
    for (const place of [
      ...routeFacilities.map(({ place }) => place),
      ...endpointStationExits,
    ])
      unique.set(place.id, place);
    return [...unique.values()];
  }, [routeFacilities, endpointStationExits]);
  const avoidedWorks = route?.construction?.avoidedWorks || [];
  const avoidedStairs = route?.avoidedStairs || [];
  useEffect(() => {
    if(!route?.construction)return;
    const until=Date.parse(route.construction.sourceUpdatedAt)+CONSTRUCTION_MAX_AGE-Date.now();
    const timer=setTimeout(()=>{clearRoute();setRouteError('CONSTRUCTION_UNAVAILABLE');},Math.max(0,until));
    return ()=>clearTimeout(timer);
  }, [route]);
  useEffect(() => {
    window.speechSynthesis?.cancel();
    setSpeaking(false);
  }, [searchFor, modal]);
  function readRoute() {
    if (speaking) {
      speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }
    if (
      !route ||
      route.requiresEntryConfirmation ||
      route.policyVersion !== ROUTING_POLICY
    )
      return;
    const avoidedText =
      avoidedStairs.length || avoidedWorks.length
        ? `已避開${avoidedStairs.length ? `${avoidedStairs.length}處階梯` : ""}${avoidedStairs.length && avoidedWorks.length ? "與" : ""}${avoidedWorks.length ? `${avoidedWorks.length}處施工` : ""}。`
        : "";
    const toiletCount = routeFacilities.filter(
      ({ place }) => category(place) === "toilet",
    ).length;
    const facilityText = routeFacilities.length
      ? `沿途找到${routeFacilities.length}處設施${toiletCount ? `，其中${toiletCount}處為無障礙廁所` : ""}。`
      : "";
    const text = `從${start.name}前往${end.name}，路線長約${formatDistance(route.distance)}。${avoidedText}${facilityText}${route.steps.map((s) => `${stepText(s)}約${Math.round(s.distance)}公尺。`).join("")}路況仍需留意現場，這是路線預覽。`;
    speakText(text);
  }
  function speakText(text) {
    if (speaking) { window.speechSynthesis?.cancel(); setSpeaking(false); return; }
    if (!window.speechSynthesis) { announce("這個瀏覽器尚不支援朗讀，可以使用裝置的螢幕閱讀器。"); return; }
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "zh-TW";
    u.rate = Number(prefs.voiceRate) || 0.9;
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    speechSynthesis.speak(u);
    setSpeaking(true);
  }
  async function saveTrip() {
    if (
      !route ||
      route.requiresEntryConfirmation ||
      route.policyVersion !== ROUTING_POLICY
    )
      return;
    const entry = {
      id: Date.now().toString(),
      start,
      end,
      route,
      prefs,
      date: new Date().toISOString(),
    };
    const next = [entry, ...trips].slice(0, 12);
    if (await saveTrips(profileStorageKey, next)) {
      setTrips(next);
      announce("行程已存好，稍後可以從「收藏」再打開。", { quiet: true });
    } else announce("儲存空間不足，這次沒能存下行程。");
  }
  async function share() {
    if (
      !route ||
      route.requiresEntryConfirmation ||
      route.policyVersion !== ROUTING_POLICY
    )
      return;
    const text = `好好走｜${start.name} → ${end.name}\n約 ${formatDistance(route.distance)}\n${route.steps
      .slice(0, 20)
      .map((s) => `${s.name} ${Math.round(s.distance)}公尺`)
      .join("\n")}\n路線依公開路網規劃，部分通行條件尚未確認，請留意現場。`;
    try {
      if (navigator.share)
        await navigator.share({ title: "好好走・行程", text });
      else {
        await navigator.clipboard.writeText(text);
        announce("行程文字已複製，可以貼給同行的人。", { quiet: true });
      }
    } catch {
      announce("這次沒有分享行程，你可以稍後再試。");
    }
  }
  const inspect = (p) => {
    setSelected(p);
    setFocus({ ...p, token: Date.now() });
  };
  const retryWithEntrance = ['OFFICIAL_PATH_UNVERIFIED','OFFICIAL_ROAD_CONFLICT','OFFICIAL_CROSSING_UNVERIFIED','OFFICIAL_ENTRY_UNVERIFIED','OFFICIAL_NO_ROUTE','OFFICIAL_GAP','NO_CONNECTION','NO_ROUTE'].includes(routeError);
  const entranceChoices = useMemo(() => {
    if(!retryWithEntrance)return [];
    return [['start',start],['end',end]].flatMap(([which,point]) => {
      if(!point)return [];
      const picked=[];
      for(const p of (data?.fac || []).filter(p=>p.kind==='metro-elevator').map(p=>({...p,gap:distance(point,p)})).filter(p=>p.gap>=3&&p.gap<=300).sort((a,b)=>a.gap-b.gap)){
        if(picked.some(x=>distance(x,p)<20))continue;
        picked.push(p);if(picked.length===2)break;
      }
      return picked.map(p=>({which,p}));
    });
  }, [retryWithEntrance,data,start,end]);
  const errorText = {
    CONSTRUCTION_UNAVAILABLE: '施工資料暫時無法更新。請連上網路再查一次，附近設施仍可查看。',
    CONSTRUCTION_BLOCKED: '路線或入口遇到影響通行的施工通報，目前沒有找到通過檢查的替代路線。可以換個出入口再試。',

    OFFICIAL_PATH_UNVERIFIED: '這次還沒找到合適的走法。可以改從附近的電梯出口出發，或選擇另一個目的地入口。',
    OFFICIAL_ROAD_CONFLICT: '這次還沒找到合適的過街走法，可以換個入口再找找看。',
    OFFICIAL_CROSSING_UNVERIFIED: '這次還沒找到合適的過街走法，可以試試附近的電梯出口。',
    OFFICIAL_ENTRY_UNVERIFIED: '這個地點可能有不同入口，選擇實際使用的電梯出口，再幫你找路。',
    OFFICIAL_NO_ROUTE:
      "這次還沒找到連接兩地的走法，可以試試另一個入口。",
    OFFICIAL_BLOCKED:
      "官方回傳的替代路線包含不利通行路段，因此沒有列為建議路線。可以更換入口或目的地。",
    OFFICIAL_GAP: "這次還沒找到完整走法，可以選擇附近入口再試。",
    OFFICIAL_DIMENSIONS:
      "官方路線沒有完整淨寬與坡度，無法符合你選擇的「寬度、坡度都有資料」條件。",
    OFFICIAL_INVALID: "官方路線資料不完整，請稍後再試。",
    OFFICIAL_UNAVAILABLE:
      "官方路線服務暫時無法連線，請稍後再試。附近設施與收藏仍可使用。",
    OFFICIAL_OUTSIDE_COVERAGE:
      "起點或目的地超出目前的臺北路線查詢範圍。可以搜尋臺北的地點作為起點，再規劃這段行程。",
    OFFICIAL_INVALID_POINTS:
      "這個位置沒有完整的定位資料，請重新選擇出發地或目的地。",
    OFFICIAL_TIMEOUT:
      "這次查詢等得有點久，還沒收到路線。可以再試一次，或先查看附近設施。",
    OFFICIAL_NETWORK:
      "目前連不上路線服務，請確認網路後再試。選好的起點和目的地會留在這裡。",
    OFFICIAL_NOT_CONFIGURED:
      "這個版本的路線服務尚未就緒，暫時無法規劃。附近設施仍可查詢。",
    UNVERIFIED_NETWORK:
      "人行路網資料尚未完成驗證，暫時無法規劃。請重新載入後再試。",
    NO_CONNECTION:
      "選擇實際使用的人行入口，我們再幫你找路。",
    NO_ROUTE:
      "這次還沒找到合適的走法，可以換個入口，或先看看附近設施。",
    SAME_POINT: "這兩個位置很接近，可以再確認一下目的地入口。",
  };
  return (
    <div className="app-shell">
      {speaking && !searchFor && !modal && <button className="voice-stop" onClick={() => { window.speechSynthesis?.cancel(); setSpeaking(false); }}><VolumeX size={18} aria-hidden="true"/>停止朗讀</button>}
      <a className="skip-link" href="#main-content">
        跳至服務內容
      </a>
      <div className="workspace" data-sheet={sheetSnap}>
        <aside
          className="panel"
          id="main-content"
          ref={panelEl}
          data-snap={sheetSnap}
          onPointerDown={(e) => {
            if (!matchMedia("(max-width: 700px)").matches || sheetSnap !== 0)
              return;
            if (e.target.closest(".sheet-grip")) return;
            gripDown(e);
          }}
          onClickCapture={(e) => {
            if (!gripDragged.current) return;
            e.preventDefault();
            e.stopPropagation();
            gripDragged.current = false;
          }}
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
          <nav className="main-nav" aria-label="主要功能">
            {[
              ["explore", "找設施", Compass],
              ["plan", "規劃路線", Route],
              ["saved", "收藏", Heart],
            ].map(([id, label, C]) => (
              <button
                key={id}
                className={tab === id ? "active" : ""}
                aria-label={label}
                onClick={() => {
                  setTab(id);
                  setPick(null);
                  setSheetSnap((v) => Math.max(v, 1));
                }}
                aria-current={tab === id ? "page" : undefined}
              >
                <C size={24} aria-hidden="true" />
                <span>{label}</span>
              </button>
            ))}
            <button
              className="nav-utility"
              aria-label="設定"
              onClick={() => setModal("prefs")}
            >
              <SlidersHorizontal size={22} aria-hidden="true" />
            </button>
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
                  {filters.map(([id, label, C]) => (
                    <button
                      key={id}
                      className={`icon-action filter-action ${filter === id ? "selected" : ""}`}
                      aria-label={label}
                      aria-pressed={filter === id}
                      onClick={() => {
                        setFilter(id);
                        setListLimit(12);
                      }}
                    >
                      <C size={20} aria-hidden="true" />
                      <span>{label}</span>
                    </button>
                  ))}
                </div>
                <p className="list-caption icon-caption">
                  <Navigation size={18} aria-hidden="true" />
                  <span className="sr-only">離地圖中心由近到遠</span>
                </p>
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
                    className="load-more icon-action"
                    aria-label="顯示更多設施"
                    onClick={() => setListLimit((n) => n + 15)}
                  >
                    <ChevronDown size={20} aria-hidden="true" />
                  </button>
                )}
              </>
            )}
            {tab === "plan" && (
              <>
                <h1 className="sr-only">規劃路線</h1>
                <div className="endpoints">
                  <div className="route-rail">
                    <i className="rail-start" aria-hidden="true" />
                    <button
                      className="swap"
                      aria-label="交換出發地與目的地"
                      onClick={() => {
                        setStart(end);
                        setEnd(start);
                        clearRoute();
                        setRouting(false);
                        request.current++;
                      }}
                    >
                      <ArrowUpDown size={18} aria-hidden="true" />
                    </button>
                    <i className="rail-end" aria-hidden="true" />
                  </div>
                  <div className="point-fields">
                    {[
                      ["start", "從哪裡出發", "選擇出發地", "出發地", start],
                      ["end", "想去哪裡", "選擇目的地", "目的地", end],
                    ].map(([which, label, placeholder, noun, point]) => (
                      <div className="point-row" key={which}>
                        <button
                          className="point-main"
                          onClick={() => openSearch(which)}
                          aria-label={point ? `${noun}：${point.name}，點一下重新選擇` : placeholder}
                        >
                          <small>{label}</small>
                          <strong className={point ? "" : "placeholder"}>
                            {point?.name || placeholder}
                          </strong>
                        </button>
                        <div className="point-tools">
                          <button
                            className="point-tool"
                            aria-label={`用目前位置當${noun}`}
                            onClick={() => locate(which)}
                            disabled={locating}
                          >
                            <LocateFixed size={20} aria-hidden="true" />
                          </button>
                          <button
                            className="point-tool"
                            aria-label={`在地圖上選${noun}`}
                            aria-pressed={pick === which}
                            onClick={() => {
                              setPick(which);
                              setSheetSnap(0);
                              announce(`請在地圖上點選${noun}。`, { quiet: true });
                            }}
                          >
                            <MapPin size={20} aria-hidden="true" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                {!online && <div className="mode-tabs" aria-label="路線偏好">
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
                </div>}
                <button
                  className="primary full"
                  onClick={() => calculate()}
                  disabled={routing || waitingForData}
                >
                  {routing ? (
                    <LoaderCircle className="spin" size={19} />
                  ) : (
                    <Route size={19} />
                  )}{" "}
                  {routing ? (routeAttempt ? `正在嘗試第 ${routeAttempt} 條繞路…` : "正在找路線…") : "規劃路線"}
                  <ArrowRight size={19} />
                </button>
                {!graphReady && !online && (
                  <p className="quiet-note">
                    {graphError
                      ? "路線資料暫時讀取不到，請重新整理再試。"
                      : "路網正在背景準備，請先選擇起點與終點。"}
                  </p>
                )}
                {routeError && (
                  <div className={`notice ${retryWithEntrance ? "route-recovery" : ""}`} role="status" ref={routeFeedback}>
                    <Info />
                    <div>
                    <p>
                      {errorText[routeError] || "暫時無法規劃，請稍後再試。"}
                    </p>
                    {retryWithEntrance && entranceChoices.length > 0 && <div className="entrance-choices">
                      <p>附近捷運電梯出口（距離為直線估算，選擇後會更改起終點，需重新規劃）</p>
                      {entranceChoices.map(({which,p}) => <button key={which+p.id} onClick={()=>changePoint(which,p)}>
                        <ArrowUpFromLine size={18} aria-hidden="true"/><span>{which==='start'?'出發地改為':'目的地改為'} {cleanName(p.name)}<small>距原選點約 {formatDistance(p.gap)}</small></span><ChevronRight size={18} aria-hidden="true"/>
                      </button>)}
                    </div>}
                    {constructionConflict?.blocked?.slice(0,3).map(w => <p key={w.id}>{w.address}：{w.match === 'vicinity' ? '鄰近影響通行的施工位置' : '與影響通行的施工範圍交會'}。{w.plan}</p>)}
                    {(retryWithEntrance || ["OFFICIAL_OUTSIDE_COVERAGE", "OFFICIAL_INVALID_POINTS", "OFFICIAL_ENTRY_UNVERIFIED", "OFFICIAL_PATH_UNVERIFIED", "OFFICIAL_ROAD_CONFLICT", "OFFICIAL_CROSSING_UNVERIFIED", "CONSTRUCTION_BLOCKED"].includes(routeError)) && (
                      <div className="route-tools">
                        <button onClick={() => openSearch("start")}>重選出發地</button>
                        <button onClick={() => openSearch("end")}>重選目的地</button>
                      </div>
                    )}
                    </div>
                  </div>
                )}
                {route && (
                  <>
                    {route.construction && <p className="quiet-note">施工資料更新：{new Date(route.construction.sourceUpdatedAt).toLocaleString('zh-TW', {timeZone:'Asia/Taipei'})}{route.construction.unmapped > 0 ? ` · ${route.construction.unmapped} 處施工位置待確認` : ''}</p>}
                    {route.viaName && (
                      <p className="quiet-note">順路停靠：{route.viaName}</p>
                    )}
                    {avoidPoints.length > 0 && (
                      <p className="quiet-note">
                        今天有捷運電梯保養，離線規劃會盡量不從那些出口經過。
                      </p>
                    )}
                    <div className="route-summary">
                      <div>
                        <span className="eyebrow">路線預覽</span>
                        <h2>{formatDistance(route.distance)}</h2>
                        <p>
                          {route.provider === "local-verified" ? "另一條人行路線" : route.provider === "local-detour" ? "已改走避開施工的人行路線" : route.provider === "taipei-official"
                            ? "臺北市無障礙通行路線圖台回傳"
                            : "離線人行路網參考"}
                        </p>
                      </div>
                      <span className="route-symbol">
                        <Footprints size={32} />
                      </span>
                    </div>
                    {route.unknownPct > 0 && <p className="quiet-note">路寬／坡度：尚無完整資料</p>}
                    {!route.requiresEntryConfirmation && (route.startGap > 10 || route.endGap > 10) && (
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
                    {(avoidedStairs.length > 0 || avoidedWorks.length > 0) && (
                      <>
                        <h2 className="section-title">這條路線已避開</h2>
                        <div className="route-context-list">
                          {avoidedStairs.map((stair) => (
                            <button
                              type="button"
                              key={`stair-${stair.way}-${stair.lat}-${stair.lon}`}
                              onClick={() =>
                                setFocus({
                                  lat: stair.lat,
                                  lon: stair.lon,
                                  zoom: 18,
                                  token: Date.now(),
                                })
                              }
                            >
                              <AlertTriangle size={19} aria-hidden="true" />
                              <span>
                                <b>階梯 · {cleanName(stair.name)}</b>
                                <small>點一下查看避開的位置</small>
                              </span>
                              <ChevronRight size={18} aria-hidden="true" />
                            </button>
                          ))}
                          {avoidedWorks.map((work) => {
                            const point = work.geometry?.coordinates?.[0];
                            return (
                              <button
                                type="button"
                                key={`work-${work.id}`}
                                onClick={() =>
                                  point &&
                                  setFocus({
                                    lat: point[0],
                                    lon: point[1],
                                    zoom: 18,
                                    token: Date.now(),
                                  })
                                }
                              >
                                <AlertTriangle size={19} aria-hidden="true" />
                                <span>
                                  <b>施工 · {work.address}</b>
                                  <small>
                                    {work.match === "vicinity"
                                      ? "已避開通報位置周邊"
                                      : "已避開施工範圍"}
                                  </small>
                                </span>
                                <ChevronRight size={18} aria-hidden="true" />
                              </button>
                            );
                          })}
                        </div>
                      </>
                    )}
                    {routeFacilities.length > 0 && (
                      <>
                        <h2 className="section-title">沿途設施</h2>
                        <div
                          className="route-context-list"
                          aria-label="沿途設施"
                        >
                          {routeFacilities.map(({ place, near }) => {
                            const FacilityIcon =
                              icons[category(place)] || MapPin;
                            return (
                              <button
                                type="button"
                                key={place.id}
                                onClick={() => inspect(place)}
                              >
                                <FacilityIcon size={19} aria-hidden="true" />
                                <span>
                                  <b>{cleanName(place.name)}</b>
                                  <small>
                                    {labels[category(place)] || "設施"} ·
                                    距路線約 {formatDistance(near)}
                                  </small>
                                </span>
                                <ChevronRight size={18} aria-hidden="true" />
                              </button>
                            );
                          })}
                        </div>
                      </>
                    )}
                    {!route.viaName && !route.requiresEntryConfirmation && (
                      <div className="point-actions" aria-label="順路停靠">
                        <button
                          type="button"
                          aria-label="順路找無障礙廁所"
                          onClick={() => addStop("toilet")}
                        >
                          <Toilet size={20} aria-hidden="true" />
                          廁所
                        </button>
                        <button
                          type="button"
                          aria-label="順路找歇腳椅"
                          onClick={() => addStop("rest")}
                        >
                          <Armchair size={20} aria-hidden="true" />
                          歇腳
                        </button>
                        <button
                          type="button"
                          aria-label="順路找飲水處"
                          onClick={() => addStop("water")}
                        >
                          <GlassWater size={20} aria-hidden="true" />
                          飲水
                        </button>
                        <button
                          type="button"
                          aria-label="順路找醫療設施"
                          onClick={() => addStop("health")}
                        >
                          <Hospital size={20} aria-hidden="true" />
                          醫療
                        </button>
                      </div>
                    )}
                    <div className="route-tools icon-actions">
                      <button
                        type="button"
                        className="icon-action emergency-action"
                        aria-label="1999 通報路障"
                        onClick={report1999}
                      >
                        <Phone size={19} aria-hidden="true" />
                        <span>1999</span>
                      </button>
                      <button
                        className="icon-action"
                        aria-label="存下行程"
                        onClick={saveTrip}
                        disabled={route.requiresEntryConfirmation}
                      >
                        <Bookmark size={20} aria-hidden="true" />
                      </button>
                      <button
                        className="icon-action"
                        aria-label="分享"
                        onClick={share}
                        disabled={route.requiresEntryConfirmation}
                      >
                        <Share2 size={20} aria-hidden="true" />
                      </button>
                      {"speechSynthesis" in window && (
                        <button
                          className="icon-action"
                          aria-label={speaking ? "停止朗讀" : "聽路線"}
                          onClick={readRoute}
                          disabled={route.requiresEntryConfirmation}
                        >
                          {speaking ? (
                            <VolumeX size={20} aria-hidden="true" />
                          ) : (
                            <Volume2 size={20} aria-hidden="true" />
                          )}
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
                                {s.unknown &&
                                route.provider !== "taipei-official"
                                  ? " · 通行條件待確認"
                                  : ""}
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
                          顯示路線附近的施工通報。
                        </p>
                        {routeWorks.map((c, i) => (
                          <div className="notice" key={i}>
                            <AlertTriangle size={18} />
                            <p>
                              <b>{c.address}</b>
                              <br />
                              {c.start}—{c.end}
                              <br />
                              {c.plan || "通行影響請依現場指引確認。"}
                            </p>
                          </div>
                        ))}
                      </>
                    )}
                  </>
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
                          void saveTrips(profileStorageKey, next);
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
          </div>
        </aside>
        <main className="map-area" aria-label="地圖與設施">
          <MapView
            items={
              route
                ? routeMapItems
                : tab === "explore"
                  ? mapItems
                  : endpointStationExits
            }
            basemap={basemap}
            showOfficialSidewalk={showOfficialSidewalk}
            colorFriendly={prefs.colorFriendly}
            onBasemapStatus={setBasemapStatus}
            onOfficialSidewalkStatus={setOfficialSidewalkStatus}
            route={route}
            start={start}
            end={end}
            location={currentLocation}
            focus={{ ...viewport, ...focus }}
            pick={pick}
            onPick={selectPoint}
            onSelect={inspect}
            onViewport={setViewport}
            onBearing={setBearing}
            onMapReady={(m) => (map.current = m)}
            onGesture={() => {
              if (
                matchMedia("(max-width: 700px)").matches &&
                sheetSnap > 0
              )
                setSheetSnap(0);
            }}
          />
          <div
            className={`map-dock ${layersOpen ? "open" : ""}`}
            ref={layersRef}
          >
            <button
              className="map-fab"
              aria-label="地圖圖層"
              aria-expanded={layersOpen}
              aria-controls="layers-panel"
              onClick={() => {
                if (!layersOpen && matchMedia("(max-width: 700px)").matches)
                  setSheetSnap(0);
                setLayersOpen(!layersOpen);
              }}
            >
              <Layers size={20} />
            </button>
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
                  <span className="layer-toggle-copy">
                    <b>
                      <i className="sidewalk-legend" aria-hidden="true" />
                      官方通行線
                    </b>
                    {sidewalkStatusText[officialSidewalkStatus] && (
                      <small>
                        {sidewalkStatusText[officialSidewalkStatus]}
                      </small>
                    )}
                  </span>
                  <input
                    type="checkbox"
                    checked={showOfficialSidewalk}
                    onChange={(e) =>
                      setShowOfficialSidewalk(e.target.checked)
                    }
                  />
                </label>
              </div>
            )}
          </div>
          <button
            className="map-fab map-compass"
            aria-label={bearing ? `指南針，地圖已旋轉 ${Math.round(bearing)} 度，點一下轉回正北` : "指南針，地圖朝北"}
            onClick={resetNorth}
          >
            <svg
              className="compass-rose"
              viewBox="0 0 24 24"
              width="22"
              height="22"
              style={{ transform: `rotate(${-bearing}deg)` }}
              aria-hidden="true"
            >
              <path className="compass-north" d="M12 2.5 15.2 12 12 10.2 8.8 12Z" />
              <path className="compass-south" d="M12 21.5 8.8 12 12 13.8 15.2 12Z" />
              <circle className="compass-hub" cx="12" cy="12" r="1.3" />
            </svg>
          </button>
          <button
            className="map-fab map-locate"
            aria-label="移至我的位置"
            onClick={() => locate()}
            disabled={locating}
          >
            {locating ? (
              <LoaderCircle className="spin" size={20} />
            ) : (
              <Navigation size={20} />
            )}
          </button>
          <div className="dock-group map-zoom">
            <button aria-label="放大地圖" onClick={() => map.current?.zoomIn()}>
              <Plus size={20} />
            </button>
            <button
              aria-label="縮小地圖"
              onClick={() => {setSheetSnap(0); map.current?.zoomOut();}}
            >
              <Minus size={20} />
            </button>
          </div>
          {pick && (
            <div className="pick-prompt" role="status" aria-live="polite">
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
      <div className="sr-only" role="status" aria-live="polite">
        {srStatus}
      </div>
      <div
        className={`toast ${status ? "visible" : ""}`}
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
          <div className="search-launch input search-with-voice">
            <Search size={21} aria-hidden="true" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="地點、捷運站、地址"
              aria-label="搜尋地點"
            />
            <VoiceSearch onResult={setQuery} />
          </div>
          {stationMatches.map(({ s, name, exits }) => {
            const pickExit = (p) => {
              rememberPlace(p);
              if (searchFor === "explore") {
                setSearchFor(null);
                inspect(p);
              } else changePoint(searchFor, p);
            };
            return (
              <section className="station-group" key={name} aria-label={`${stationLabel(name)}的無障礙出口`}>
                <div className="station-group-head">
                  <span className="station-icon">
                    <MetroStationIcon codes={stationCodesFor(name)} />
                  </span>
                  <span>
                    <strong>{stationLabel(name)}</strong>
                    <small>{s["路線別"]} · {exits.length ? `${exits.length} 處電梯／坡道出口` : "沒有出口座標"}</small>
                  </span>
                </div>
                {exits.map((p) => (
                  <FacilityRow
                    key={p.id}
                    p={p}
                    from={viewport}
                    note={exitUnderMaintenance(p) ? "今天有保養，可能無法使用" : ""}
                    onSelect={pickExit}
                  />
                ))}
                <p className="quiet-note">
                  只標示出入口位置；大廳到月台的電梯請看車站資訊。
                </p>
                <button
                  className="text-button station-more"
                  onClick={() => {
                    setSearchFor(null);
                    setSelected({
                      id: `station-${name}-${s["路線別"]}`,
                      name: stationLabel(name),
                      kind: "station-detail",
                      record: s,
                      exits,
                    });
                  }}
                >
                  車站資訊與保養時段
                  <ChevronRight size={16} />
                </button>
              </section>
            );
          })}
          {query && searchResults.length > 0 && (
            <p className="list-caption">找到 {searchResults.length} 個地方</p>
          )}
          {!query && searchResults.length > 0 && (
            <div className="list-caption recent-caption">
              <span>最近</span>
              {recents.length > 0 && (
                <button type="button" className="text-button" onClick={clearRecents}>
                  清除
                </button>
              )}
            </div>
          )}
          {searchResults.map((p) => (
            <FacilityRow
              key={p.id}
              p={p}
              from={viewport}
              onSelect={selectSearchPlace}
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
          <p className="quiet-note profile-note">
            偏好只保存在這部裝置。路網沒有寬度或坡度資料時，會標示為未知；路線仍需留意現場。
          </p>
          <button
            className="primary full"
            onClick={() => saveTravelProfile(profileDraft)}
          >
            開始使用
            <ArrowRight size={18} />
          </button>
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
                <MetroStationIcon
                  codes={stationCodesFor(selected.record["車站名稱"])}
                />
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
                車站預定保養時段
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
                    ? "查看下方電梯位置與保養時間。"
                    : category(selected) === "toilet"
                      ? "資料記載設有無障礙廁所，實際開放時間與內部設備請以現場為準。"
                      : "這是公開資料記載的位置，實際通行與開放情形請留意現場。"}
                </p>
              </div>
              <button
                className="primary full detail-primary"
                aria-label="我要到這裡"
                onClick={() => navigateTo(selected)}
              >
                <Navigation size={22} aria-hidden="true" />
                前往這裡
              </button>
              <div className="detail-actions icon-actions">
                <button
                  className="secondary"
                  aria-label="從這裡出發"
                  onClick={() => {
                    changePoint("start", selected);
                    setSelected(null);
                  }}
                >
                  <MapPin size={20} aria-hidden="true" />
                  從這裡出發
                </button>
                <button
                  className="secondary icon-action"
                  aria-label={
                    saved.some((x) => x.id === selected.id)
                      ? "取消收藏"
                      : "收藏"
                  }
                  onClick={() => toggleSave(selected)}
                >
                  <Heart
                    size={20}
                    aria-hidden="true"
                    fill={
                      saved.some((x) => x.id === selected.id)
                        ? "currentColor"
                        : "none"
                    }
                  />
                </button>
              </div>
              {selected.station && (
                <button
                  className="full text-button"
                  aria-label="查看這個車站的電梯資訊"
                  onClick={() => {
                    const record = (data?.metro["metro-elevators"] || []).find(
                      (r) => stationKey(r["車站名稱"]) === stationKey(selected.station),
                    );
                    if (!record) {
                      announce("這個車站目前沒有電梯位置說明。");
                      return;
                    }
                    setSelected({
                      id: `station-${record["車站名稱"]}-${record["路線別"]}`,
                      name: stationLabel(record["車站名稱"]),
                      kind: "station-detail",
                      record,
                      exits: stationsFor(record["車站名稱"]),
                    });
                  }}
                >
                  <ArrowUpFromLine size={20} aria-hidden="true" />
                  車站電梯資訊
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
        <Sheet title="設定" onClose={() => { setConfirmClear(false); setModal(null); }}>
          <section className="settings-group" aria-labelledby="set-mobility">
            <h3 id="set-mobility">通行</h3>
            <div className="settings-list">
              <label className="settings-row">
                <span>出行方式</span>
                <select
                  value={travelProfile || "walking"}
                  onChange={(event) => saveTravelProfile(event.target.value, false)}
                >
                  {Object.entries(travelProfiles).map(([id, profile]) => (
                    <option key={id} value={id}>{profile.label}</option>
                  ))}
                </select>
              </label>
              <div className="settings-row settings-row--stack">
                <span id="set-mode">路線偏好</span>
                <div className="segmented" role="radiogroup" aria-labelledby="set-mode">
                  {Object.entries({ balanced: "均衡", gentle: "平緩", crossings: "少過街" }).map(([id, name]) => (
                    <button
                      key={id}
                      type="button"
                      role="radio"
                      aria-checked={prefs.mode === id}
                      aria-label={routeModes[id]}
                      className={prefs.mode === id ? "active" : ""}
                      onClick={() => updatePrefs({ mode: id })}
                    >
                      {name}
                    </button>
                  ))}
                </div>
              </div>
              <details className="settings-advanced">
                <summary>進階</summary>
                <label className="settings-row settings-row--stack">
                  <span>通道寬度<b>{prefs.minWidth} 公尺以上</b></span>
                  <input
                    type="range"
                    min="0.6"
                    max="1.5"
                    step="0.1"
                    value={prefs.minWidth}
                    aria-describedby="set-known-note"
                    onChange={(e) => updatePrefs({ minWidth: Number(e.target.value) })}
                  />
                </label>
                <label className="settings-row settings-row--stack">
                  <span>坡度上限<b>{prefs.maxSlope}%</b></span>
                  <input
                    type="range"
                    min="2"
                    max="15"
                    step="1"
                    value={prefs.maxSlope}
                    aria-describedby="set-known-note"
                    onChange={(e) => updatePrefs({ maxSlope: Number(e.target.value) })}
                  />
                </label>
                <label className="settings-row">
                  <span>只走有寬度、坡度資料的路段</span>
                  <input
                    type="checkbox"
                    className="switch"
                    checked={prefs.knownOnly}
                    aria-describedby="set-known-note"
                    onChange={(e) => updatePrefs({ knownOnly: e.target.checked })}
                  />
                </label>
                <p className="sr-only" id="set-known-note">
                  寬度與坡度只套用在有記載資料的路段；只走有資料的路段時，可能找不到路線。
                </p>
                <button
                  type="button"
                  className="settings-link"
                  onClick={() => saveTravelProfile(travelProfile || "walking", false)}
                >
                  恢復出行方式預設
                </button>
              </details>
            </div>
          </section>
          <section className="settings-group" aria-labelledby="set-display">
            <h3 id="set-display">顯示</h3>
            <div className="settings-list">
              <label className="settings-row">
                <span>放大文字</span>
                <input type="checkbox" className="switch" checked={prefs.largeText}
                  onChange={(e) => updateDisplay({ largeText: e.target.checked })} />
              </label>
              <label className="settings-row">
                <span>高對比</span>
                <input type="checkbox" className="switch" checked={prefs.contrast}
                  onChange={(e) => updateDisplay({ contrast: e.target.checked })} />
              </label>
              <label className="settings-row">
                <span>色覺友善地圖</span>
                <input type="checkbox" className="switch" checked={!!prefs.colorFriendly}
                  aria-describedby="set-color-note"
                  onChange={(e) => updateDisplay({ colorFriendly: e.target.checked })} />
              </label>
              <label className="settings-row">
                <span>顯示操作提示</span>
                <input type="checkbox" className="switch" checked={showConfirmations}
                  aria-describedby="set-prompt-note"
                  onChange={(e) => updateDisplay({ visualPrompts: e.target.checked })} />
              </label>
            </div>
          </section>
          <p className="sr-only" id="set-color-note">降低底圖色彩，設施加上文字標記，不只靠顏色辨認。</p>
          <p className="sr-only" id="set-prompt-note">例如地圖已轉回正北、行程已存好。螢幕報讀器一律會唸出。</p>
          <section className="settings-group" aria-labelledby="set-voice">
            <h3 id="set-voice">語音</h3>
            <div className="settings-list">
              <div className="settings-row settings-row--stack">
                <label htmlFor="set-rate"><span>朗讀速度<b>{prefs.voiceRate || 0.9} 倍</b></span></label>
                <div className="settings-inline">
                  <input id="set-rate" type="range" min="0.6" max="1.2" step="0.1"
                    value={prefs.voiceRate || 0.9}
                    onChange={(e) => updateDisplay({ voiceRate: Number(e.target.value) })} />
                  <button
                    type="button"
                    className="icon-button settings-play"
                    aria-label={speaking ? "停止試聽" : "試聽朗讀速度"}
                    onClick={() => speakText("你好，這是目前的朗讀速度。")}
                  >
                    {speaking ? <VolumeX size={20} aria-hidden="true" /> : <Volume2 size={20} aria-hidden="true" />}
                  </button>
                </div>
              </div>
            </div>
          </section>
          <section className="settings-group" aria-labelledby="set-data">
            <h3 id="set-data">資料</h3>
            <div className="settings-list">
              <button
                type="button"
                className="settings-row settings-entry"
                onClick={() => setModal("sources")}
              >
                <Info size={20} aria-hidden="true" />
                <span>資料來源</span>
                <ChevronRight size={18} aria-hidden="true" />
              </button>
              <button
                type="button"
                className="settings-row settings-entry"
                onClick={() => setModal("about")}
              >
                <HelpCircle size={20} aria-hidden="true" />
                <span>關於</span>
                <ChevronRight size={18} aria-hidden="true" />
              </button>
              {!confirmClear ? (
                <button type="button" className="settings-row settings-danger" onClick={() => setConfirmClear(true)}>
                  清除這支手機上的資料
                </button>
              ) : (
                <div className="settings-row settings-row--stack settings-confirm" role="group" aria-labelledby="set-clear-q">
                  <span id="set-clear-q">要清除收藏、行程和所有設定嗎？清除後無法復原。</span>
                  <div className="settings-inline">
                    <button type="button" className="secondary" autoFocus onClick={() => setConfirmClear(false)}>取消</button>
                    <button type="button" className="danger-solid" onClick={async () => { await clearLocalData(); location.reload(); }}>確定清除</button>
                  </div>
                </div>
              )}
            </div>
          </section>
        </Sheet>
      )}
      {modal === "about" && (
        <Sheet title="關於好好走" onClose={() => setModal("prefs")}>
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
          <p>
            語音輸入：按搜尋框旁的麥克風後才會收音；辨識可能由瀏覽器的線上語音服務處理，本服務不儲存錄音。
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
        <Sheet title="資料從哪裡來" onClose={() => setModal("prefs")}>
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
                {sourceCountLabel(s)}{" "}
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
          <div className="source-card">
            <b>臺北捷運車站圖標・Wikimedia Commons</b>
            <span>臺北大眾捷運股份有限公司；公有領域，圖示存放於本站</span>
            <a
              href="https://commons.wikimedia.org/wiki/Category:Taipei_Metro_station_icons"
              target="_blank"
              rel="noopener"
            >
              圖標來源與授權
              <ExternalLink size={14} />
            </a>
          </div>
          <p className="quiet-note">
            線上規劃使用臺北市無障礙通行路線平臺的通道路網，排除服務標記的障礙替代路線。
            離線規劃以 OSM 獨立人行段及市府人行空間、行穿線圖資交叉檢查。
            輪行臺北部分寬度值與文件單位有疑義，尚未用於寬度判定；圖資不是現場通行認證。
          </p>
          <a href="https://tppano.gov.taipei/tp_roadsidewalkplatform_public/" target="_blank" rel="noopener">臺北市無障礙通行路線平臺</a>
        </Sheet>
      )}
    </div>
  );
}
