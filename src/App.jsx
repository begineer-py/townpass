import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  MapPin,
  ArrowUpDown,
  ArrowRight,
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
  Menu,
} from "lucide-react";
import MapView from "./MapView";
import VoiceSearch from "./VoiceSearch";
import {fetchConstruction} from "./construction-client.mjs";
import {constructionFresh, CONSTRUCTION_MAX_AGE} from "./construction.mjs";
import { requestOfficialRoute } from "./official-router.mjs";
import { ROUTING_POLICY } from "./routing.mjs";
import { BASEMAPS } from "./basemaps.mjs";
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
  ["all", "常用設施"],
  ["elevator", "電梯出口"],
  ["toilet", "無障礙廁所"],
  ["rest", "歇歇腳"],
  ["water", "飲水處"],
  ["ramp", "坡道"],
  ["park", "公園"],
  ["friendly", "友善店家"],
  ["bus", "公車站"],
  ["parking", "停車設施"],
  ["health", "醫療與藥局"],
];
const features = [
  ["explore", "找設施", Compass],
  ["plan", "規劃路線", Route],
  ["stations", "捷運出口", TrainFront],
  ["saved", "收藏", Heart],
];
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
  officialOnly: true,
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
  const k = category(p);
  return (
    <div className="facility-row">
      <button className="facility-main" onClick={() => onSelect(p)}>
        <span className={`facility-icon ${k}`}>
          <Icon kind={k} />
        </span>
        <span className="facility-copy">
          <strong>{cleanName(p.name)}</strong>
          <span>
            {labels[k] || "設施"}
            {p.exit ? ` · ${p.exit}` : ""}
          </span>
        </span>
        <span className="distance">
          {formatDistance(distance(from, p))}
          <ChevronRight size={15} />
        </span>
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
      officialOnly: true,
    }));
  const [saved, setSaved] = useState(() => readSaved("hhz-saved", [])),
    [trips, setTrips] = useState(() => readSaved("hhz-trips", []));
  const [route, setRoute] = useState(null),
    [routeError, setRouteError] = useState(""),
    [routing, setRouting] = useState(false),
    [graphRequested, setGraphRequested] = useState(true),
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
  const [showMapFacilities, setShowMapFacilities] = useState(false);
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const panelDrag = useRef(null), suppressPanelClick = useRef(false);
  function collapseForMap() {
    if (window.matchMedia('(max-width: 700px)').matches) setPanelCollapsed(true);
  }
  useEffect(() => { if (route || routeError) setPanelCollapsed(false); }, [route, routeError]);
  const needsData =
    showMapFacilities || (tab !== null && tab !== "saved") || modal === "sources";
  const waitingForData = needsData && !data && !loadError;
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
  function verifyOnlineRoute(route, start, end, id, construction) {
    return new Promise(resolve => {
      const timer=setTimeout(()=>{pendingVerifications.current.delete(id);resolve({error:'UNVERIFIED_NETWORK'});},30000);
      pendingVerifications.current.set(id,result=>{clearTimeout(timer);resolve(result);});
      if (!worker.current) { clearTimeout(timer); pendingVerifications.current.delete(id); resolve({error:'UNVERIFIED_NETWORK'}); return; }
      worker.current.postMessage({type:'verify-official',id,route,start,end,construction,options:prefs});
    });
  }
  const panelScroll = useRef();
  const panel = useRef();
  const menuButton = useRef();
  const routeFeedback = useRef();
  useEffect(() => {
    if (routeError)
      routeFeedback.current?.scrollIntoView({
        block: "nearest",
        behavior: "auto",
      });
  }, [routeError]);
  useEffect(() => {
    if (tab) {
      panelScroll.current.scrollTop = 0;
      panel.current.focus();
    }
  }, [tab]);
  const worker = useRef(),
    request = useRef(0),
    panelVersion = useRef(0),
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
    saveLocal("hhz-preferences", prefs);
    document.documentElement.classList.toggle("large-text", prefs.largeText);
    document.documentElement.classList.toggle("high-contrast", prefs.contrast);
    document.documentElement.classList.toggle("color-friendly", prefs.colorFriendly);
  }, [prefs]);
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
  function openPanel(nextTab) {
    setPanelCollapsed(false);
    if (nextTab !== tab) {
      panelVersion.current++;
      setShowMapFacilities(nextTab === "explore");
      setPick(null);
    }
    if (nextTab === "plan") setGraphRequested(true);
    setTab(nextTab);
  }
  function closePanel() {
    openPanel(null);
    setStatus("");
    window.speechSynthesis?.cancel();
    setSpeaking(false);
    menuButton.current?.focus();
  }
  const changePoint = (which, p) => {
    request.current++;
    setRouting(false);
    clearRoute();
    setRouteError("");
    which === "start" ? setStart(p) : setEnd(p);
    setSearchFor(null);
    setQuery("");
    setPick(null);
    openPanel("plan");
    setFocus({ ...p, token: Date.now() });
  };
  function clearRoute() {
    setConstructionConflict(null);
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
  function updatePrefs(patch) {
    request.current++;
    setRouting(false);
    clearRoute();
    setPrefs({ ...prefs, ...patch, avoidSteps: true, officialOnly: true });
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
    const version = panelVersion.current;
    setLocating(true);
    try {
      const p = await getLocation();
      if (which && version !== panelVersion.current) return;
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
      if (!which || version === panelVersion.current)
        announce("目前無法取得位置。你仍可以搜尋地點，或在地圖上選擇。");
    } finally {
      setLocating(false);
    }
  }
  async function calculate() {
    if (start && end && navigator.onLine) {
      setGraphRequested(true);
      clearRoute();
      setRouteError("");
      setRouting(true);
      setTab("plan");
      const id = request.current,
        controller = new AbortController();
      officialRequest.current = controller;
      const timer = setTimeout(() => controller.abort(), 25000);
      try {
        const [result, construction] = await Promise.all([requestOfficialRoute(
          [start.lat, start.lon],
          [end.lat, end.lon],
          prefs,
          controller.signal,
        ), fetchConstruction(controller.signal)]);
        if (!construction.error) lastConstruction.current=construction;
        if (id !== request.current) return;
        if (result.error) setRouteError(result.error);
        else if(construction.error) setRouteError(construction.error);
        else {
          const verified=await verifyOnlineRoute(result,[start.lat,start.lon],[end.lat,end.lon],id,construction);
          if(id!==request.current)return;
          setConstructionConflict(verified.construction || null);
          if(verified.error || verified.geometryVerification !== 'official-polygons-and-crossings-v1' || verified.policyVersion !== ROUTING_POLICY) setRouteError(verified.error || 'UNVERIFIED_NETWORK');
          else { setRoute(verified); setStepIndex(0); }
        }
      } catch (error) {
        if (id === request.current) setRouteError("OFFICIAL_UNAVAILABLE");
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
    worker.current.postMessage({
      type: "route",
      id: ++request.current,
      start: [start.lat, start.lon],
      end: [end.lat, end.lon],
      options: prefs,
      construction:lastConstruction.current,
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
  const routeWorks = route?.construction?.nearby?.slice(0,6) || [];
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
    const text = `從${start.name}前往${end.name}，路線長約${formatDistance(route.distance)}。${route.steps.map((s) => `${stepText(s)}約${Math.round(s.distance)}公尺。`).join("")}路況仍需留意現場，這是路線預覽。`;
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
  function saveTrip() {
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
    if (saveLocal("hhz-trips", next)) {
      setTrips(next);
      announce("行程已存好，稍後可以從「收藏」再打開。");
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
      <div className={`workspace${tab ? " with-panel" : ""}${panelCollapsed ? " panel-collapsed" : ""}`}>
        <aside
          className="panel"
          hidden={!tab}
          ref={panel}
          id="feature-panel"
          tabIndex={-1}
          aria-label={features.find(([id]) => id === tab)?.[1]}
        >
          <button className="panel-handle" aria-expanded={!panelCollapsed} aria-controls="panel-content"
            onPointerDown={e => { panelDrag.current=e.clientY; suppressPanelClick.current=false; e.currentTarget.setPointerCapture(e.pointerId); }}
            onPointerUp={e => { if(panelDrag.current!==null && Math.abs(e.clientY-panelDrag.current)>24){setPanelCollapsed(e.clientY>panelDrag.current);suppressPanelClick.current=true;} panelDrag.current=null; }}
            onPointerCancel={() => {panelDrag.current=null;}}
            onClick={() => {if(suppressPanelClick.current){suppressPanelClick.current=false;return;}setPanelCollapsed(v=>!v);}}>
            <span className="panel-grip" aria-hidden="true" />
            {panelCollapsed ? '展開內容' : '收起內容，看大地圖'}
            <ChevronDown size={16} aria-hidden="true" />
          </button>
          <div className="panel-toolbar">
            <button className="text-button" onClick={closePanel}>
              <X size={18} /> 回到地圖
            </button>
          </div>
          <div className="panel-scroll" id="panel-content" ref={panelScroll}>
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
                <div className="intro">
                  <h1>附近設施</h1>
                </div>
                <button
                  className="search-launch"
                  onClick={() => openSearch("explore")}
                >
                  <Search size={21} />
                  <span>搜尋地點、捷運站或路名</span>
                  <span className="search-kbd">找地點</span>
                </button>
                <label className="select-row">
                  設施類別
                  <select
                    value={filter}
                    onChange={(e) => {
                      setFilter(e.target.value);
                      setListLimit(12);
                    }}
                  >
                    {filters.map(([id, label]) => (
                      <option key={id} value={id}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="list-caption">
                  <span>依地圖中心，從近到遠</span>
                  <span>{nearby.length.toLocaleString()} 處</span>
                </div>
                {nearby.slice(0, listLimit).map((p) => (
                  <FacilityRow
                    key={p.id}
                    p={p}
                    from={viewport}
                    onSelect={inspect}
                    saved={saved.some((s) => s.id === p.id)}
                    onSave={toggleSave}
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
                <div className="intro compact">
                  <h1>路線規劃</h1>
                  <p>搜尋地點，或直接在地圖上選兩點。</p>
                </div>
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
                <button
                  className="text-button route-settings"
                  onClick={() => setModal("prefs")}
                >
                  <SlidersHorizontal size={18} /> 通行設定
                </button>
                {online && <p className="quiet-note">查詢時會將起終點位置傳給市府路線服務，不傳送身分資料。</p>}
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
                    {route.construction && <p className="quiet-note">施工資料更新：{new Date(route.construction.sourceUpdatedAt).toLocaleString('zh-TW', {timeZone:'Asia/Taipei'})}。{route.construction.unmapped > 0 ? `另有 ${route.construction.unmapped} 筆影響通行的通報缺少有效位置，請留意現場。` : '已比對全程及入口；通報外的施工仍可能尚未收錄。'}</p>}
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
                        {route.provider === "taipei-official"
                          ? "路線及入口銜接已通過人行空間與過街圖資檢查；圖資不代表現場認證，淨寬、坡度與即時施工仍需留意。"
                          : `約 ${route.unknownPct}% 路程缺少完整寬度或坡度資料，請留意現場。`}
                      </p>
                    </div>
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
                    <div className="route-tools">
                      <button
                        onClick={saveTrip}
                        disabled={route.requiresEntryConfirmation}
                      >
                        <Bookmark size={17} />
                        存下行程
                      </button>
                      <button
                        onClick={share}
                        disabled={route.requiresEntryConfirmation}
                      >
                        <Share2 size={17} />
                        分享
                      </button>
                      {"speechSynthesis" in window && (
                        <button
                          onClick={readRoute}
                          disabled={route.requiresEntryConfirmation}
                        >
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
                          以下為最新取得的施工通報；通報位置不一定是完整工區範圍。
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
            {tab === "stations" && (
              <>
                <div className="intro">
                  <h1>捷運電梯出口</h1>
                  <p>先找到車站，再看看出口與保養資訊。</p>
                </div>
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
                  <p>
                    電梯位置來自捷運公司。維修公告有更新時間，出發前也可以再向車站確認。
                  </p>
                </div>
                {stations.map((s, i) => {
                  const name = s["車站名稱"];
                  const exits = data.fac.filter(
                    (p) =>
                      p.kind === "metro-elevator" &&
                      stationKey(p.station) === stationKey(name),
                  );
                  return (
                    <button
                      className="station-card"
                      key={i}
                      onClick={() =>
                        setSelected({
                          id: `station-${i}`,
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
                <div className="intro">
                  <h1>我的收藏</h1>
                  <p>收藏留在這部裝置，不需要登入。</p>
                </div>
                <h2 className="section-title">已存行程</h2>
                {trips.length ? (
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
                            officialOnly: true,
                          });
                          openPanel("plan");
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
                  ))
                ) : (
                  <div className="empty-card">
                    <Bookmark size={25} />
                    <p>找到喜歡的走法後，點「存下行程」，下次就能輕鬆找到。</p>
                  </div>
                )}
                <h2 className="section-title">想再去的地方</h2>
                {saved.length ? (
                  saved.map((p) => (
                    <FacilityRow
                      key={p.id}
                      p={p}
                      from={viewport}
                      onSelect={inspect}
                      saved
                      onSave={toggleSave}
                    />
                  ))
                ) : (
                  <div className="empty-card">
                    <Heart size={25} />
                    <p>點設施旁的愛心，把需要的地方留在這裡。</p>
                  </div>
                )}
              </>
            )}
          </div>
        </aside>
        <main
          className="map-area"
          id="main-content"
          tabIndex={-1}
          aria-label="地圖與設施"
        >
          <MapView
            items={showMapFacilities ? mapItems : []}
            basemap={basemap}
            colorFriendly={prefs.colorFriendly}
            onBasemapStatus={setBasemapStatus}
            route={tab ? route : null}
            start={tab ? start : null}
            end={tab ? end : null}
            focus={{ ...viewport, ...focus }}
            pick={pick}
            onPick={selectPoint}
            onSelect={inspect}
            onViewport={setViewport}
            onMapReady={(m) => (map.current = m)}
            onUserInteract={collapseForMap}
          />
          <button
            className="map-menu-button"
            ref={menuButton}
            aria-haspopup="dialog"
            onClick={() => setModal("menu")}
          >
            <Menu size={21} aria-hidden="true" /> 選單
          </button>
          <div className="map-controls">
            <button aria-label="放大地圖" onClick={() => {collapseForMap(); map.current?.zoomIn();}}>
              <Plus />
            </button>
            <button
              aria-label="縮小地圖"
              onClick={() => {collapseForMap(); map.current?.zoomOut();}}
            >
              <Minus />
            </button>
            <span />
            <button
              aria-label="移至我的位置"
              onClick={() => locate()}
              disabled={locating}
            >
              {locating ? <LoaderCircle className="spin" /> : <LocateFixed />}
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
          {showMapFacilities && (
            <div className="map-bottom">
              <div className="map-legend">
                <span>
                  <i className="legend-elevator" /> 電梯
                </span>
                <span>
                  <i className="legend-toilet" /> 廁所
                </span>
                <span>
                  <i className="legend-rest" /> 休息
                </span>
              </div>
              <span className="map-footnote">設施開放情形請留意現場</span>
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
            <VoiceSearch onResult={setQuery} />
            <button onClick={() => speakText(searchResults.length ? `找到${searchResults.length}個地方。${searchResults.slice(0, 8).map((p, i) => `${i + 1}，${cleanName(p.name)}。`).join('')}請從清單選擇地點。` : '目前還沒找到地點，可以換個名稱再試一次。')}><Volume2 size={18} aria-hidden="true"/>{speaking ? "停止朗讀" : "朗讀搜尋結果"}</button>
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
                openPanel("plan");
                setPick(searchFor === "explore" ? "end" : searchFor);
                setSearchFor(null);
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
              <div className="detail-facts">
                <div>
                  <small>距地圖中心</small>
                  <b>{formatDistance(distance(viewport, selected))}</b>
                </div>
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
                  className="primary"
                  onClick={() => {
                    changePoint("end", selected);
                    setSelected(null);
                  }}
                >
                  我要到這裡
                  <ArrowRight size={18} />
                </button>
              </div>
              <button
                className="full secondary"
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
                {saved.some((x) => x.id === selected.id)
                  ? "已收藏・點選取消"
                  : "收藏這個地方"}
              </button>
              {selected.station && (
                <button
                  className="full text-button"
                  onClick={() => {
                    setStationQuery(selected.station);
                    openPanel("stations");
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
      {modal === "menu" && (
        <Sheet title="好好走 · 功能選單" onClose={() => setModal(null)}>
          <nav className="menu-actions" aria-label="主要功能">
            {features.map(([id, label, C]) => (
              <button
                key={id}
                aria-current={tab === id ? "page" : undefined}
                onClick={() => {
                  setModal(null);
                  openPanel(id);
                }}
              >
                <C size={20} aria-hidden="true" />
                {label}
                <ChevronRight size={16} aria-hidden="true" />
              </button>
            ))}
          </nav>
          <h3>地圖顯示</h3>
          <label className="select-row">
            底圖類型
            <select value={basemap} onChange={(e) => setBasemap(e.target.value)}>
              {Object.entries(BASEMAPS).map(([id, spec]) => (
                <option key={id} value={id}>
                  {spec.label}
                </option>
              ))}
            </select>
          </label>
          {basemap !== "street" && (
            <p className="quiet-note">航照為歷史拍攝影像，非即時路況。</p>
          )}
          <label className="toggle-row">
            <span>在地圖上顯示設施</span>
            <input
              type="checkbox"
              checked={showMapFacilities}
              onChange={(e) => setShowMapFacilities(e.target.checked)}
            />
          </label>
          {showMapFacilities && waitingForData && (
            <p className="quiet-note" role="status">
              正在載入設施…
            </p>
          )}
          {showMapFacilities && loadError && (
            <button className="text-button" onClick={boot}>
              設施載入失敗，再試一次
            </button>
          )}
          <div className="menu-actions">
            <button
              onClick={() => {
                map.current?.fitBounds([
                  [24.95, 121.45],
                  [25.22, 121.67],
                ]);
                setModal(null);
              }}
            >
              <MapPin size={20} aria-hidden="true" /> 查看全臺北地圖
            </button>
            <button onClick={() => setModal("prefs")}>
              <SlidersHorizontal size={20} aria-hidden="true" /> 通行與閱讀設定
            </button>
            <button onClick={() => setModal("about")}>
              <Info size={20} aria-hidden="true" /> 關於服務
            </button>
            <button onClick={() => setModal("sources")}>
              <Layers size={20} aria-hidden="true" /> 資料來源
            </button>
          </div>
        </Sheet>
      )}
      {modal === "prefs" && (
        <Sheet title="通行與閱讀設定" onClose={() => setModal(null)}>
          <p className="modal-lead">選擇這次出門需要的條件，隨時都可以調整。</p>
          {!online && <label className="select-row">
            路線偏好
            <select
              value={prefs.mode}
              onChange={(e) => updatePrefs({ mode: e.target.value })}
            >
              {Object.entries(routeModes).map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>}
          <label className="toggle-row">
            <span>
              <b>使用人行通道資料規劃</b>
              <small>
                線上採市府通道並排除障礙替代路線；離線固定排除車道與階梯。
              </small>
            </span>
            <input
              type="checkbox"
              checked
              readOnly
              disabled
              aria-label="車道與階梯固定排除"
            />
          </label>
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
            <small>{online ? "市府線上路線尚無淨寬資料；此設定僅用於離線資料中已記載寬度的路段。" : "只對有寬度資料的路段套用，未知路段會另外提醒。"}</small>
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
            <small>{online ? "市府線上路線尚無坡度資料；此設定僅用於離線資料中已記載坡度的路段。" : "依自己的通行需求選擇，這不是安全認證標準。"}</small>
          </label>
          <label className="toggle-row">
            <span>
              <b>只考慮寬度、坡度都有資料的路段</b>
              <small>資料還不完整，可能暫時找不到連續路線。</small>
            </span>
            <input
              type="checkbox"
              checked={prefs.knownOnly}
              onChange={(e) => updatePrefs({ knownOnly: e.target.checked })}
            />
          </label>
          <label className="toggle-row">
            <span>
              <b>全段須有官方人行空間圖資依據</b>
              <small>
                不自動補接資料缺漏，可能暫時找不到連續路線；仍需確認坡度與出入口。
              </small>
            </span>
            <input
              type="checkbox"
              checked
              readOnly
              disabled
              aria-label="官方人行空間依據固定啟用"
            />
          </label>
          <h3>閱讀設定</h3>
          <label className="toggle-row"><span><b>色覺友善地圖</b><small>降低底圖色彩干擾，設施加上文字標記，不只靠顏色辨認。</small></span><input type="checkbox" checked={!!prefs.colorFriendly} onChange={e => setPrefs({...prefs, colorFriendly:e.target.checked})}/></label>
          <label className="range-row"><span>朗讀速度<b>{prefs.voiceRate || 0.9} 倍</b></span><input aria-label="朗讀速度" type="range" min="0.6" max="1.2" step="0.1" value={prefs.voiceRate || 0.9} onChange={e => setPrefs({...prefs, voiceRate:Number(e.target.value)})}/></label>
          <button className="secondary" onClick={() => speakText('你好，可以用語音搜尋地點，也能聽取路線與搜尋結果。')}>{speaking ? '停止朗讀' : '試聽語音'}</button>
          <label className="toggle-row">
            <span>
              <b>放大文字</b>
              <small>保留完整內容，閱讀更輕鬆</small>
            </span>
            <input
              type="checkbox"
              checked={prefs.largeText}
              onChange={(e) =>
                setPrefs({ ...prefs, largeText: e.target.checked })
              }
            />
          </label>
          <label className="toggle-row">
            <span>
              <b>提高對比</b>
              <small>讓文字與按鈕更清楚</small>
            </span>
            <input
              type="checkbox"
              checked={prefs.contrast}
              onChange={(e) =>
                setPrefs({ ...prefs, contrast: e.target.checked })
              }
            />
          </label>
          <button className="primary full" onClick={() => setModal(null)}>
            套用設定
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
