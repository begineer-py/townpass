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
  Bus,
  DoorOpen,
  TrendingUp,
} from "lucide-react";
import MapView from "./MapView";
import { routeFitPadding } from "./route-fit.mjs";
import {mapRouteVisibility,routeViewLayers} from "./map-route-visibility.mjs";
import {useReferenceComparison} from "./use-reference-comparison.js";
import ReferenceRouteResult from "./ReferenceRouteResult";
import RouteChoice from "./RouteChoice.jsx";
import NavigationPanel, {NavigationPrompt} from "./NavigationPanel.jsx";
import {navigationProgress} from "./navigation-progress.mjs";
import {describeRouteChoices} from "./route-summary.mjs";
import {createReferenceSearch} from "./reference-search.mjs";
import {createConditionDetourSearch} from "./condition-detour-search.mjs";
import {createConstructionDetourSearch} from "./construction-detour-search.mjs";
import {presentRouteCandidates, sortRouteCandidates} from "./route-candidates-presentation.mjs";
import {ROUTE_CONDITIONS, conditionForSegment, fallbackRouteCondition} from "./route-conditions.mjs";
import {NO_WALK_URLS, UNKNOWN_NO_WALK_URL} from "./issue-icons.mjs";
import {TPColors} from "./tp-colors.mjs";
import VoiceSearch from "./VoiceSearch";
import {searchVerifiedAlternatives} from "./alternative-routes.mjs";
import {fetchConstruction} from "./construction-client.mjs";
import {useConstructionFeed} from "./use-construction-feed.js";
import {inspectSavedTrips, alertFingerprint, notifyTownPass} from "./trip-alerts.mjs";
import {createTripAlertLedger} from "./trip-alert-ledger.mjs";
import {canFallbackAfterVerification, startLocalFallback} from "./local-fallback.mjs";
import {constructionFresh, CONSTRUCTION_MAX_AGE} from "./construction.mjs";
import {groupConstructionNotices} from "./construction-display.mjs";
import {nearbyReplacement,nearbyWarnings,verifiedNearbyChoice,preservesGpsOrigin} from "./nearby-presentation.mjs";
import {isVerifiedNavigationRoute} from "./route-trust.mjs";
import {chooseSidewalkImprovement,compareSidewalkRouteScores} from "./sidewalk-route-choice.mjs";
import {createNearbySearch,shouldAutoSearchNearby} from "./nearby-search.mjs";
import {createMapSnapSearch} from "./map-snap-search.mjs";
import {createRouteWorkerLifecycle} from "./route-worker-lifecycle.mjs";
import {createLiveFollow,displayedRouteCoordinates} from "./live-follow.mjs";
import {createLiveFollowSearch} from "./live-follow-search.mjs";
import {routeGapPresentation} from "./route-gap-presentation.mjs";
import {partialRoutePresentation} from "./partial-route-presentation.mjs";
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
import { getLocation, locationError, watchLocation, destinationPoint, swappedOrigin } from "./location";
import { townPassUserKey, hasTownPass, postToTownPass } from "./townpass-bridge";
import { normalizeRoutingPreferences } from "./routing-preferences.mjs";
import { clearLocalData, loadProfile, loadTrips, saveProfile, saveTrips } from "./local-database";
import {
  PHONES,
  mapLink,
  nearestStop,
  activeElevatorStops,
} from "./trip-extras.mjs";
import { addressSearch, landmarkSearch } from "./address-search";
import { matchStationLandmark } from "./search-station.mjs";
import { nearbyEntranceChoices } from "./entrance-choices.mjs";
import { addRecentPlace } from "./recent-places.mjs";
import { matchMetroStations } from "./station-matches.mjs";
import { StationSearchGroup, stationLabel } from "./StationSearchGroup.jsx";
import { MetroStationIcon } from "./MetroStationIcon.jsx";
import { metroExitIconUrl, metroExitLabel } from "./metro-exits.mjs";
import { useFacilityTiles } from "./use-facility-tiles.js";
import { createDeferredActions } from "./deferred-actions.mjs";
import { maintenanceText, sourceCountLabel, stationKey, stepText, stepConditions } from "./format.mjs";
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
  ["water", "飲水台", GlassWater],
  ["rest", "椅子", Armchair],
];
const routeModes = { balanced: "均衡走法", crossings: "減少過街" };
const basePrefs = {
  avoidSteps: true,
  minWidth: 0.8,
  maxSlope: 1000000,
  knownOnly: false,
  officialOnly: false,
  preferOfficial: true,
  mode: "balanced",
  largeText: false,
  contrast: false,
  colorFriendly: false,
  voiceRate: 0.9,
};
const NO_MAP_ICONS = [];
function RouteLegend({ segments, colorFriendly, showIssueIcons=true }) {
  const keys = [...new Set(segments.flatMap(route => [
    ...(route.tierSegments?.length ? route.tierSegments.map(conditionForSegment) : [fallbackRouteCondition(route)]),
    ...(route.approaches?.length ? ['approach'] : []),
  ]))];
  const labelFor = key => key.startsWith('shared') ? '人車共行' : key === 'crossing' ? '過街' : key === 'approach' ? '起終點銜接' : '一般人行道';
  const groups = new Map();
  for (const key of keys) {
    const label = labelFor(key);
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(key);
  }
  return <div className="route-key" role="group" aria-label="路線線條說明">
    {[...groups].map(([label, styles]) => <span key={label}>{styles.map(key => {
      const condition = ROUTE_CONDITIONS[key];
      return <svg key={key} width="52" height="16" aria-hidden="true"><line x1="2" y1="8" x2="50" y2="8" stroke={colorFriendly ? TPColors.primary900 : condition.color} strokeWidth="6" strokeDasharray={condition.dash}/></svg>;
    })}{label}</span>)}
    {segments.some(route => route.officialConditions?.status==='available' && route.officialConditions.points?.length>0) && <span>{showIssueIcons && <i className="route-issue-legend" aria-hidden="true">!</i>}<svg width="52" height="16" aria-hidden="true"><line x1="2" y1="8" x2="50" y2="8" stroke="#7036a3" strokeWidth="4" strokeDasharray="3 4"/></svg>附近通行紀錄</span>}
    {!groups.has('過街') && segments.some(route => route.crossingUncertainties?.length > 0 || route.crossingSegments?.length > 0) && <span><svg width="52" height="16" aria-hidden="true"><line x1="2" y1="8" x2="50" y2="8" stroke={TPColors.primary900} strokeWidth="3" strokeDasharray="2 5"/></svg>過街</span>}
  </div>;
}

function Icon({ kind, ...props }) {
  const C = icons[kind] || MapPin;
  return <C size={20} aria-hidden="true" {...props} />;
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
function FacilityRow({ p, from, onSelect, saved, onSave, sourceLabel, note, stationCode }) {
  const k = category(p),
    sub = labels[k] || "設施";
  return (
    <div className="facility-row">
      <button className="facility-main" onClick={() => onSelect(p)}>
        <span className={`facility-icon ${k}`}>
          {p.kind === "metro-elevator" ? (
            metroExitIconUrl(p) ? <img className="metro-exit-icon" src={metroExitIconUrl(p)} alt="" aria-hidden="true" /> :
              metroExitLabel(p) === "梯" ? <Icon kind="elevator" /> : <span className="metro-exit-label" aria-hidden="true">{metroExitLabel(p)}</span>
          ) : k === "station" ? <MetroStationIcon codes={stationCode} value={p.name} /> : <Icon kind={k} />}
        </span>
        <span className="facility-copy">
          <strong>{cleanName(p.name)}</strong>
          {(sub !== cleanName(p.name) || p.exit || sourceLabel) && (
            <span>
              {sub}
              {p.exit ? ` · ${p.exit}` : ""}
              {sourceLabel ? ` · ${sourceLabel}` : ""}
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
  const [recentPlaces, setRecentPlaces] = useState(() => {
    const stored = readSaved("hhz-recent-places", []);
    return Array.isArray(stored) ? stored.slice(0, 10) : [];
  });
  const [landmarkIndex, setLandmarkIndex] = useState([]);
  const [landmarkError, setLandmarkError] = useState(false);
  const [landmarkRetry, setLandmarkRetry] = useState(0);
  const [metroExits, setMetroExits] = useState(null);
  const [metroExitError, setMetroExitError] = useState(false);
  const [metroExitRetry, setMetroExitRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setLandmarkError(false);
    loadData("landmarks").then((places) => {
      if (!Array.isArray(places)) throw Error("invalid landmarks");
      if (active) setLandmarkIndex(places);
    }).catch(() => { if (active) setLandmarkError(true); });
    return () => { active = false; };
  }, [landmarkRetry]);
  const rememberPlace = (place) => setRecentPlaces((previous) => {
    const next = addRecentPlace(previous, place);
    if (next !== previous) saveLocal("hhz-recent-places", next);
    return next;
  });
  const [data, setData] = useState(null),
    [loading, setLoading] = useState(false),
    [loadError, setLoadError] = useState(false),
    [dataRequested, setDataRequested] = useState(false);
  const dataGate = useRef(null);
  const graphReadyRef = useRef(false);
  const [tab, setTab] = useState("plan"),
    [filter, setFilter] = useState("all"),
    [viewport, setViewport] = useState({
      lat: 25.0478,
      lon: 121.517,
      bounds: [25.03, 121.49, 25.06, 121.54],
      zoom: 15,
    });
  useEffect(() => {
    if (viewport.zoom < 16 || metroExits) return;
    let active = true;
    setMetroExitError(false);
    loadData("metro-exits").then((places) => {
      if (!Array.isArray(places)) throw Error("invalid metro exits");
      if (active) setMetroExits(places);
    }).catch(() => { if (active) setMetroExitError(true); });
    return () => { active = false; };
  }, [viewport.zoom >= 16, metroExits, metroExitRetry]);
  const [focus, setFocus] = useState(null),
    [start, setStart] = useState(null),
    [end, setEnd] = useState(null),
    [pick, setPick] = useState(null),
    [searchFor, setSearchFor] = useState(null),
    [query, setQuery] = useState("");
  const [selected, setSelected] = useState(null),
    [modal, setModal] = useState(null),
    [profileStorageKey, setProfileStorageKey] = useState("hhz-profile-local"),
    [profileReady, setProfileReady] = useState(false),
    [prefs, setPrefs] = useState(() => normalizeRoutingPreferences({
      ...basePrefs,
      ...readSaved("hhz-preferences", {}),
      avoidSteps: true,
      officialOnly: false,
    }));
  const selectedRef = useRef(null);
  selectedRef.current = selected;
  const [unlocatedExits, setUnlocatedExits] = useState(null);
  const [unlocatedError, setUnlocatedError] = useState(false);
  useEffect(() => {
    if (selected?.kind !== "station-detail" || unlocatedExits) return;
    let active = true;
    setUnlocatedError(false);
    loadData("metro-unlocated-exits").then((items) => { if (active && Array.isArray(items)) setUnlocatedExits(items); })
      .catch(() => { if (active) setUnlocatedError(true); });
    return () => { active = false; };
  }, [selected?.id, selected?.kind, unlocatedExits]);
  const [saved, setSaved] = useState(() => readSaved("hhz-saved", [])),
    [trips, setTrips] = useState([]);
  const [tripAlerts, setTripAlerts] = useState({});
  const [tripCheckFailed, setTripCheckFailed] = useState(false);
  const tripAlertLedger = useRef(null);
  if (!tripAlertLedger.current) tripAlertLedger.current = createTripAlertLedger(readSaved, saveLocal);
  const [route, setRoute] = useState(null),
    [routeError, setRouteError] = useState(""),
    [routing, setRouting] = useState(false),
    [graphRequested, setGraphRequested] = useState(false),
    [graphReady, setGraphReady] = useState(false),
    [graphError, setGraphError] = useState(false),
    [status, setStatus] = useState(""),
    [srStatus, setSrStatus] = useState(""),
    [confirmClear, setConfirmClear] = useState(false),
    [locating, setLocating] = useState(false),
    [listLimit, setListLimit] = useState(12),
    [stationQuery, setStationQuery] = useState(""),
    [speaking, setSpeaking] = useState(false),
    [stepIndex, setStepIndex] = useState(0),
    [online, setOnline] = useState(navigator.onLine);
  const [routeCandidates, setRouteCandidates] = useState([]);
  const [selectedRouteCandidate, setSelectedRouteCandidate] = useState(null);
  const [candidateSort, setCandidateSort] = useState("score");
  const [currentLocation, setCurrentLocation] = useState(null);
  const [followState,setFollowState] = useState({active:false,status:'idle',message:''});
  const [tripStage,setTripStage]=useState('choices'),[navProgress,setNavProgress]=useState(null),[reportDemo,setReportDemo]=useState(false);
  const navAlong=useRef(0),followMap=useRef(true);
  const followSession = useRef(null);
  const [basemap, setBasemap] = useState(() => {
    const v = readSaved("hhz-basemap", "street");
    return Object.prototype.hasOwnProperty.call(BASEMAPS, v) ? v : "street";
  });
  const [basemapStatus, setBasemapStatus] = useState("loading");
  const [showOfficialSidewalk, setShowOfficialSidewalk] = useState(() => readSaved("hhz-show-sidewalk", true));
  const [hideMapIcons, setHideMapIcons] = useState(() => readSaved("hhz-hide-map-icons", false));
  const [sidewalkStatus, setSidewalkStatus] = useState("idle");
  useEffect(() => { saveLocal("hhz-show-sidewalk", showOfficialSidewalk); }, [showOfficialSidewalk]);
  useEffect(() => { saveLocal("hhz-hide-map-icons", hideMapIcons); }, [hideMapIcons]);
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
  const [showConstruction, setShowConstruction] = useState(() => readSaved("hhz-show-construction", true));
  const constructionFeed=useConstructionFeed(showConstruction);
  const [constructionMapStatus,setConstructionMapStatus]=useState({status:'hidden',truncated:false});
  useEffect(()=>{saveLocal("hhz-show-construction",showConstruction);},[showConstruction]);
  const [showMapFacilities, setShowMapFacilities] = useState(() => readSaved("hhz-show-map-facilities", true));
  const { places: nearbyMapFacilities, status: facilityStatus, retry: retryFacilityTiles } = useFacilityTiles(viewport, showMapFacilities);
  useEffect(() => { saveLocal("hhz-show-map-facilities", showMapFacilities); }, [showMapFacilities]);
  const needsData =
    dataRequested || tab === "explore" || tab === "stations" ||
    modal === "sources" ||
    Boolean(searchFor);
  const waitingForData = needsData && !data && !loadError;
  // Tab change: facilities show on the map only while browsing them, the route
  // graph loads the first time 規劃路線 opens, and stale locate() replies drop.
  const tabVersion = useRef(0);
  useEffect(() => {
    tabVersion.current++;
    if (tab !== "plan") {conditionDetourSearch.current?.cancel();constructionDetourSearch.current?.cancel();}
  }, [tab]);
  useEffect(() => {
    saveLocal("hhz-basemap", basemap);
  }, [basemap]);
  const [addressResults, setAddressResults] = useState([]);
  const [addressQuery, setAddressQuery] = useState(null);
  const [addressPending, setAddressPending] = useState(false);
  const [addressError, setAddressError] = useState(false);
  useEffect(() => {
    const ctl = new AbortController();
    setAddressResults([]);
    setAddressError(false);
    setAddressQuery(query);
    setAddressPending(Boolean(searchFor && query.trim()));
    const t = setTimeout(() => {
      if (!searchFor || !query.trim()) return;
      Promise.allSettled([addressSearch(query, ctl.signal), landmarkSearch(query, ctl.signal)]).then(results => {
        if (ctl.signal.aborted) return;
        setAddressResults(results.flatMap(result => result.status === 'fulfilled' ? result.value : []));
        setAddressError(results.some(result => result.status === 'rejected'));
        setAddressPending(false);
      });
    }, 350);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [query, searchFor]);
  const officialRequest = useRef();
  const locationRequest=useRef(0);
  const pendingVerifications = useRef(new Map());
  const lastConstruction = useRef(null);
  const mapSnap=useRef(null), pendingMapSnap=useRef(null), mapSnapVersion=useRef(0);
  if(!mapSnap.current)mapSnap.current=createMapSnapSearch({fetchSnapshot:fetchConstruction,getLifecycle:()=>worker.current,onSnapshot:s=>{lastConstruction.current=s;}});
  useEffect(()=>()=>mapSnap.current?.cancel(false),[]);
  const [nearbyState,setNearbyState]=useState({status:'idle',candidates:[]});
  const nearbySearch=useRef(null);
  if(!nearbySearch.current)nearbySearch.current=createNearbySearch({fetchSnapshot:fetchConstruction,createWorker:()=>new Worker(new URL('./route-worker.js',import.meta.url),{type:'module'}),onState:setNearbyState,onSnapshot:s=>{lastConstruction.current=s;}});
  const [referenceState,setReferenceState]=useState({status:'idle'});
  const [referenceCollapsed,setReferenceCollapsed]=useState(false);
  const referenceSnapshot=useRef(null),referenceAutoAttempt=useRef(null),referenceSearch=useRef(null),referenceBaseline=useRef(null),manualRouteSelection=useRef(false);
  if(!referenceSearch.current)referenceSearch.current=createReferenceSearch({fetchSnapshot:fetchConstruction,getLifecycle:()=>worker.current,onState:setReferenceState,onSnapshot:s=>{referenceSnapshot.current=s;}});
  useEffect(()=>()=>referenceSearch.current?.cancel(false),[]);
  const [conditionDetourState,setConditionDetourState]=useState({status:'idle'});
  const conditionDetourSearch=useRef(null);
  if(!conditionDetourSearch.current)conditionDetourSearch.current=createConditionDetourSearch({fetchSnapshot:fetchConstruction,createWorker:()=>new Worker(new URL('./route-worker.js',import.meta.url),{type:'module'}),onState:setConditionDetourState,onSnapshot:s=>{lastConstruction.current=s;}});
  const [constructionDetourState,setConstructionDetourState]=useState({status:'idle'}),constructionDetourSearch=useRef(null);
  if(!constructionDetourSearch.current)constructionDetourSearch.current=createConstructionDetourSearch({fetchSnapshot:fetchConstruction,createWorker:()=>new Worker(new URL('./route-worker.js',import.meta.url),{type:'module'}),onState:setConstructionDetourState,onSnapshot:s=>{lastConstruction.current=s;}});
  useEffect(()=>()=>constructionDetourSearch.current?.cancel(false),[]);
  const [constructionConflict,setConstructionConflict] = useState(null);
  const [routeGap,setRouteGap] = useState(null);
  const [partialRoute,setPartialRoute] = useState(null);
  const requestEndpoints=useRef(null);
  const routeGapView=useMemo(()=>partialRoute?null:routeGapPresentation(routeError,routeGap),[routeError,routeGap,partialRoute]);
  function verifyOnlineRoute(route, start, end, id, construction, options=prefs) {
    return new Promise(resolve => {
      let settled=false;
      const finish=result=>{if(settled)return;settled=true;clearTimeout(timer);if(pendingVerifications.current.get(id)===finish)pendingVerifications.current.delete(id);resolve(result);};
      const timer=setTimeout(()=>{if(pendingVerifications.current.get(id)!==finish)return;pendingVerifications.current.delete(id);worker.current?.cancelIfActive('verify-official',id);finish({error:'UNVERIFIED_NETWORK'});},30000);
      pendingVerifications.current.set(id,finish);
      if (!worker.current || worker.current.postMessage({type:'verify-official',id,route,start,end,construction,options})===false)finish({error:'UNVERIFIED_NETWORK'});
    });
  }
  const panelScroll = useRef();
  const restoreChoicePosition=useRef(false);
  const panel = useRef();
  const menuButton = useRef();
  const autoLocated = useRef(false);
  const routeFeedback = useRef();
  // Phone bottom sheet: 0 = peek, 1 = half, 2 = full (heights in style.css).
  const panelEl = useRef(),
    gripDragged = useRef(false);
  const [sheetSnap, setSheetSnap] = useState(1);
  const [bearing, setBearing] = useState(0);
  const SHEET_SNAPS = [0.11, 0.56, 0.9];
  useLayoutEffect(()=>{
    if(tab==='plan' && tripStage==='choices' && end && sheetSnap===0 && panelScroll.current)panelScroll.current.scrollTop=0;
  },[tab,tripStage,end,sheetSnap]);
  useEffect(()=>{if(route || routeError)setSheetSnap(v=>Math.max(v,1));},[route,routeError]);
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
  function resetNorth() {
    setBearing(0);
    map.current?.setBearing?.(0);
    announce("地圖已朝北。", { quiet: true });
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
      if(stored!=='wheelchair')void saveProfile(key,'wheelchair');
      setTrips(storedTrips);
      setPrefs(normalizeRoutingPreferences({
        ...basePrefs,
        ...(savedPrefs || {}),
        avoidSteps: true,
        officialOnly: false,
      }));
      setProfileReady(true);
    });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!profileReady || !trips.length) { setTripAlerts({}); return; }
    let active = true, running = false;
    const controller = new AbortController();
    const storageKey = `${profileStorageKey}-trip-alerts`;
    async function check() {
      if (running || document.visibilityState === 'hidden') return;
      running = true;
      try {
        const snapshot = await fetchConstruction(controller.signal);
        if (!active || document.visibilityState === 'hidden') return;
        if (snapshot.error) { setTripCheckFailed(true); return; }
        const alerts = inspectSavedTrips(trips, snapshot);
        const previous = tripAlertLedger.current.get(storageKey), next = {};
        for (const trip of trips) {
          const works = alerts[trip.id];
          if (!works?.length) continue;
          const fingerprint = alertFingerprint(works);
          if (previous[trip.id] !== fingerprint) {
            if (notifyTownPass('收藏路線受施工影響', `${trip.start.name} → ${trip.end.name}：${works[0].address}附近可能影響通行，請開啟收藏查看改道。`)) next[trip.id] = fingerprint;
          } else next[trip.id] = fingerprint;
        }
        tripAlertLedger.current.save(storageKey, next);
        setTripAlerts(alerts);
        setTripCheckFailed(false);
      } catch { if (active) setTripCheckFailed(true); }
      finally { running = false; }
    }
    void check();
    const timer = setInterval(check, 60000);
    document.addEventListener('visibilitychange', check);
    window.addEventListener('online', check);
    return () => { active = false; controller.abort(); clearInterval(timer); document.removeEventListener('visibilitychange', check); window.removeEventListener('online', check); };
  }, [profileReady, profileStorageKey, trips]);
  const wantedStop = useRef(null);
  const pendingRoute = useRef(null);
  const worker = useRef(),
    request = useRef(0),
    map = useRef(),
    announceTimer = useRef(),
    srAnnounceTimer = useRef();
  const sidewalkComparison = useMemo(()=>{
    const baseline=referenceBaseline.current;
    if(referenceState.status!=='ready'||!baseline||baseline.requestId!==request.current)return null;
    return compareSidewalkRouteScores({currentRoute:baseline.route,localCandidates:routeCandidates,referenceCandidates:referenceState.candidates,start,end,snapshot:lastConstruction.current,referenceSnapshot:referenceSnapshot.current,referenceSourceHash:referenceState.sourceHash});
  },[referenceState,routeCandidates,start,end,route,lastConstruction.current?.fetchedAt,lastConstruction.current?.sourceUpdatedAt,referenceSnapshot.current?.fetchedAt,referenceSnapshot.current?.sourceUpdatedAt]);
  const displayedReferenceCandidates = useMemo(()=>{
    const candidates=referenceState.candidates||[];
    if(!sidewalkComparison)return candidates;
    return candidates.map(candidate=>({...candidate,score:sidewalkComparison.referenceCandidates?.find(item=>item.candidate.id===candidate.id)?.score.value??null})).sort((a,b)=>(b.score??-Infinity)-(a.score??-Infinity));
  },[referenceState,sidewalkComparison]);
  const sortedRouteCandidates = useMemo(()=>{
    let candidates=routeCandidates;
    const baseline=referenceBaseline.current;
    const sameRoute=(a,b)=>Array.isArray(a?.coordinates)&&Array.isArray(b?.coordinates)&&a.coordinates.length===b.coordinates.length&&a.coordinates.every((p,i)=>p[0]===b.coordinates[i]?.[0]&&p[1]===b.coordinates[i]?.[1]);
    const originalMissing=baseline && !candidates.some(candidate=>candidate.id===baseline.selectedId || sameRoute(candidate.route,baseline.route));
    if(referenceState.status==='ready' && originalMissing && isVerifiedNavigationRoute(baseline.route) && constructionFresh(lastConstruction.current) && baseline.route.construction?.sourceUpdatedAt===lastConstruction.current?.sourceUpdatedAt){
      const m=sidewalkComparison?.status==='ready'?sidewalkComparison.current.metrics:null;
      candidates=[...candidates,{id:'original-route',route:baseline.route,score:sidewalkComparison?.current?.score.value??null,metrics:{distanceMetres:m?.distance??baseline.route.distance,explicitSidewalkMetres:m?.sidewalk??null,otherPedestrianMetres:null,sharedMetres:m?.shared??null,unknownMetres:null,estimatedMetres:m?.estimated??null,roughMetres:null,detourMetres:m?Math.max(0,m.distance-sidewalkComparison.shortestDistanceMetres):null,officialConditionCount:null}}];
    }
    if(sidewalkComparison){
      candidates=candidates.map(candidate=>({...candidate,score:sidewalkComparison.localCandidates?.find(item=>item.candidate.id===candidate.id)?.score.value ?? (candidate.id==='original-route'&&sidewalkComparison.status==='ready'?sidewalkComparison.current.score.value:null)}));
    }
    return sortRouteCandidates(candidates,candidateSort);
  },[routeCandidates,candidateSort,sidewalkComparison,referenceState,route]);
  const unifiedRouteChoices = useMemo(()=>{
    if(!sidewalkComparison)return null;
    const items=[...sortedRouteCandidates.map(candidate=>({source:'local',candidate,distance:candidate.metrics.distanceMetres,score:candidate.score})),...displayedReferenceCandidates.map(candidate=>({source:'reference',candidate,distance:candidate.route.distanceMetres,score:candidate.score}))];
    return items.sort((a,b)=>{const distance=a.distance-b.distance,score=(Number.isFinite(b.score)?b.score:-1)-(Number.isFinite(a.score)?a.score:-1);return candidateSort==='distance'?distance||score:score||distance;});
  },[sidewalkComparison,sortedRouteCandidates,displayedReferenceCandidates,candidateSort]);
  const unifiedRouteSummaries = useMemo(()=>{
    if(!unifiedRouteChoices)return [];
    const comparable=unifiedRouteChoices.filter(item=>Number.isFinite(item.score));
    const descriptions=describeRouteChoices(comparable);
    return unifiedRouteChoices.map(item=>{const index=comparable.indexOf(item);return index>=0?descriptions[index]:describeRouteChoices([item])[0];});
  },[unifiedRouteChoices]);
  const localRouteSummaries = useMemo(()=>describeRouteChoices(sortedRouteCandidates.map(candidate=>({candidate,source:'local'}))),[sortedRouteCandidates]);
  const selectedRouteScore = unifiedRouteChoices?.find(item=>route===item.candidate.route || (item.source==='local'&&selectedRouteCandidate===item.candidate.id))?.score ?? sortedRouteCandidates.find(candidate=>selectedRouteCandidate===candidate.id)?.score ?? displayedReferenceCandidates.find(candidate=>selectedRouteCandidate===candidate.id)?.score;
  const announce = (text, { quiet = false } = {}) => {
    setSrStatus("");
    clearTimeout(srAnnounceTimer.current);
    srAnnounceTimer.current=setTimeout(() => setSrStatus(text), 50);
    if (quiet && !(prefs.visualPrompts ?? false)) return;
    setStatus(text);
    clearTimeout(announceTimer.current);
    announceTimer.current = setTimeout(() => setStatus(""), 7000);
  };
  function clearPickPrompt(){clearTimeout(announceTimer.current);clearTimeout(srAnnounceTimer.current);setStatus('');setSrStatus('');}
  if (!dataGate.current) dataGate.current = createDeferredActions(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const [fac, places, metro, sources] = await Promise.all(
        ["facilities", "places", "metro", "sources"].map(loadData),
      );
      const loaded = { fac, places, metro, sources, all: [...fac, ...places] };
      setData(loaded);
      return loaded;
    } catch (error) {
      console.error("Data load failed", error);
      setLoadError(true);
      throw error;
    } finally {
      setLoading(false);
    }
  });
  const boot = useCallback(async () => {
    try { return await dataGate.current.ensure(); } catch { return null; }
  }, []);
  async function retryData() {
    const result = await dataGate.current.retry();
    if (result.status === "cancelled") await boot();
    else if (result.status === "failed") announce("設施資料暫時無法載入，請再試一次。");
  }
  async function afterData(execute) {
    setDataRequested(true);
    const result = await dataGate.current.run({ execute });
    if (result.status === "failed") announce("設施資料暫時無法載入，請按再試一次。");
  }
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
      clearTimeout(announceTimer.current);clearTimeout(srAnnounceTimer.current);
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
    let wasReady=false;
    const lifecycle=createRouteWorkerLifecycle({
      createWorker:()=>new Worker(new URL("./route-worker.js",import.meta.url),{type:'module'}),
      initMessage:{type:'init',url:new URL(dataUrl('graph')+'?policy='+ROUTING_POLICY,location.href).href},
      onReady:ready=>{graphReadyRef.current=ready;setGraphReady(ready);if(ready){wasReady=true;setGraphError(false);}else if(wasReady)announce('正在重新準備路線資料。');},
      onDropped:message=>{if(mapSnap.current.handleDropped(message)||referenceSearch.current.handleDropped(message))return;if(message.type==='verify-official')pendingVerifications.current.get(message.id)?.({error:'CANCELLED'});},
      onMessage:d=>{
      if(mapSnap.current.handleMessage(d))return;
      if(referenceSearch.current.handleMessage(d))return;
      if (d.type === 'verified-official') {
        pendingVerifications.current.get(d.id)?.(d.result);
        pendingVerifications.current.delete(d.id);
        return;
      }
      if (d.type === "route" && d.id === request.current) {
        setRouting(false);
        if (d.result.error || d.result.policyVersion !== ROUTING_POLICY) {
          const partial=partialRoutePresentation(d.result.error,d.result.partialRoute,lastConstruction.current,ROUTING_POLICY,Date.now(),requestEndpoints.current);
          clearRoute();
          setConstructionConflict(d.result.construction || null);
          setRouteGap(d.result.error==='NO_ROUTE'?d.result.routeGap||{status:'unavailable'}:null);
          setPartialRoute(partial);
          setRouteError(d.result.error || "UNVERIFIED_NETWORK");
        } else {
          window.speechSynthesis?.cancel();
          setSpeaking(false);
          if(d.result.resolvedStart)setStart(d.result.resolvedStart);
          if(d.result.resolvedEnd)setEnd(d.result.resolvedEnd);
          const candidates=presentRouteCandidates(d.result.routeCandidates,ROUTING_POLICY,lastConstruction.current?.sourceUpdatedAt);
          setRouteCandidates(candidates);
          setSelectedRouteCandidate(candidates.find(c=>c.id===d.result.selectedCandidateId)?.id ?? null);
          setRoute(d.result);
          setRouteError("");
          setStepIndex(0);
        }
      }
      },
      onError:(d,failedMessage)=>{
        graphReadyRef.current=false;
        if(failedMessage?.type==='reference-route'||failedMessage?.type==='snap-map-point'){lifecycle.start();return;}
        if(pendingMapSnap.current){cancelMapSnap();announce('路網資料暫時無法載入，請稍後再試。');}
        for(const resolve of pendingVerifications.current.values()) resolve({error:'UNVERIFIED_NETWORK'});
        pendingVerifications.current.clear();
        if (d?.id != null && d.id !== request.current) return;
        clearRoute();
        setRouting(false);
        setGraphError(true);
        setRouteError('UNVERIFIED_NETWORK');
      },
    });
    worker.current=lifecycle;lifecycle.start();
    return () => { lifecycle.dispose();if(worker.current===lifecycle)worker.current=null;nearbySearch.current?.cancel(false);conditionDetourSearch.current?.cancel(false);for(const resolve of pendingVerifications.current.values()) resolve({error:'UNVERIFIED_NETWORK'});pendingVerifications.current.clear(); };
  }, [graphRequested]);
  const changePoint = (which, p) => {
    cancelMapSnap();
    rememberPlace(p);
    stopFollowing();
    if(which==='end')p=destinationPoint(p);
    cancelLocation();
    request.current++;
    setRouting(false);
    clearRoute();
    setRouteError("");
    which === "start" ? setStart(p) : setEnd(p);
    setSearchFor(null);
    setQuery("");
    if(pick)clearPickPrompt();
    setPick(null);
    setTab("plan");
    setFocus({ ...p, token: Date.now() });
  };
  function clearDestination(){
    cancelMapSnap();cancelLocation();stopFollowing();setEnd(null);setPick(null);setRouteError('');clearRoute();
  }
  function clearRoute() {
    setTripStage('choices');setNavProgress(null);navAlong.current=0;setReportDemo(false);
    referenceBaseline.current=null;manualRouteSelection.current=false;setReferenceCollapsed(false);
    stopFollowing();
    dataGate.current.cancel();
    conditionDetourSearch.current.cancel();
    constructionDetourSearch.current.cancel();
    cancelNearby();
    referenceSearch.current.cancel();referenceSnapshot.current=null;
    pendingRoute.current=null;
    worker.current?.cancel();
    setConstructionConflict(null);
    setRouteGap(null);
    setPartialRoute(null);
    for(const resolve of pendingVerifications.current.values()) resolve({error:'UNVERIFIED_NETWORK'});
    pendingVerifications.current.clear();
    officialRequest.current?.abort();
    request.current++;
    window.speechSynthesis?.cancel();
    setSpeaking(false);
    setRouting(false);
    setRoute(null);
    setRouteCandidates([]);
    setSelectedRouteCandidate(null);
  }
  function isCurrentOfficialRoute(candidate) {
    return !!candidate && referenceState.status==='ready' && referenceState.startPlace===start && referenceState.endPlace===end && constructionFresh(referenceSnapshot.current) && candidate.kind==='official-passageway' && candidate.verification==='official-source-screened-v1' && candidate.navigationAllowed===true && candidate.constructionSourceUpdatedAt===referenceSnapshot.current?.sourceUpdatedAt && (!constructionFresh(lastConstruction.current) || Date.parse(lastConstruction.current.sourceUpdatedAt)<=Date.parse(referenceSnapshot.current.sourceUpdatedAt)) && referenceState.candidates?.some(item=>item.route===candidate);
  }
  function selectOfficialCandidate(candidate,automatic=false) {
    if(!isCurrentOfficialRoute(candidate?.route)) { announce('路線資料已過期，請重新規劃。'); return false; }
    if(!automatic)manualRouteSelection.current=true;
    stopFollowing(); conditionDetourSearch.current.cancel();constructionDetourSearch.current.cancel();
    lastConstruction.current=referenceSnapshot.current;
    setRoute(candidate.route);
    setRouteCandidates(existing=>existing.filter(item=>item.route?.construction?.sourceUpdatedAt===referenceSnapshot.current?.sourceUpdatedAt));
    setSelectedRouteCandidate(candidate.id);
    setConstructionConflict(null); setRouteGap(null); setPartialRoute(null); setRouteError(''); setStepIndex(0);
    return true;
  }
  function selectRouteCandidate(candidate) {
    manualRouteSelection.current=true;
    if (!isVerifiedNavigationRoute(candidate?.route) || !constructionFresh(lastConstruction.current) || candidate.route.construction?.sourceUpdatedAt !== lastConstruction.current?.sourceUpdatedAt) {
      announce('路線資料已更新，請重新規劃。'); return false;
    }
    conditionDetourSearch.current.cancel();constructionDetourSearch.current.cancel();stopFollowing();
    window.speechSynthesis?.cancel(); setSpeaking(false);
    setRoute(candidate.route); setSelectedRouteCandidate(candidate.id); setStepIndex(0);
    return true;
  }
  function previewRoute(candidate,source){
    const ok=source==='reference'?selectOfficialCandidate(candidate):selectRouteCandidate(candidate);
    if(ok){setTripStage('preview');setSheetSnap(1);}
  }
  function previewSelectedRoute(){
    if(!route||!constructionFresh(lastConstruction.current)||route.construction?.sourceUpdatedAt!==lastConstruction.current?.sourceUpdatedAt||!(isVerifiedNavigationRoute(route)||isCurrentOfficialRoute(route))){announce('路線資料已更新，請重新規劃。');return;}
    manualRouteSelection.current=true;setTripStage('preview');setSheetSnap(1);
  }
  function returnToRoutes(){stopFollowing();restoreChoicePosition.current=true;setTripStage('choices');setNavProgress(null);setReportDemo(false);setSheetSnap(1);}
  function endNavigation(){stopFollowing();setTripStage('preview');setNavProgress(null);setReportDemo(false);setSheetSnap(1);}
  function recenterNavigation(){followMap.current=true;const p=followSession.current?.latest;if(p)setFocus({...p,zoom:17,token:Date.now()});else announce('正在等待定位。');}
  function cancelNearby(){
    nearbySearch.current.cancel();
  }
  function avoidOfficialCondition(point){
    if(!route||!start||!end||!graphReady)return;
    stopFollowing();cancelNearby();
    const a=route.resolvedStart||start,b=route.resolvedEnd||end;
    const old=route.conditionDetour?.targets||[],targets=[...old.filter(p=>p.id!==point.id||p.type!==point.type),{id:point.id,type:point.type,lat:point.lat,lon:point.lon}];
    void conditionDetourSearch.current.start({startPlace:a,endPlace:b,options:{...prefs,avoidPoints},url:new URL(dataUrl('graph')+'?policy='+ROUTING_POLICY,location.href).href,targets,online:navigator.onLine,offlineSnapshot:lastConstruction.current});
  }
  function avoidConstruction(ids){
    if(!route||!start||!end||!graphReady||!Array.isArray(ids)||!ids.length)return;
    stopFollowing();if(tripStage==='navigation')setTripStage('preview');cancelNearby();conditionDetourSearch.current.cancel();manualRouteSelection.current=true;
    const a=route.resolvedStart||start,b=route.resolvedEnd||end,targets=[...new Set([...(route.constructionDetour?.ids||[]),...ids])];
    void constructionDetourSearch.current.start({startPlace:a,endPlace:b,options:{...prefs,avoidPoints},url:new URL(dataUrl('graph')+'?policy='+ROUTING_POLICY,location.href).href,ids:targets,originalRoute:route,online:navigator.onLine,offlineSnapshot:lastConstruction.current});
  }
  useEffect(()=>{
    if(constructionDetourState.status!=='ready'||constructionDetourState.originalRoute!==route)return;
    const next=constructionDetourState.route;
    if(!isVerifiedNavigationRoute(next)||!constructionFresh(lastConstruction.current)||next.construction?.sourceUpdatedAt!==lastConstruction.current?.sourceUpdatedAt){setConstructionDetourState({status:'error',message:'無法確認繞路結果，原路線仍可查看。'});return;}
    referenceSearch.current.cancel();referenceSnapshot.current=null;referenceBaseline.current=null;
    setRoute(next);setRouteCandidates([]);setSelectedRouteCandidate(null);setStepIndex(0);setConstructionDetourState({status:'idle'});
  },[constructionDetourState,route]);
  useEffect(()=>{
    if(conditionDetourState.status!=='ready')return;
    const next=conditionDetourState.route;
    if(next?.policyVersion!==ROUTING_POLICY||next.geometryVerification!=='pedestrian-network-v1'||!constructionFresh(lastConstruction.current)||next.construction?.sourceUpdatedAt!==lastConstruction.current?.sourceUpdatedAt){
      setConditionDetourState({status:'error',message:'無法確認繞路結果，原路線仍可查看。'});return;
    }
    setRoute(next);setRouteCandidates([]);setSelectedRouteCandidate(null);setStepIndex(0);
  },[conditionDetourState]);
  function findNearbyPositions(){
    if(!start||!end||!graphReady)return;
    void nearbySearch.current.start({startPlace:start,endPlace:end,options:{...prefs,avoidPoints},url:new URL(dataUrl('graph')+'?policy='+ROUTING_POLICY,location.href).href,online:navigator.onLine,offlineSnapshot:lastConstruction.current});
  }
  function findReferenceRoute(baseline=null,automatic=false){
    if(!start||!end)return;
    referenceBaseline.current=baseline?{route:baseline,requestId:request.current,automatic,selectedId:selectedRouteCandidate}:null;
    setReferenceCollapsed(false);
    referenceAutoAttempt.current=request.current;
    referenceSnapshot.current=null;
    void referenceSearch.current.start({startPlace:start,endPlace:end,options:{...prefs,avoidPoints},url:new URL(dataUrl('graph')+'?policy='+ROUTING_POLICY,location.href).href,online:navigator.onLine,offlineSnapshot:lastConstruction.current});
  }
  function chooseNearby(candidate){
    stopFollowing();
    if(!constructionFresh(lastConstruction.current)){cancelNearby();announce('施工資料已過期，請重新搜尋附近位置。');return;}
    const original=candidate.side==='start'?start:end,point=nearbyReplacement(candidate,original);
    const points=candidate.side==='start'?{start:point,end}:{start,end:point};
    if(candidate.side==='start')setStart(point);else setEnd(point);
    setFocus({...point,token:Date.now()});setRouteError('');cancelNearby();calculate(points);
  }
  function cancelMapSnap(){mapSnapVersion.current++;pendingMapSnap.current=null;mapSnap.current?.cancel(false);}
  async function runMapSnap(task){
    if(!task || task.started || !graphReadyRef.current)return;
    task.started=true;
    const result=await mapSnap.current.start({place:task.place,side:task.side,options:{...prefs,avoidPoints},online:navigator.onLine,offlineSnapshot:lastConstruction.current});
    if(task.version!==mapSnapVersion.current)return;
    pendingMapSnap.current=null;
    if(result.error){if(result.error!=='CANCELLED')announce(result.error==='CONSTRUCTION_UNAVAILABLE'?'無法確認施工資料，請稍後再試。':'附近找不到可確認的人行路網，請點選其他位置。');return;}
    const distance=Math.round(result.distanceMetres);
    const point={...task.place,lat:result.point[0],lon:result.point[1],name:distance?'附近人行路網位置':task.place.name,mapSnap:result};
    if(distance)point.nearbyOriginal={name:task.place.name,coordinates:result.original,straightMetres:distance};
    changePoint(task.side,point);
    if(distance)announce(`已選附近人行路網，距原選點約 ${distance} 公尺，銜接尚未確認。`);
  }
  function selectPoint(p) {
    if(!pick)return;
    if(p.originKind!=='map'||!/^point-\d+$/.test(String(p.id||''))){changePoint(pick,p);return;}
    cancelMapSnap();
    const task={place:p,side:pick,version:mapSnapVersion.current};
    pendingMapSnap.current=task;
    setGraphRequested(true);
    announce('正在尋找附近人行路網。');
    if(graphReadyRef.current)void runMapSnap(task);
  }
  function updateDisplay(patch) { setPrefs((current) => ({ ...current, ...patch })); }
  function updatePrefs(patch) {
    stopFollowing();
    request.current++;
    setRouting(false);
    clearRoute();
    setPrefs(normalizeRoutingPreferences({ ...prefs, ...patch, avoidSteps: true, officialOnly: false }));
  }
  function stopFollowing() {
    const session=followSession.current;
    if(!session)return;
    followSession.current=null;
    session.engine.stop();
    session.search.cancel();
    session.stopWatch?.();
    setFollowState({active:false,status:'idle',message:''});
  }
  function startFollowing() {
    if(!(isVerifiedNavigationRoute(route)||isCurrentOfficialRoute(route))||!end||route.requiresEntryConfirmation||route.viaName){
      announce(route?.viaName?'順路停靠的路線暫不支援導航。':'路線已更新，請重新規劃。');
      return false;
    }
    manualRouteSelection.current=true;
    if(referenceState.status==='loading'&&referenceBaseline.current?.automatic){referenceSearch.current.cancel();referenceSnapshot.current=null;referenceBaseline.current=null;}
    stopFollowing();
    navAlong.current=0;setNavProgress(null);setReportDemo(false);followMap.current=true;setTripStage('navigation');setSheetSnap(0);
    // Discard any earlier one-shot positioning response before subscribing.
    cancelLocation();
    const destination={...end,selectionKind:'user'},options={...prefs,avoidPoints};
    const session={engine:null,search:null,stopWatch:null,latest:null,referenceRoute:route};
    followSession.current=session;
    session.search=createLiveFollowSearch({
      fetchSnapshot:fetchConstruction,
      createWorker:()=>new Worker(new URL('./route-worker.js',import.meta.url),{type:'module'}),
      onSnapshot:s=>{if(followSession.current===session)lastConstruction.current=s;},
      onState:state=>{
        if(followSession.current!==session)return;
        if(state.status==='loading')return;
        if(state.status==='ready'){
          const result=state.route,current=session.latest;
          if(result?.policyVersion!==ROUTING_POLICY||result.geometryVerification!=='pedestrian-network-v1'||!constructionFresh(lastConstruction.current)||result.construction?.sourceUpdatedAt!==lastConstruction.current?.sourceUpdatedAt){
            session.engine.complete(null);
            setFollowState({active:true,status:'failed',message:'無法確認重新規劃的路線，請稍後再試。'});
            return;
          }
          // Do not replace a user's route with a result based on a position
          // they have already moved away from while the worker was running.
          if(!current||distance(current,state.startPlace)>Math.max(20,current.accuracy*2)){
            session.engine.complete(displayedRouteCoordinates(session.referenceRoute));
            setFollowState({active:true,status:'uncertain',message:'位置已變動，正在等待新的定位。'});
            return;
          }
          session.referenceRoute=result;
          navAlong.current=0;setNavProgress(null);
          setStart(state.startPlace);
          setRoute(result);
          setRouteCandidates([]); setSelectedRouteCandidate(null);
          setRouteError('');
          setStepIndex(0);
          session.engine.complete(displayedRouteCoordinates(result));
          announce('已依目前位置重新規劃，請確認估計銜接及現場路況。');
        }else{
          session.engine.complete(null);
          setFollowState({active:true,status:'failed',message:state.message||'暫時無法重新規劃。'});
        }
      },
    });
    session.engine=createLiveFollow({
      coordinates:displayedRouteCoordinates(route),
      onPosition:p=>{
        if(followSession.current!==session)return;
        if(p.lat<24.94||p.lat>25.24||p.lon<121.42||p.lon>121.69){
          stopFollowing();setFollowState({active:false,status:'error',message:'目前位置超出路線服務範圍。'});return;
        }
        session.latest=p;setCurrentLocation(p);
        const progress=navigationProgress(session.referenceRoute,p,navAlong.current);
        if(progress){navAlong.current=progress.along;setNavProgress(progress);}else setNavProgress(null);
        if(followMap.current)setFocus({...p,zoom:17,token:Date.now()});
      },
      onUncertain:()=>{
        if(followSession.current!==session)return;
        session.latest=null;
        setNavProgress(null);
        session.search.cancel();
      },
      onStatus:status=>{if(followSession.current===session)setFollowState(s=>({...s,active:true,status,message:status==='following'?'':s.message}));},
      onReplan:p=>{
        if(followSession.current!==session)return;
        void session.search.start({startPlace:p,endPlace:destination,options,url:new URL(dataUrl('graph')+'?policy='+ROUTING_POLICY,location.href).href,online:navigator.onLine,offlineSnapshot:lastConstruction.current});
      },
    });
    setFollowState({active:true,status:'following',message:''});
    session.stopWatch=watchLocation(p=>session.engine.sample(p),error=>{
      if(followSession.current!==session)return;
      stopFollowing();
      setFollowState({active:false,status:'error',message:locationMessages[locationError(error)]});
    });
    return true;
  }
  useEffect(()=>{
    if(tab!=='plan')stopFollowing();
  },[tab]);
  useEffect(()=>()=>{
    const session=followSession.current;
    if(session){followSession.current=null;session.engine.stop();session.search.cancel();session.stopWatch?.();}
  },[]);
  function toggleSave(p) {
    const next = saved.some((x) => x.id === p.id)
      ? saved.filter((x) => x.id !== p.id)
      : [p, ...saved];
    setSaved(next);
    if (!saveLocal("hhz-saved", next))
      announce("這次沒能儲存收藏。請確認瀏覽器有可用的儲存空間。");
  }
  function cancelPendingNavigation() {
    cancelMapSnap();
    dataGate.current.cancel();
    pendingRoute.current = null;
    request.current++;
    officialRequest.current?.abort();
    worker.current?.cancel();
    conditionDetourSearch.current?.cancel();
    constructionDetourSearch.current?.cancel();
    cancelNearby();
    setRouting(false);
  }
  function openSearch(which) {
    if (which === "start" || which === "end") { cancelPendingNavigation(); cancelLocation(); }
    setSearchFor(which);
    setQuery("");
  }
  const locationMessages={LOCATION_DENIED:'定位權限尚未開啟。請在瀏覽器網站設定或手機定位設定允許此網站，再點一次定位。',LOCATION_TIMEOUT:'定位等候較久，請移到訊號較好的地方再試一次。',LOCATION_INSECURE:'請使用HTTPS網址開啟此服務，才能使用定位。',LOCATION_UNSUPPORTED:'這個瀏覽器不支援定位，可以搜尋出發地。',LOCATION_UNAVAILABLE:'裝置目前無法提供位置，請確認手機定位服務已開啟，再試一次。'};
  function cancelLocation(){ locationRequest.current++; setLocating(false); }
  async function locate(which, useAsStart = false) {
    if(which || useAsStart)stopFollowing();
    if (which) cancelPendingNavigation();
    const locationId=++locationRequest.current;
    const version = tabVersion.current;
    setLocating(true);
    try {
      const p = await getLocation();
      if(locationId!==locationRequest.current)return;
      if (which && version !== tabVersion.current) return;
      if (p.lat < 24.94 || p.lat > 25.24 || p.lon < 121.42 || p.lon > 121.69) {
        announce(
          "你目前的位置在服務範圍外。可以搜尋臺北的地點，或直接在地圖上選擇。",
        );
        return;
      }
      setCurrentLocation(p);
      setFocus({ ...p, token: Date.now() });
      if (useAsStart) { cancelNearby(); setStart(p); }
      if (which) changePoint(which, p);
    } catch (error) {
      autoLocated.current=false;
      if (locationId===locationRequest.current && (!which || version === tabVersion.current)) announce(locationMessages[locationError(error)]);
    } finally {
      if(locationId===locationRequest.current)setLocating(false);
    }
  }
  useEffect(() => {
    if (!profileReady || autoLocated.current || start) return;
    autoLocated.current = true;
    locate(null, true);
  }, [profileReady, start]);
  async function navigateTo(place) {
    rememberPlace(place);
    stopFollowing();
    cancelPendingNavigation();
    clearRoute();setRouteError('');
    const locationId=++locationRequest.current;
    setSelected(null);
    setSearchFor(null);
    setQuery("");
    setPick(null);
    setTab("plan");
    setGraphRequested(true);
    setFocus({ ...place, token: Date.now() });
    if (matchMedia("(max-width: 700px)").matches) setSheetSnap(1);
    let from = start;
    if (!from) {
      setLocating(true);
      try {
        from = await getLocation();
        if(locationId!==locationRequest.current)return;
        if (
          from.lat < 24.94 ||
          from.lat > 25.24 ||
          from.lon < 121.42 ||
          from.lon > 121.69
        ) {
          setEnd(place);
          announce("你目前的位置在服務範圍外。可以先選一個臺北的出發地。");
          return;
        }
      } catch (error) {
        if(locationId!==locationRequest.current)return;
        setEnd(place);
        announce(locationMessages[locationError(error)]);
        return;
      } finally {
        if(locationId===locationRequest.current)setLocating(false);
      }
    }
    setStart(from);
    setEnd(place);
    wantedStop.current = null;
    announce(`正在規劃前往${cleanName(place.name)}的路線。`);
    calculate({ start: from, end: place });
  }
  const avoidPoints = useMemo(
    () => activeElevatorStops(data),
    [data],
  );
  async function calculate(points) {
    stopFollowing();
    const fromPoint=points?.start||start,toPoint=points?.end||end;
    if (!fromPoint || !toPoint) { announce('請先選擇出發地和目的地。'); return; }
    const loaded = points?._loadedData || dataGate.current.peek();
    if (!loaded) {
      cancelLocation();
      clearRoute();
      setGraphRequested(true);
      announce('正在載入設施資料，完成後會繼續規劃。');
      const job = { start: fromPoint, end: toPoint, prefs: points?.prefs, via: points?.via };
      await afterData((ready) => calculate({ ...job, _loadedData: ready }));
      return;
    }
    // Route endpoints here come from an explicit selection, location action,
    // or a chosen nearby point. The flag permits an unregistered search
    // result's positional estimate; it is not a safety or access certificate.
    const from=fromPoint?{...fromPoint,selectionKind:'user'}:fromPoint,to=toPoint?{...toPoint,selectionKind:'user'}:toPoint;
    requestEndpoints.current={start:from,end:to};
    const requestPrefs={...normalizeRoutingPreferences(points?.prefs||prefs),avoidPoints:activeElevatorStops(loaded),startPlace:from,endPlace:to};
    if(!from||!to){announce('請先選擇出發地和目的地。');return;}
    cancelLocation();
    setGraphRequested(true);
    if(!graphReadyRef.current){clearRoute();setRouteError('');setRouting(true);pendingRoute.current={...points,start:from,end:to};worker.current?.start();announce('正在準備路線，完成後會繼續規劃。');return;}
    pendingRoute.current=null;
    if (from && to && navigator.onLine && !points?.via && ![from,to].some(p=>['20','station'].includes(String(p.kind)))) {
      setGraphRequested(true);
      clearRoute();
      setRouteError("");
      setRouting(true);
      setTab("plan");
      const id = request.current,
        controller = new AbortController();
      officialRequest.current = controller;
      const timer = setTimeout(() => controller.abort(), 90000);
      let localStarted = false;
      try {
        const [result, construction] = await Promise.all([requestOfficialRoute(
          [from.lat, from.lon],
          [to.lat, to.lon],
          requestPrefs,
          controller.signal,
        ), fetchConstruction(controller.signal)]);
        if (!construction.error) lastConstruction.current=construction;
        if (id !== request.current) return;
        if (construction.error) setRouteError(construction.error);
        else if (result.error) {
          localStarted=startLocalFallback(worker.current,id,from,to,requestPrefs,construction);
          if(!localStarted) setRouteError(result.error);
        }
        else {
          let verified=await verifyOnlineRoute(result,[from.lat,from.lon],[to.lat,to.lon],id,construction,requestPrefs);
          if(id!==request.current)return;
          if(verified.error && verified.detourWaypoints?.length){
            const alternatives=await searchVerifiedAlternatives({start:[from.lat,from.lon],end:[to.lat,to.lon],waypoints:verified.detourWaypoints,signal:controller.signal,
              query:(a,b,via,signal)=>requestOfficialRoute(a,b,{...requestPrefs,via},signal),
              verify:candidate=>verifyOnlineRoute(candidate,[from.lat,from.lon],[to.lat,to.lon],id,construction,requestPrefs)});
            if(id!==request.current)return;
            if(alternatives.route)verified={...alternatives.route,alternativeAttempts:alternatives.attempts};
            else if(alternatives.error==='CONSTRUCTION_UNAVAILABLE')verified=alternatives;
          }
          setConstructionConflict(verified.construction || null);
          if (canFallbackAfterVerification(verified.error)) {
            localStarted = startLocalFallback(worker.current,id,from,to,requestPrefs,construction);
            if (!localStarted) setRouteError(verified.error);
          }
          else if(verified.error || !['official-polygons-and-crossings-v1','pedestrian-network-v1'].includes(verified.geometryVerification) || verified.policyVersion !== ROUTING_POLICY) setRouteError(verified.error || 'UNVERIFIED_NETWORK');
          else {
            const candidates=presentRouteCandidates(verified.routeCandidates,ROUTING_POLICY,lastConstruction.current?.sourceUpdatedAt);
            setRouteCandidates(candidates);
            setSelectedRouteCandidate(candidates.find(c=>c.id===verified.selectedCandidateId)?.id ?? null);
            setRoute(verified); setStepIndex(0);
          }
        }
      } catch (error) {
        if (id === request.current) setRouteError(error.name === "AbortError" ? "OFFICIAL_TIMEOUT" : "OFFICIAL_UNAVAILABLE");
      } finally {
        clearTimeout(timer);
        if (id === request.current && !localStarted) setRouting(false);
      }
      return;
    }
    if (!from || !to) {
      announce("選好出發地和目的地，就能一起看看適合的走法。");
      return;
    }
    clearRoute();
    const localId=request.current;
    setRouting(true);
    let localConstruction=navigator.onLine ? await fetchConstruction() : lastConstruction.current;
    if(localId!==request.current)return;
    if(!constructionFresh(localConstruction)){setRouting(false);setRouteError('CONSTRUCTION_UNAVAILABLE');return;}
    lastConstruction.current=localConstruction;
    if (!worker.current) {
      pendingRoute.current = { ...points, start: from, end: to, _loadedData: loaded };
      setRouting(false);
      announce("正在準備路線資料，完成後會繼續規劃。");
      return;
    }
    clearRoute();
    setRouting(true);
    setRouteError("");
    if (!worker.current) return;
    worker.current.postMessage({
      type: points?.via ? 'route' : 'plan-places',
      startPlace:from,endPlace:to,
      id: ++request.current,
      start: [from.lat, from.lon],
      end: [to.lat, to.lon],
      options: requestPrefs,
      construction:localConstruction,
      via:points?.via ? [points.via.lat,points.via.lon] : null,
      viaName:points?.via?.name,
    });
  }
  function addStop(kind) {
    const hit = nearestStop(route, data?.all, kind);
    if (!hit) {
      announce("這條路線 150 公尺內沒有這類設施。");
      return;
    }
    wantedStop.current = null;
    calculate({
      via: {
        lat: hit.place.lat,
        lon: hit.place.lon,
        name: cleanName(hit.place.name),
      },
    });
  }
  async function openPhoneMap() {
    if (!start || !end) return;
    const url = mapLink(start, end);
    window.open(url, "_blank", "noopener");
  }
  function callNumber(number) {
    if (!hasTownPass()) window.location.href = `tel:${number}`;
    else postToTownPass("phone_call", number);
  }
  function reportBlockage() {
    if (!hasTownPass())
      announce("路障回報要在台北通裡同意後送出。你也可以撥 1999。");
    else postToTownPass("1999agree", true);
  }
  const essential = new Set(["toilet", "water", "rest"]);
  const mapKinds = new Set([...essential, "elevator", "park", "friendly", "bus", "public-toilet", "ramp", "entrance", "parking", "health", "facility", "place"]);
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
      (filter === "all" ? data?.all || [] : facilities).filter(
        (p) =>
          (filter !== "all" || mapKinds.has(category(p))) &&
          (filter !== "all" || viewport.zoom >= 19 || category(p) !== "place") &&
          p.lat >= viewport.bounds[0] &&
          p.lat <= viewport.bounds[2] &&
          p.lon >= viewport.bounds[1] &&
          p.lon <= viewport.bounds[3],
      ),
    [data, facilities, filter, viewport],
  );
  const landmarks = useMemo(() => {
    return landmarkIndex
      .filter(
        (p) =>
          p.lat >= viewport.bounds[0] &&
          p.lat <= viewport.bounds[2] &&
          p.lon >= viewport.bounds[1] &&
          p.lon <= viewport.bounds[3],
      )
      .sort((a, b) => distance(viewport, a) - distance(viewport, b));
  }, [landmarkIndex, viewport]);
  const mapPins = useMemo(() => {
    const seen = new Set();
    const pins = [];
    for (const p of [
      ...(showMapFacilities ? mapItems : []),
      ...(showMapFacilities ? nearbyMapFacilities.filter((p) =>
        (filter === "all" || category(p) === filter) &&
        (viewport.zoom >= 19 || category(p) !== "place")) : []),
      ...landmarks,
      ...(viewport.zoom >= 16 ? (metroExits || []).filter((p) => p.lat >= viewport.bounds[0] && p.lat <= viewport.bounds[2] && p.lon >= viewport.bounds[1] && p.lon <= viewport.bounds[3]) : []),
    ]) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      pins.push(p);
    }
    return pins;
  }, [showMapFacilities, mapItems, nearbyMapFacilities, tab, filter, landmarks, metroExits, viewport]);
  const searchResults = useMemo(() => {
    if (!searchFor || !data || !profileReady) return [];
    const q = normalize(query);
    const tripPlaces = trips
      .flatMap((trip) => [trip.start, trip.end])
      .filter((place) => Number.isFinite(place?.lat) && Number.isFinite(place?.lon));
    const recentIds = new Set([...recentPlaces, ...tripPlaces].map((place) => place.id));
    const list = q
      ? [
          ...[...recentPlaces, ...tripPlaces].filter((p) =>
            normalize(p.name + " " + (p.address || "")).includes(q),
          ),
          ...data.all.filter((p) =>
            normalize(p.name + " " + (p.address || "")).includes(q),
          ),
        ]
      : [...recentPlaces, ...tripPlaces, ...saved, ...data.fac.filter((p) => p.kind === "20")];
    const used = new Set(), usedIds = new Set();
    return [...(addressQuery === query ? addressResults : []).map(p => matchStationLandmark(p, data.fac)), ...list]
      .sort(
        (a, b) => {
          const exact = (a.name === query ? -1 : 0) - (b.name === query ? -1 : 0);
          if (exact) return exact;
          if (!q && recentIds.has(a.id) !== recentIds.has(b.id))
            return recentIds.has(a.id) ? -1 : 1;
          return distance(viewport, a) - distance(viewport, b);
        },
      )
      .filter((p) => {
        const key =
          normalize(p.name) +
          `:${p.lat}:${p.lon}`;
        if ((p.id && usedIds.has(p.id)) || used.has(key)) return false;
        if (p.id) usedIds.add(p.id);
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
    recentPlaces,
    addressResults,
    addressQuery,
    viewport.lat,
    viewport.lon,
  ]);
  const stationMatches = useMemo(() => searchFor && data ? matchMetroStations(query, data.metro, data.fac) : [], [searchFor, query, data]);
  const stations = useMemo(
    () =>
      data?.metro["metro-elevators"]?.filter((s) =>
        normalize(s["車站名稱"]).includes(normalize(stationQuery)),
      ) || [],
    [data, stationQuery],
  );
  const routeWorks = groupConstructionNotices(route?.construction?.nearby);
  const destinationNotice = end && category(end) === 'public-toilet'
    ? '目的地：一般公廁；無障礙設施資訊未確認。' : '';
  useEffect(() => {
    if(!route?.construction)return;
    const until=Date.parse(route.construction.sourceUpdatedAt)+CONSTRUCTION_MAX_AGE-Date.now();
    const timer=setTimeout(()=>{clearRoute();setRouteError('CONSTRUCTION_UNAVAILABLE');},Math.max(0,until));
    return ()=>clearTimeout(timer);
  }, [route]);
  useEffect(() => {
    if(!partialRoute)return;
    const until=Math.min(Date.parse(partialRoute.constructionSourceUpdatedAt),Date.parse(partialRoute.constructionFetchedAt))+CONSTRUCTION_MAX_AGE-Date.now();
    const timer=setTimeout(()=>{clearRoute();setRouteError('CONSTRUCTION_UNAVAILABLE');},Math.max(0,until));
    return ()=>clearTimeout(timer);
  },[partialRoute]);
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
      !(isVerifiedNavigationRoute(route)||isCurrentOfficialRoute(route)) ||
      route.requiresEntryConfirmation ||
      route.policyVersion !== ROUTING_POLICY
    )
      return;
    const text = `從${start.name}前往${end.name}，路線長約${formatDistance(route.distance)}。${destinationNotice}${nearbyWarnings(start,end).join(' ')}${route.kind==='official-passageway' ? '銜接與樓層未確認。' : ''}${route.approaches?.some(p=>p.estimated) ? "起終點銜接為直線位置估算，入口與實際通行狀況未確認，請先確認現場。" : ""}${route.steps.map((s) => `${stepText(s)}約${Math.round(s.distance)}公尺。${stepConditions(s) ? stepConditions(s)+'。' : ''}`).join("")}路況仍需留意現場，這是路線預覽。`;
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
      !isVerifiedNavigationRoute(route) ||
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
      announce("行程已存好，稍後可以從「收藏」再打開。");
    } else announce("儲存空間不足，這次沒能存下行程。");
  }
  async function share() {
    if (
      !(isVerifiedNavigationRoute(route)||isCurrentOfficialRoute(route)) ||
      route.requiresEntryConfirmation ||
      route.policyVersion !== ROUTING_POLICY
    )
      return;
    const text = `好好走｜${start.name} → ${end.name}\n約 ${formatDistance(route.distance)}\n${route.steps
      .slice(0, 20)
      .map((s) => `${s.name} ${Math.round(s.distance)}公尺${stepConditions(s) ? `（${stepConditions(s)}）` : ''}`)
      .join("\n")}\n${destinationNotice ? destinationNotice+'\n' : ''}${nearbyWarnings(start,end).join('\n')}${nearbyWarnings(start,end).length?'\n':''}${route.kind==='official-passageway' ? '銜接與樓層未確認。\n' : ''}${route.approaches?.some(p=>p.estimated) ? '起終點入口與實際通行狀況未確認，銜接為直線位置估算。\n' : ''}路線依公開路網規劃，部分通行條件尚未確認，請留意現場。`;
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
  useEffect(() => {
    if(graphReady && pendingMapSnap.current)void runMapSnap(pendingMapSnap.current);
  }, [graphReady]);
  useEffect(() => {
    if (!graphReady || !pendingRoute.current) return;
    const job = pendingRoute.current;
    pendingRoute.current = null;
    calculate(job);
  }, [graphReady]);
  useEffect(() => {
    if (!route || route.viaName || !wantedStop.current) return;
    const kind = wantedStop.current;
    wantedStop.current = null;
    const hit = nearestStop(route, data?.all, kind);
    if (!hit) {
      announce("這條路線 150 公尺內沒有這類設施。");
      return;
    }
    calculate({
      via: {
        lat: hit.place.lat,
        lon: hit.place.lon,
        name: cleanName(hit.place.name),
      },
    });
  }, [route]);
  const inspect = (p) => {
    cancelLocation();
    rememberPlace(p);
    setSelected(p);
    setFocus({ ...p, token: Date.now() });
  };
  const retryWithEntrance = ['OFFICIAL_PATH_UNVERIFIED','OFFICIAL_ROAD_CONFLICT','OFFICIAL_CROSSING_UNVERIFIED','OFFICIAL_ENTRY_UNVERIFIED','OFFICIAL_NO_ROUTE','OFFICIAL_GAP','NO_CONNECTION','NO_ROUTE'].includes(routeError);
  const simpleNoRoute=['NO_ROUTE','NO_CONNECTION','OFFICIAL_NO_ROUTE','OFFICIAL_GAP'].includes(routeError);
  const automaticComparisonLoading=referenceState.status==='loading'&&referenceBaseline.current?.automatic===true&&referenceBaseline.current.route===route;
  const routeSearchPending=routing||referenceState.status==='loading'||nearbyState.status==='loading';
  const mapRoutes=mapRouteVisibility({tab,routing,automaticComparisonLoading,route,partialRoute,simpleNoRoute});
  const mapLayers=routeViewLayers({stage:tripStage,hideMapIcons,showOfficialSidewalk,showConstruction});
  const previewChoices=(unifiedRouteChoices||[
    ...(!referenceCollapsed&&referenceState.status==='ready'?displayedReferenceCandidates.map(candidate=>({source:'reference',candidate})):[]),
    ...sortedRouteCandidates.map(candidate=>({source:'local',candidate})),
  ]).filter(item=>item.source==='reference'?isCurrentOfficialRoute(item.candidate?.route):isVerifiedNavigationRoute(item.candidate?.route)&&constructionFresh(lastConstruction.current)&&item.candidate.route.construction?.sourceUpdatedAt===lastConstruction.current?.sourceUpdatedAt);
  const previewIndex=previewChoices.findIndex(item=>item.candidate.route===route||(item.candidate.id===selectedRouteCandidate&&(item.source==='reference')===(route?.kind==='official-passageway')));
  function changePreview(direction){const item=previewChoices[previewIndex+direction];if(item)previewRoute(item.candidate,item.source);}
  useLayoutEffect(()=>{
    if(tripStage!=='choices'||!restoreChoicePosition.current)return;
    restoreChoicePosition.current=false;
    const frame=requestAnimationFrame(()=>{
      const panel=panelScroll.current,target=panel?.querySelector('.route-choice[aria-pressed="true"]')||panel?.querySelector('.route-choice')||panel?.querySelector('.route-alternatives');
      if(!panel||!target)return;
      const top=target.getBoundingClientRect().top-panel.getBoundingClientRect().top+panel.scrollTop;
      panel.scrollTop=Math.max(0,top-(panel.clientHeight-target.getBoundingClientRect().height)/2);
    });
    return ()=>cancelAnimationFrame(frame);
  },[tripStage]);
  useEffect(()=>{
    if(['NO_ROUTE','NO_CONNECTION'].includes(routeError) && referenceState.status!=='error')return;
    if(!shouldAutoSearchNearby({error:routeError,routing,graphReady,tab,start,end}))return;
    findNearbyPositions();
    // A new route request, changed endpoint or changed preference invalidates
    // the search. Nearby status is deliberately not a dependency: cancel or
    // completion must never restart the lookup by itself.
    return ()=>nearbySearch.current?.cancel(false);
  },[routeError,routing,graphReady,tab,start,end,prefs,avoidPoints,partialRoute,referenceState.status]);
  useEffect(()=>{
    if(nearbyState.status!=='ready'||!routeError||nearbyState.startPlace!==start||nearbyState.endPlace!==end||nearbyState.constructionSourceUpdatedAt!==lastConstruction.current?.sourceUpdatedAt)return;
    const choice=(nearbyState.verifiedCandidates||[]).map(candidate=>verifiedNearbyChoice(candidate,start,end,lastConstruction.current)).find(choice=>preservesGpsOrigin(choice,start));
    if(!choice)return;
    stopFollowing();
    setStart(start.originKind==='gps'?start:choice.start);setEnd(choice.end);setRoute(nearbyState.searchStatus==='projection-limit'?{...choice.route,routeSearchStatus:'projection-limit'}:choice.route);
    setRouteCandidates([]);setSelectedRouteCandidate(null);setStepIndex(0);
    setConstructionConflict(null);setRouteGap(null);setPartialRoute(null);setRouteError('');
    cancelNearby();
  },[nearbyState,routeError,start,end]);
  useEffect(()=>{
    if(tab!=='plan'||!start||!end||!graphReady||!['NO_ROUTE','NO_CONNECTION'].includes(routeError)||referenceAutoAttempt.current===request.current)return;
    referenceAutoAttempt.current=request.current;
    findReferenceRoute();
  },[tab,start,end,graphReady,routeError]);
  useReferenceComparison({start,end,prefs,avoidPoints,tab,graphReady,routing,routeError,route,referenceState,referenceSearch,referenceSnapshot,setReferenceState,referenceAutoAttempt,request,manualRouteSelection,followSession,findReferenceRoute});
  useEffect(()=>{
    const original=referenceBaseline.current;
    if(tab==='plan'||!original?.automatic||route!==original.route)return;
    manualRouteSelection.current=true;
    if(referenceState.status==='loading'){referenceSearch.current.cancel();referenceSnapshot.current=null;referenceBaseline.current=null;}
  },[tab,route,referenceState.status]);
  useLayoutEffect(()=>{
    const original=referenceBaseline.current;
    if(tab!=='plan'||referenceState.status!=='ready'||!original?.automatic||original.requestId!==request.current||route!==original.route)return;
    const improvement=chooseSidewalkImprovement({currentRoute:route,localCandidates:routeCandidates,referenceCandidates:referenceState.candidates,start,end,snapshot:lastConstruction.current,referenceSnapshot:referenceSnapshot.current,referenceSourceHash:referenceState.sourceHash,userSelected:manualRouteSelection.current,following:!!followSession.current});
    if(improvement)selectOfficialCandidate(improvement.candidate,true);
  },[referenceState,route,start,end,tab,routeCandidates]);
  useEffect(()=>{
    if(tab!=='plan'||referenceState.status!=='ready'||!['NO_ROUTE','NO_CONNECTION'].includes(routeError))return;
    const recommended=referenceState.candidates?.find(candidate=>candidate.route===referenceState.route);
    if(recommended)selectOfficialCandidate(recommended);
  },[referenceState,routeError,tab]);
  const referenceRoute=referenceState.status==='ready'&&referenceState.startPlace===start&&referenceState.endPlace===end&&constructionFresh(referenceSnapshot.current)&&referenceState.constructionSourceUpdatedAt===referenceSnapshot.current?.sourceUpdatedAt?referenceState.route:null;
  useEffect(()=>{
    if(referenceState.status!=='ready'||!referenceSnapshot.current)return;
    const s=referenceSnapshot.current,expires=Math.min(Date.parse(s.fetchedAt),Date.parse(s.sourceUpdatedAt))+CONSTRUCTION_MAX_AGE-Date.now();
    const timer=setTimeout(()=>{if(route?.kind==='official-passageway')clearRoute();else {referenceSearch.current.cancel();referenceSnapshot.current=null;}},Math.max(0,expires));
    return ()=>clearTimeout(timer);
  },[referenceState,route]);
  const entranceChoices = useMemo(() => {
    if (!retryWithEntrance) return [];
    return nearbyEntranceChoices(start, end, data?.fac);
  }, [retryWithEntrance, data, start, end]);
  const errorText = {
    PROJECTION_LIMIT: '這次路線計算已達上限，請重新規劃。',
    CONSTRUCTION_UNAVAILABLE: '施工資料暫時無法更新。請確認網路或稍後再試，附近設施仍可查看。',
    CONSTRUCTION_BLOCKED: '路線或入口遇到影響通行的施工通報，目前沒有找到通過檢查的替代路線。可以換個出入口再試。',

    OFFICIAL_PATH_UNVERIFIED: '這次還沒找到合適的走法。可以改從附近的電梯出口出發，或選擇另一個目的地入口。',
    OFFICIAL_ROAD_CONFLICT: '這次還沒找到合適的過街走法，可以換個入口再找找看。',
    OFFICIAL_CROSSING_UNVERIFIED: '這次還沒找到合適的過街走法，可以試試附近的電梯出口。',
    OFFICIAL_ENTRY_UNVERIFIED: start?.kind === 'metro-elevator' || end?.kind === 'metro-elevator'
      ? '尚未找到通過檢查的入口連接，請檢查另一端或重新選擇起點、目的地。'
      : '這個地點可能有不同入口，選擇實際使用的電梯出口，再幫你找路。',
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
      "尚未找到連接兩地的路線。",
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
      <div className="workspace" data-sheet={sheetSnap} data-trip-stage={tripStage}>
        <aside
          className="panel"
          hidden={!tab}
          data-tab={tab}
          data-stage={tripStage}
          data-compact={tab==='plan' && tripStage==='choices' && !route && !routeError}
          data-has-destination={Boolean(end)}
          id="main-content"
          ref={panelEl}
          data-snap={sheetSnap}
          onPointerDown={(e) => {
            if (tripStage !== 'choices' || !matchMedia("(max-width: 700px)").matches || sheetSnap !== 0)
              return;
            if (e.target.closest("button, a, input, textarea, select")) return;
            gripDown(e);
          }}
        >
          {tripStage==='choices' && <button
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
          />}
          {tripStage==='choices' && <nav className="main-nav" aria-label="主要功能">
            {[
              ["explore", "找設施", Compass],
              ["plan", "規劃路線", Route],
              ["saved", "收藏", Heart],
            ].map(([id, label, C]) => (
              <button
                key={id}
                className={tab === id || (id === "explore" && tab === "stations") ? "active" : ""}
                aria-label={label}
                onClick={() => {
                  if (tab !== id) { dataGate.current.cancel(); pendingRoute.current = null; }
                  cancelMapSnap();
                  if (id !== "plan") { cancelNearby(); stopFollowing(); }
                  setTab(id);
                  if(pick)clearPickPrompt();
                  setPick(null);
                  setSheetSnap((v) => Math.max(v, 1));
                }}
                aria-current={tab === id ? "page" : undefined}
              >
                <C size={24} aria-hidden="true" />
                <span>{label}</span>
              </button>
            ))}
            <button className="nav-utility" aria-label="設定" onClick={() => setModal("prefs")}>
              <SlidersHorizontal size={24} aria-hidden="true" />
            </button>
          </nav>}
          <div className="panel-scroll" ref={panelScroll}>
            {tripStage!=='choices' && route && <NavigationPanel stage={tripStage} route={route} end={end} progress={navProgress} followState={followState} onBack={returnToRoutes} onStart={startFollowing} onEnd={endNavigation} reportOpen={reportDemo} onReport={()=>setReportDemo(v=>!v)} constructionWorks={routeWorks.filter(w=>w.impact==='clear')} onAvoidConstruction={avoidConstruction} constructionDetourState={constructionDetourState} onCancelDetour={()=>constructionDetourSearch.current.cancel()} previewIndex={previewIndex} previewCount={previewChoices.length} onChangePreview={changePreview}/>}
            {tripStage==='choices' && <>
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
                <button className="primary" onClick={retryData}>
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
                        setFilter(current => current === id ? "all" : id);
                        setListLimit(12);
                      }}
                    >
                      <C size={20} aria-hidden="true" />
                      <span>{label}</span>
                    </button>
                  ))}
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
                      aria-label="交換起點與終點"
                      disabled={!start||!end}
                      onClick={() => {
                        stopFollowing();
                        cancelLocation();
                        setStart(swappedOrigin(end));
                        setEnd(destinationPoint(start));
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
                        <button className="point-main" onClick={() => openSearch(which)}
                          aria-label={point ? `${noun}：${point.name}，點一下重新選擇` : placeholder}>
                          <small>{label}</small>
                          <strong className={point ? "" : "placeholder"}>{point?.name || placeholder}</strong>
                          {point?.nearbyOriginal && <small>距原選點約 {point.nearbyOriginal.straightMetres} 公尺，銜接未確認</small>}
                        </button>
                        {which === "start" && <button type="button" className="point-shortcut" onClick={() => locate("start")} disabled={locating} aria-label={locating ? "正在定位出發地" : "使用目前位置作為出發地"}>
                          {locating ? <LoaderCircle className="spin" size={18} aria-hidden="true" /> : <LocateFixed size={18} aria-hidden="true" />}
                          <span>{locating ? "定位中" : "定位"}</span>
                        </button>}
                        {which === "end" && end && <button type="button" className="point-clear" aria-label="清除目的地" onClick={clearDestination}><X size={19} aria-hidden="true"/></button>}
                      </div>
                    ))}
                  </div>
                </div>
                {end && <button
                  className="primary full"
                  onClick={() => calculate()}
                  disabled={routeSearchPending || waitingForData}
                >
                  {routeSearchPending ? (
                    <LoaderCircle className="spin" size={19} />
                  ) : (
                    <Route size={19} />
                  )}{" "}
                  {routeSearchPending ? "正在尋找路線…" : "規劃路線"}
                  <ArrowRight size={19} />
                </button>}
                {graphRequested && !graphReady && graphError && (
                  <p className="quiet-note" role="status">
                    路線資料暫時讀取不到，請重新整理再試。
                  </p>
                )}
                {routeError && !(simpleNoRoute && routeSearchPending) && (
                  <div className={`notice ${retryWithEntrance ? "route-recovery" : ""}`} role="status" ref={routeFeedback}>
                    <Info />
                    <div>
                    <p>
                      {simpleNoRoute ? '找不到路線。' : (nearbyState.status==='loading' ? '正在尋找附近可連通的路線…' : (errorText[routeError] || "暫時無法規劃，請稍後再試。"))}
                    </p>
                    {!simpleNoRoute && partialRoute && <section aria-label="未連接的部分路段">
                      <p>{partialRoute.message}</p>
                      {partialRoute.segments.some(s=>s.officialConditions?.points?.length>0)&&<p>部分路線附近有官方不利通行紀錄，地圖已標示；與路線的關係及現況未確認。</p>}
                      {partialRoute.segments.some(s=>s.officialConditions?.status==='unavailable')&&<p>官方不利通行資料暫時無法讀取。</p>}
                      {partialRoute.gap.kind==='between-network'&&Number.isFinite(partialRoute.gap.straightMetres)&&<p>兩側路網點直線相距約 {formatDistance(partialRoute.gap.straightMetres)}；中間路段尚未規劃。</p>}
                      {partialRoute.segments.map(s=><div key={s.side}>
                        <p><strong>{s.side==='start'?'起點側路段':'目的地側路段'}</strong> · 約 {formatDistance(s.distance)}{s.side==='end'?'（目前未與起點側連接）':''}</p>
                        {s.side==='start'&&partialRoute.resolvedStart?.name&&partialRoute.resolvedStart.id!==start?.id&&<p>使用候選入口：{cleanName(partialRoute.resolvedStart.name)}。</p>}
                        {s.side==='end'&&partialRoute.resolvedEnd?.name&&partialRoute.resolvedEnd.id!==end?.id&&<p>使用候選入口：{cleanName(partialRoute.resolvedEnd.name)}。</p>}
                        {s.approaches.some(a=>a.estimated)&&<p>部分入口銜接為位置估算，實際通行狀況未確認。</p>}
                        {s.tierSegments.some(t=>t.sharedRoad)&&<p>部分路段可能人車共行，通行與無障礙狀況未確認。</p>}
                        {Array.isArray(s.steps)&&s.steps.length>0&&<details><summary>查看{s.side==='start'?'起點側':'目的地側'}步驟</summary><ol>{s.steps.map((step,i)=><li key={i}>{stepText(step)}，約 {formatDistance(step.distance)}{stepConditions(step)?`，${stepConditions(step)}`:''}</li>)}</ol></details>}
                      </div>)}
                      <RouteLegend segments={partialRoute.segments} colorFriendly={prefs.colorFriendly} showIssueIcons={true}/>
                    </section>}
                    {!simpleNoRoute && routeGapView && <p>{routeGapView.message}</p>}
                    {!simpleNoRoute && retryWithEntrance && entranceChoices.length > 0 && <div className="entrance-choices">
                      <p>附近捷運電梯出口（距離為直線估算，選擇後會更改起終點，需重新規劃）</p>
                      {entranceChoices.map(({which,p}) => <button key={which+p.id} onClick={()=>changePoint(which,p)}>
                        <ArrowUpFromLine size={18} aria-hidden="true"/><span>{which==='start'?'出發地改為':'目的地改為'} {cleanName(p.name)}<small>距原選點約 {formatDistance(p.gap)}</small></span><ChevronRight size={18} aria-hidden="true"/>
                      </button>)}
                    </div>}
                    {constructionConflict?.blocked?.length > 0 && <p>{showConstruction ? '地圖已標出影響路線的施工位置；' : '路線受到施工影響；'}點線位置的周邊範圍是估計，並非精確封閉邊界。</p>}
                    {constructionConflict?.blocked?.slice(0,3).map(w => <p key={w.id}>{w.address}：{w.match === 'vicinity' ? '鄰近影響通行的施工位置' : '與影響通行的施工範圍交會'}。{w.plan}</p>)}
                    {!simpleNoRoute && (retryWithEntrance||routeError==='CONSTRUCTION_BLOCKED') && start && end && graphReady && <div className="entrance-choices">
                      {(nearbyState.status==='idle'||nearbyState.status==='error')&&<button type="button" onClick={findNearbyPositions}>重新找路</button>}
                      {nearbyState.status==='loading'&&<button type="button" onClick={cancelNearby}>取消搜尋</button>}
                      {nearbyState.status==='error'&&<p>{nearbyState.message}</p>}
                      {nearbyState.status==='ready'&&<>
                        <p>附近仍未找到可連通的路線，請重新選點。</p>
                        {nearbyState.candidates.length>0&&<details><summary>查看附近路網位置</summary><p>這些位置尚未確認能否連通，選擇後會重新找路。</p>{nearbyState.candidates.map((c,i)=><button type="button" key={`${c.side}-${c.point.id}`} onClick={()=>chooseNearby(c)}><span>{c.side==='start'?'起點':'目的地'}附近位置 {i+1}<small>距原點約 {formatDistance(c.straightMetres)}{c.point.nearbyNetwork==='shared'?' · 人車共行':''}</small></span><ChevronRight size={18}/></button>)}</details>}
                        {nearbyState.truncated&&<p>搜尋未完成，可再試一次。</p>}
                      </>}
                    </div>}
                    </div>
                  </div>
                )}
                {!mapRoutes.pending && unifiedRouteChoices?.length>0 && <section className="route-alternatives" aria-label="選擇路線">
                  <h3>選擇路線</h3>
                  {unifiedRouteChoices.length>1 && <div className="candidate-sort" role="group" aria-label="路線排序">
                    <button type="button" aria-pressed={candidateSort==='score'} onClick={()=>{manualRouteSelection.current=true;setCandidateSort('score');}}>較好走優先</button>
                    <button type="button" aria-pressed={candidateSort==='distance'} onClick={()=>{manualRouteSelection.current=true;setCandidateSort('distance');}}>依距離</button>
                  </div>}
                  {unifiedRouteSummaries.some(summary=>summary.hasUnknown && !summary.concern.includes('資料不足')) && <p className="route-choice__note">部分路況資料不足</p>}
                  {unifiedRouteChoices.map((item,index)=>{const candidate=item.candidate,source=item.source==='reference';return <RouteChoice key={`${item.source}:${candidate.id}`} number={index+1} distance={item.distance} summary={unifiedRouteSummaries[index]} selected={route===candidate.route || (!source&&selectedRouteCandidate===candidate.id)} disabled={source?!isCurrentOfficialRoute(candidate.route):!constructionFresh(lastConstruction.current)||candidate.route?.construction?.sourceUpdatedAt!==lastConstruction.current?.sourceUpdatedAt} onClick={()=>previewRoute(candidate,source?'reference':'local')}/>;})}
                </section>}
                {referenceCollapsed && referenceState.status==='ready' && <button type="button" onClick={()=>setReferenceCollapsed(false)}>查看線條說明</button>}
                {!simpleNoRoute && !mapRoutes.pending && referenceState.status!=='loading' && <ReferenceRouteResult status={referenceCollapsed?'idle':referenceState.status} route={referenceRoute} candidates={displayedReferenceCandidates} selected={selectedRouteCandidate} onSelect={candidate=>previewRoute(candidate,'reference')} comparisonStatus={referenceState.comparisonStatus} showCandidates={!unifiedRouteChoices} showLegend={false} showSelectedNotice={false} showIssueIcons={true} start={start} end={end} message={referenceState.message} onClose={()=>{if(route?.kind==='official-passageway')setReferenceCollapsed(true);else {referenceSearch.current.cancel();referenceSnapshot.current=null;referenceBaseline.current=null;}}} />}
                {route && !mapRoutes.pending && (
                  <>
                    <div className="route-summary"><h2>{start?.nearbyOriginal||end?.nearbyOriginal?'路網路線':'全程'} {formatDistance(route.distance)}</h2></div>
                    {(route.routeSearchStatus==='projection-limit'||route.conditionDetourComparison==='projection-limit'||route.pedestrianImprovement?.status==='projection-limit'||route.routeCandidates?.status==='projection-limit'||route.avoidanceStatus==='projection-limit') && <p role="status">部分比較未完成，路線仍可查看；可重新規劃。</p>}
                    {route.officialConditions?.status === "unavailable" && <p className="quiet-note" role="note">目前查不到沿途通行問題紀錄。</p>}
                    {routeWorks.length > 0 && <p className="quiet-note" role="note">附近有施工，請留意現場指引。</p>}
                    {routeWorks.filter(w=>w.impact==='clear').map(w=><button className="construction-avoid" key={w.id} type="button" disabled={constructionDetourState.status==='loading'} onClick={()=>avoidConstruction(w.ids)}>繞過施工：{w.address}</button>)}
                    {constructionDetourState.status==='loading'&&<p role="status"><LoaderCircle className="spin" size={18} aria-hidden="true"/> 正在尋找繞路… <button type="button" onClick={()=>constructionDetourSearch.current.cancel()}>取消</button></p>}
                    {constructionDetourState.status==='error'&&<p role="status">{constructionDetourState.message}</p>}
                    {conditionDetourState.status==='loading'&&<p role="status">正在尋找繞路… <button type="button" onClick={()=>conditionDetourSearch.current.cancel()}>取消</button></p>}
                    {conditionDetourState.status==='error'&&<p role="status">{conditionDetourState.message}</p>}
                    {route.conditionDetour&&<p className="quiet-note" role="note">已規劃避開 {route.conditionDetour.targets.length} 筆所選官方紀錄點 10 公尺內的路線；點位與實際路況仍需現場確認。</p>}
                    {!unifiedRouteChoices && sortedRouteCandidates.length > 0 && <section className="route-alternatives" aria-label="選擇路線">
                      <h3>選擇路線</h3>
                      {sortedRouteCandidates.length>1 && <div className="candidate-sort" role="group" aria-label="路線排序">
                        <button type="button" aria-pressed={candidateSort==='score'} onClick={()=>{manualRouteSelection.current=true;setCandidateSort('score');}}>較好走優先</button>
                        <button type="button" aria-pressed={candidateSort==='distance'} onClick={()=>{manualRouteSelection.current=true;setCandidateSort('distance');}}>依距離</button>
                      </div>}
                      {localRouteSummaries.some(summary=>summary.hasUnknown && !summary.concern.includes('資料不足')) && <p className="route-choice__note">部分路況資料不足</p>}
                      {sortedRouteCandidates.map((candidate,index)=><RouteChoice key={candidate.id ?? index} number={index+1} distance={candidate.metrics.distanceMetres} summary={localRouteSummaries[index]} selected={selectedRouteCandidate===candidate.id || (candidate.id==='original-route' && route===candidate.route)} disabled={!constructionFresh(lastConstruction.current)||candidate.route?.construction?.sourceUpdatedAt!==lastConstruction.current?.sourceUpdatedAt} onClick={()=>previewRoute(candidate,'local')}/>)}
                    </section>}
                    {!unifiedRouteChoices?.length && !sortedRouteCandidates.length && !displayedReferenceCandidates.length && <RouteChoice number={1} distance={route.distanceMetres??route.distance} summary={describeRouteChoices([{source:'local',candidate:{route,metrics:{distanceMetres:route.distanceMetres??route.distance}}}])[0]} selected onClick={previewSelectedRoute}/>}
                    {route.kind!=='official-passageway' && <details className="route-disclosure"><summary>線條說明</summary><RouteLegend segments={[route]} colorFriendly={prefs.colorFriendly} showIssueIcons={true}/></details>}
                    {route.kind==='official-passageway' && !referenceCollapsed && <ReferenceRouteResult status={referenceState.status} route={referenceRoute} candidates={displayedReferenceCandidates} selected={selectedRouteCandidate} showCandidates={false} showLegend={true} showSelectedNotice={true} start={start} end={end}/>}
                    {route.viaName && !followState.active && <p className="quiet-note">順路停靠的行程暫不支援位置跟隨。</p>}
                    {(followState.active || followState.message) && <p className="quiet-note" role="status">
                      {followState.message || ({following:'位置跟隨中；偏離門檻依定位精度調整，輕微偏離可能不會觸發。',replanning:'偵測到偏離，正在重新規劃。',uncertain:'定位精度或時間不足，暫停自動重新規劃。',failed:'暫時無法重新規劃。',unavailable:'目前路線資料不足，暫停位置跟隨。'}[followState.status]||'')}
                    </p>}
                    <details className="route-disclosure"><summary>查看步驟</summary>
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
                                {stepConditions(s) ? ` · ${stepConditions(s)}` : ''}
                              </small>
                            </span>
                          </button>
                        </li>
                      ))}
                    </ol>
                    </details>
                    <details className="route-disclosure"><summary>路線詳情</summary>
                    {Number.isFinite(selectedRouteScore) && <p className="quiet-note">比較分數：{selectedRouteScore.toFixed(1)}</p>}
                    {destinationNotice && <p className="quiet-note" role="note">{destinationNotice}</p>}
                    {route.construction && <p className="quiet-note">施工資料更新：{new Date(route.construction.sourceUpdatedAt).toLocaleString('zh-TW', {timeZone:'Asia/Taipei'})}{route.construction.unmapped > 0 ? ` · ${route.construction.unmapped} 處施工位置待確認` : ''}</p>}
                    {route.construction?.avoided > 0 && (
                      <p className="quiet-note">
                        已避開 {route.construction.avoided} 處今日施工。
                      </p>
                    )}
                    {avoidPoints.length > 0 && (
                      <p className="quiet-note">
                        今天有電梯保養，路線會盡量不從那些出口經過。
                      </p>
                    )}
                    {route.viaName && (
                      <p className="quiet-note">順路停靠：{route.viaName}</p>
                    )}
                    {route.approaches?.some(p=>p.estimated) && <p className="quiet-note" role="note">位置估算，實際通行狀況未確認；虛線約 {route.approaches.filter(p=>p.estimated).map(p=>p.distance).join('／')} 公尺。</p>}
                    <p className="quiet-note">線條反映已知資料，實際路況請留意現場。</p>
                    {route.pedestrianImprovement?.status === 'unsupported-official-provenance' && <p className="quiet-note">使用官方原路；此路線暫無法比較沿線人行道替代路段。</p>}
                    {route.tierSegments?.some(segment => segment.sharedRoad === true) && (
                      <p className="quiet-note" role="note">部分路段可能人車共行，通行與無障礙狀況未確認。</p>
                    )}
                    <p className="quiet-note">{route.provider === "mapped-pedestrian" ? "路網參考路線" : route.provider === "local-verified" ? "另一條人行路線" : route.provider === "local-detour" ? "已改走避開施工的人行路線" : route.provider === "taipei-official" ? "臺北市無障礙通行路線圖台回傳" : "離線人行路網參考"}</p>
                    {route.costBreakdown && <p className="quiet-note">這條路依距離、路況資料、坡度與寬度等條件綜合比較；資料未知不代表無障礙。</p>}
                    {route.unknownPct > 0 && <p className="quiet-note">路寬／坡度：尚無完整資料{Number.isFinite(route.unknownWidthMetres) && Number.isFinite(route.unknownSlopeMetres) ? `（路網中約 ${Math.round(route.unknownWidthMetres)} 公尺寬度未知、${Math.round(route.unknownSlopeMetres)} 公尺坡度未知）` : ''}。</p>}
                    {!route.approaches && !route.requiresEntryConfirmation && (route.startGap > 10 || route.endGap > 10) && (
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
                    <div className="point-actions">
                      <button type="button" onClick={() => addStop("toilet")}>
                        <Toilet size={16} />
                        順路找無障礙廁所
                      </button>
                      <button type="button" onClick={() => addStop("rest")}>
                        <Armchair size={16} />
                        順路找歇腳椅
                      </button>
                    </div>
                    <div className="route-tools">
                      <button type="button" onClick={openPhoneMap}>
                        <Navigation size={17} />
                        手機地圖
                      </button>
                      <button type="button" onClick={() => callNumber(PHONES.metro)}>
                        <Phone size={17} />
                        捷運專線
                      </button>
                      <button type="button" onClick={() => callNumber(PHONES.city)}>
                        <Phone size={17} />
                        1999
                      </button>
                      <button type="button" onClick={reportBlockage}>
                        <AlertTriangle size={17} />
                        回報路障
                      </button>
                      <button onClick={saveTrip} disabled={route.requiresEntryConfirmation || !isVerifiedNavigationRoute(route)}>
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
                    {route.crossingUncertainties?.length > 0 && <p className="quiet-note">路線包含 {route.crossingUncertainties.length} 段 OSM 過街資料未被官方資料完整覆蓋；地圖以點線標出相關路段。</p>}
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
                              {c.hours && <><br />施工時間：{c.hours}</>}
                              <br />
                              {c.plan || "通行影響請依現場指引確認。"}
                              {c.count > 1 && `（同一工程 ${c.count} 筆通報）`}
                            </p>
                          </div>
                        ))}
                      </>
                    )}
                    </details>
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
                {trips.length > 0 && <p className="quiet-note">開啟頁面時會檢查施工通報；點選受影響的行程可重新規劃。</p>}
                {trips.length > 0 && tripCheckFailed && <p className="quiet-note" role="status">施工資料暫時無法更新，請稍後再試。</p>}
                {trips.length > 0 &&
                  trips.map((t) => (
                    <div className="trip-card" key={t.id}>
                      <button
                        onClick={() => {
                          stopFollowing();
                          cancelLocation();
                          request.current++;
                          setStart(t.start);
                          setEnd(t.end);
                          clearRoute();
                          setPrefs(normalizeRoutingPreferences({
                            ...basePrefs,
                            ...t.prefs,
                            avoidSteps: true,
                            officialOnly: false,
                          }));
                          setTab("plan");
                          setRouteError("");
                          setRouting(false);
                          if (tripAlerts[t.id]) {
                            wantedStop.current = null;
                            announce(t.route.viaName ? "正在重新規劃，這次不包含原本的順路停靠。" : "正在重新規劃，避開已通報的施工。");
                            calculate({ start: t.start, end: t.end, prefs: { ...basePrefs, ...t.prefs, avoidSteps: true, officialOnly: false } });
                          } else announce("已帶入起點與終點。舊路線不會沿用，請按「規劃路線」重新確認。");
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
                          {tripAlerts[t.id] && <small role="status">施工可能影響通行：{tripAlerts[t.id][0].address} · 點此重新規劃</small>}
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
            </>}
          </div>
        </aside>
        <main className="map-area" aria-label="地圖與設施">
          {tripStage==='navigation' && <NavigationPrompt progress={navProgress} followState={followState}/>}
          <MapView
            items={mapLayers.hideMapIcons ? NO_MAP_ICONS : mapPins}
            activeFilter={tab==='explore' ? filter : 'all'}
            recentPlaces={mapLayers.hideMapIcons ? NO_MAP_ICONS : recentPlaces}
            basemap={basemap}
            showOfficialSidewalk={mapLayers.showOfficialSidewalk}
            hideMapIcons={mapLayers.hideMapIcons}
            routeFocus={mapLayers.focus}
            animateRoute={mapLayers.animateRoute}
            onAvoidConstruction={tab==='plan' && mapRoutes.route ? avoidConstruction : null}
            avoidingConstruction={constructionDetourState.status==='loading'}
            onOfficialSidewalkStatus={setSidewalkStatus}
            colorFriendly={prefs.colorFriendly}
            onBasemapStatus={setBasemapStatus}
            route={mapRoutes.route}
            onAvoidOfficialCondition={tab==='plan' && mapRoutes.route ? avoidOfficialCondition : null}
            avoidingOfficialCondition={conditionDetourState.status==='loading'}
            referenceRoute={null}
            partialRoute={mapRoutes.partialRoute}
            constructionConflict={tab && showConstruction && !mapRoutes.pending && tripStage==='choices' ? constructionConflict : null}
            constructionSnapshot={constructionFeed.snapshot}
            showConstruction={mapLayers.showConstruction}
            onConstructionStatus={setConstructionMapStatus}
            routeGap={tab && !simpleNoRoute && !mapRoutes.pending ? routeGapView : null}
            nearbyCandidates={tab==='plan' && !simpleNoRoute && !mapRoutes.pending ? nearbyState.candidates : NO_MAP_ICONS}
            onNearbySelect={chooseNearby}
            start={tab ? start : null}
            end={tab ? end : null}
            location={currentLocation}
            focus={focus}
            pick={pick}
            onPick={selectPoint}
            onSelect={inspect}
            onViewport={setViewport}
            onBearing={setBearing}
            onMapReady={(m) => (map.current = m)}
            fitPadding={() => routeFitPadding({
              phone: matchMedia("(max-width: 700px)").matches,
              viewportHeight: window.innerHeight,
              sheetFraction: tripStage==='choices' ? SHEET_SNAPS[1] : Math.min(.48,(panelEl.current?.getBoundingClientRect().height||220)/window.innerHeight),
              sheetMax: parseFloat(panelEl.current?.style.getPropertyValue("--sheet-max")) || Infinity,
              mapRect: map.current?.getContainer().getBoundingClientRect(),
              panelRect: panelEl.current?.getBoundingClientRect(),
            })}
            sheetSnap={sheetSnap}
            getBottomInset={()=>matchMedia('(max-width:700px)').matches && tab && panelEl.current ? window.innerHeight-panelEl.current.getBoundingClientRect().top : 0}
            onGesture={() => {
              if(tripStage==='navigation'){followMap.current=false;return;}
              if (
                matchMedia("(max-width: 700px)").matches &&
                sheetSnap > 0
              )
                setSheetSnap(0);
            }}
          />
          {(facilityStatus === "error" || landmarkError || (viewport.zoom >= 16 && metroExitError) || (showConstruction && !hideMapIcons && (['unavailable','update-failed'].includes(constructionFeed.status)||constructionMapStatus.truncated))) && <div className="facility-load-error" role="status">
            {(facilityStatus === "error" || landmarkError || (viewport.zoom >= 16 && metroExitError)) && <><span>部分地圖設施載入失敗。</span><button type="button" onClick={() => {
              if (facilityStatus === "error") retryFacilityTiles();
              if (landmarkError) setLandmarkRetry((n) => n + 1);
              if (viewport.zoom >= 16 && metroExitError) setMetroExitRetry((n) => n + 1);
            }}>再試一次</button></>}
            {showConstruction && !hideMapIcons && ['unavailable','update-failed'].includes(constructionFeed.status) && <><span>施工資料暫時無法更新。</span><button type="button" onClick={constructionFeed.retry}>重試施工</button></>}
            {showConstruction && !hideMapIcons && constructionMapStatus.truncated && <span>部分施工未顯示，放大地圖可看更多。</span>}
          </div>}
          {!tab && <button className="map-search-button" onClick={()=>openSearch("explore")} aria-label="搜尋地點、地址或路名"><Search size={20}/><span>搜尋地點、地址或路名</span></button>}
          <div className="map-dock" ref={layersRef}>
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
                  <b>隱藏地圖圖標</b>
                  <input type="checkbox" checked={hideMapIcons} onChange={(e) => setHideMapIcons(e.target.checked)} />
                </label>
                <label className="toggle-row layers-toggle">
                  <span><b>施工資訊</b>{constructionFeed.status==='loading' && <small>載入中…</small>}{hideMapIcons && <small>已隱藏圖標</small>}{!hideMapIcons && constructionMapStatus.truncated && <small>只顯示部分，放大地圖可看更多</small>}</span>
                  <input type="checkbox" checked={showConstruction} onChange={(e)=>setShowConstruction(e.target.checked)} />
                </label>
                <label className="toggle-row layers-toggle">
                  <span><b>人行道</b>{sidewalkStatus === "loading" && <small>載入中…</small>}{sidewalkStatus === "zoom" && <small>請放大地圖</small>}{sidewalkStatus === "error" && <small>暫時無法載入</small>}</span>
                  <input type="checkbox" checked={showOfficialSidewalk} onChange={(e) => setShowOfficialSidewalk(e.target.checked)} />
                </label>
                {showOfficialSidewalk && <div className="issue-legend" aria-label="不利通行圖例"><span className="issue-legend-title">淨寬不足：活動區域分類</span>{[...NO_WALK_URLS,UNKNOWN_NO_WALK_URL].map((url,i)=><span key={url}><img src={url} width="18" height="18" alt="" />{['高','中','低','未提供'][i]}</span>)}<span><i className="issue-ring" aria-hidden="true" />行穿線未設路緣斜坡</span></div>}
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
            onClick={() => tripStage==='navigation' ? recenterNavigation() : locate()}
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
            <div className="pick-prompt">
              <MapPin size={19} />
              <span>
                點一下地圖，選擇{pick === "start" ? "出發地" : "目的地"}
              </span>
              <button onClick={() => {cancelMapSnap();setPick(null);clearPickPrompt();}} aria-label="取消地圖選點">
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
      <div className="sr-only" role="status" aria-live="polite">{srStatus}</div>
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
          <div className="search-options">
            <button
              onClick={() => {
                const which = searchFor === "explore" ? null : searchFor;
                setSearchFor(null);
                locate(which);
              }}
            >
              <LocateFixed size={20} />
              <span>{locating ? "定位中…" : "使用目前位置"}</span>
            </button>
            <button
              onClick={() => {
                cancelPendingNavigation();
                cancelLocation();
                setPick(searchFor === "explore" ? "end" : searchFor);
                setSearchFor(null);
                setQuery("");
                setTab("plan");
                setSheetSnap(0);
                announce(`請在地圖上點選${searchFor === "start" ? "出發地" : "目的地"}。`);
              }}
            >
              <MapPin size={20} />
              <span>在地圖上點選</span>
            </button>
          </div>
          {stationMatches.map((match) => (
            <StationSearchGroup key={match.name} match={match}
              renderExit={(p) => <FacilityRow key={p.id} p={p} from={viewport}
                note={avoidPoints.some(([lat, lon]) => lat === p.lat && lon === p.lon) ? "今天有保養，可能無法使用" : ""}
                onSelect={(place) => {
                  if (searchFor === "explore") { setSearchFor(null); inspect(place); }
                  else changePoint(searchFor, place);
                }} />}
              onDetails={() => {
                setSearchFor(null);
                setSelected({ id: `station-${match.name}-${match.record["路線別"]}`,
                  name: stationLabel(match.name), kind: "station-detail", record: match.record, exits: match.exits });
              }} />
          ))}
          {waitingForData ? <p role="status">正在載入設施資料…</p> : loadError && !data ?
            <p role="status">資料暫時無法載入。 <button className="text-button" onClick={retryData}>再試一次</button></p> :
            <p className="list-caption">{query ? "找到這些地方" : "最近行程、收藏與附近車站"}</p>}
          {searchResults.map((p) => (
            <FacilityRow
              key={p.id}
              p={p}
              from={viewport}
              sourceLabel={searchResults.some(other => other !== p && normalize(other.name) === normalize(p.name))
                ? (p.sourceId === 'osm' ? 'OpenStreetMap' : p.sourceId ? '其他圖資' : '地點搜尋') : undefined}
              onSelect={(p) => {
                if (searchFor === "explore") {
                  setSearchFor(null);
                  inspect(p);
                } else changePoint(searchFor, p);
              }}
            />
          ))}
          {query.trim() && !searchResults.length && (addressQuery !== query || addressPending) && <p role="status">正在搜尋地點…</p>}
          {query.trim() && addressQuery === query && !addressPending && addressError && <p role="status">部分搜尋來源暫時無法使用，請確認網路或稍後再試；也可以使用地圖選點。</p>}
          {query.trim() && data && !searchResults.length && !stationMatches.length && addressQuery === query && !addressPending && !addressError && (
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
              {unlocatedError && <p className="quiet-note">部分出口資料暫時無法載入。</p>}
              {unlocatedExits?.some((p) => stationKey(p.station) === stationKey(selected.record["車站名稱"])) &&
                <h3>以下出口尚未對應座標，未顯示於地圖</h3>}
              {unlocatedExits?.filter((p) => stationKey(p.station) === stationKey(selected.record["車站名稱"])).map((p) => (
                <div className="notice soft" key={p.id}>
                  <Info size={18} aria-hidden="true" />
                  <p>{p.name}：{p.elevator === true ? "有電梯" : "電梯資訊待確認"}；{p.description || "地圖位置未提供"}。</p>
                </div>
              ))}
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
              {/* Apple 地圖式地點卡：一行分類與距離、一排操作、資訊清單；不放說明文字 */}
              <p className="place-subtitle">
                {selected.kind === "metro-exit" ? "捷運出口" : labels[category(selected)] || "地點"}
                {" · "}
                {formatDistance(distance(currentLocation || viewport, selected))}
              </p>
              <div className="place-actions">
                <button
                  className="primary place-go"
                  aria-label={`導航到${cleanName(selected.name)}`}
                  onClick={() => navigateTo(selected)}
                >
                  <Navigation size={20} aria-hidden="true" />
                  導航
                </button>
                <button
                  className="place-icon-btn"
                  aria-label="從這裡出發"
                  onClick={() => {
                    changePoint("start", selected);
                    setSelected(null);
                  }}
                >
                  <MapPin size={20} aria-hidden="true" />
                </button>
                <button
                  className="place-icon-btn"
                  aria-label={saved.some((x) => x.id === selected.id) ? "取消收藏" : "收藏"}
                  aria-pressed={saved.some((x) => x.id === selected.id)}
                  onClick={() => toggleSave(selected)}
                >
                  <Heart
                    size={20}
                    aria-hidden="true"
                    fill={saved.some((x) => x.id === selected.id) ? "currentColor" : "none"}
                  />
                </button>
              </div>
              {(() => {
                const rows = [];
                const wheel = { yes: "可以進入", designated: "可以進入", limited: "部分可進入", no: "無法進入" }[selected.wheelchair];
                if (wheel) rows.push(["wheel", Accessibility, "輪椅", wheel]);
                if (selected.accessibleCount > 0) rows.push(["acc", Toilet, "無障礙廁座", `${selected.accessibleCount} 座`]);
                if (selected.exit) rows.push(["exit", DoorOpen, "出入口", selected.exit]);
                if (selected.slopePct != null) rows.push(["slope", TrendingUp, "坡度", `${selected.slopePct}%`]);
                if (selected.openingHours) rows.push(["hours", Clock, "開放時間", selected.openingHours]);
                if (selected.description) rows.push(["description", MapPin, "位置", selected.description]);
                if (selected.kind === "metro-exit" && typeof selected.officialAccessible === "boolean") rows.push(["official-accessible", Accessibility, "座標資料『是否為無障礙用』", selected.officialAccessible ? "是" : "否"]);
                if (selected.address) rows.push(["addr", MapPin, "地址", selected.address]);
                if (selected.parkingDetails) rows.push(["parking-details", Car, "車位", selected.parkingDetails]);
                if (selected.phone)
                  rows.push(["phone", Phone, "電話",
                    <a href={`tel:${String(selected.phone).replace(/[^\d+]/g, "")}`}>{selected.phone}</a>]);
                if (selected.careBed) rows.push(["bed", Info, "照護床", selected.careBed]);
                if (selected.mapGroupRoutes?.length || selected.routes?.length) rows.push(["bus", Bus, "路線", (selected.mapGroupRoutes?.length ? selected.mapGroupRoutes : selected.routes).join("、")]);
                if (selected.kind === "metro-exit") rows.push(["elevator", ArrowUpFromLine, "電梯", selected.elevator === true ? `有電梯${selected.elevatorUpdatedAt ? `（更新日期 ${selected.elevatorUpdatedAt}）` : ""}` : "電梯資訊待確認"]);
                return rows.length ? (
                  <dl className="place-info">
                    {rows.map(([key, RowIcon, label, value]) => (
                      <div key={key}>
                        <RowIcon size={18} aria-hidden="true" />
                        <dt>{label}</dt>
                        <dd>{value}</dd>
                      </div>
                    ))}
                  </dl>
                ) : null;
              })()}
              {String(selected.kind) === "20" && (
                <button className="place-link" onClick={async () => {
                  const station = selected;
                  setDataRequested(true);
                  const loaded = dataGate.current.peek() || await boot();
                  if (selectedRef.current?.id !== station.id) return;
                  if (!loaded) { announce("車站資訊暫時無法載入，請稍後再試。"); return; }
                  const match = matchMetroStations(station.name, loaded.metro, loaded.fac)[0];
                  if (!match) { announce("這個車站目前沒有電梯位置說明。"); return; }
                  setSelected({ id: `station-${match.name}-${match.record["路線別"]}`, name: stationLabel(match.name), kind: "station-detail", record: match.record, exits: match.exits });
                }}><TrainFront size={18} aria-hidden="true" /><span>車站資訊與出口</span><ChevronRight size={18} aria-hidden="true" /></button>
              )}
              {selected.station && (
                <button
                  className="place-link"
                  onClick={() => {
                    stopFollowing();
                    setStationQuery(selected.station);
                    setTab("stations");
                    setSelected(null);
                  }}
                >
                  <ArrowUpFromLine size={18} aria-hidden="true" />
                  <span>車站電梯資訊</span>
                  <ChevronRight size={18} aria-hidden="true" />
                </button>
              )}
              {selected.originKind!=='map' && <p className="place-source">
                {selected.sourceId === "osm"
                  ? "OpenStreetMap"
                  : data?.sources.sources.find((s) => s.id === selected.sourceId)?.name ||
                    "臺北市開放資料"}
              </p>}
            </>
          )}
        </Sheet>
      )}
      {modal === "prefs" && (
        <Sheet title="設定" onClose={() => { setConfirmClear(false); setModal(null); }}>
          <section className="settings-group" aria-labelledby="set-mobility">
            <h3 id="set-mobility">通行</h3>
            <div className="settings-list">
              <div className="settings-row"><span>出行方式</span><b>輪椅</b></div>
              <div className="settings-row"><span>通道寬度</span><b>0.9 公尺以上</b></div>
              <div className="settings-row settings-row--stack">
                <span id="set-mode">路線偏好</span>
                <div className="segmented" role="radiogroup" aria-labelledby="set-mode">
                  {Object.entries({ balanced: "均衡", crossings: "少過街" }).map(([id, name]) => (
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
            </div>
            <p className="quiet-note">規劃時避開階梯；必要時可能使用人車共道，請留意車輛與現場狀況。</p>
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
                <input type="checkbox" className="switch" checked={prefs.visualPrompts ?? false}
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
          <p>語音輸入只在按下麥克風後收音；辨識可能由瀏覽器的線上語音服務處理，本服務不儲存錄音。</p>
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
