import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./styles/globals.css";
import { useClock, useToast, useIntro } from "./hooks";
import Globe from "./components/map/Globe";
import IntroOverlay from "./components/map/IntroOverlay";
import TopBar from "./components/panels/TopBar";
import MissionSidebar from "./components/panels/MissionSidebar";
import BottomBar from "./components/panels/BottomBar";
import TacticalInsightPanel from "./components/panels/TacticalInsightPanel";
import HUDCorners from "./components/hud/HUDCorners";
import StatusBar from "./components/hud/StatusBar";
import Toast from "./components/hud/Toast";
import ClassificationHeader from "./components/hud/ClassificationHeader";
import CursorReticle from "./components/ui/CursorReticle";
import { SAT_TYPE_CONFIG, createSatTypeState } from "./constants/satelliteTypes";
import { SIM_WINDOW_HOURS, SIM_WINDOW_MS, progressToSimTimeMs } from "./utils/simulationClock";

const DeepAnalysisOverlay = lazy(() => import("./components/panels/DeepAnalysisOverlay"));
const OrbitalPass = lazy(() => import("./components/hud/OrbitalPass"));
const TelemetryOverlay = lazy(() => import("./components/hud/TelemetryOverlay"));

const EMPTY_DATASET_STATS = {
  totalTracked: 0,
  byType: {
    PAYLOAD: 0,
    "ROCKET BODY": 0,
    DEBRIS: 0,
    OTHER: 0,
  },
  debrisShare: 0,
  status: "loading",
  cached: false,
  cacheAgeSeconds: null,
  generatedAt: null,
  fetchWindowOpen: null,
  source: "unknown",
  error: null,
};

const EMPTY_ANALYSIS_OVERVIEW = {
  zones: [],
  alerts: [],
  simulatedAt: null,
  catalogCount: 0,
};

const WARNING_TOAST_DURATION_MS = 4800;
const ANALYSIS_SYNC_INTERVAL_MS = 350;
const ANALYSIS_API_RETRY_MS = 30000;
const OVERVIEW_SYNC_STEP_HOURS = 5 / 60;
const DEFAULT_SIM_SPEED = 0.5;

function toFiniteMinutes(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function deriveTimelineEventClass(event) {
  const explicitClass = event?.event_class ?? event?.eventClass ?? null;
  const minSeparationKm = Number(
    event?.min_separation_km
      ?? event?.minSeparationKm
      ?? event?.closest_distance_km
      ?? event?.closestDistanceKm
  );
  if (event?.is_confirmed_collision || event?.isConfirmedCollision || explicitClass === "collision") {
    return "collision";
  }
  if (explicitClass === "super_close_call" || explicitClass === "close_approach") {
    return explicitClass;
  }
  if (Number.isFinite(minSeparationKm)) {
    if (minSeparationKm <= 20) return "super_close_call";
    if (minSeparationKm <= 80) return "close_approach";
  }
  return null;
}

function timelineEventLabel(eventClass, fallbackLabel) {
  if (eventClass === "collision") return "COLLISION";
  if (eventClass === "super_close_call") return "SUPER CLOSE CALL";
  if (eventClass === "close_approach") return "CLOSE APPROACH";
  return fallbackLabel ?? null;
}

function normalizeTimelineEvent(event, fallback = {}, options = {}) {
  const explicitTimelineMinute = toFiniteMinutes(event?.timeline_minute ?? event?.timelineMinute);
  const relativeTcaMinutes = toFiniteMinutes(
    event?.sampled_tca_minutes
      ?? event?.sampledTcaMinutes
      ?? event?.event_time_minutes
      ?? event?.eventTimeMinutes
  );
  const explicitEventTimeMinutes = toFiniteMinutes(
    event?.event_time_minutes ?? event?.eventTimeMinutes
  );
  if (relativeTcaMinutes === null && explicitEventTimeMinutes === null) {
    return null;
  }

  const eventClass = deriveTimelineEventClass(event) ?? fallback.eventClass ?? null;
  if (!eventClass) {
    return null;
  }

  const riskBand = event?.risk_band ?? event?.pairRiskBand ?? fallback.riskBand ?? null;
  const absoluteOffsetMinutes = Number(options.absoluteOffsetMinutes ?? 0);
  const timelineMinute = explicitTimelineMinute
    ?? explicitEventTimeMinutes
    ?? (relativeTcaMinutes !== null ? absoluteOffsetMinutes + relativeTcaMinutes : null);
  if (timelineMinute === null || !Number.isFinite(timelineMinute)) {
    return null;
  }
  if (timelineMinute < 0 || timelineMinute > SIM_WINDOW_HOURS * 60) {
    return null;
  }

  return {
    target_norad_id: event?.target_norad_id ?? fallback.targetNoradId ?? null,
    target_name: event?.target_name ?? fallback.targetName ?? null,
    target_type: event?.target_type ?? fallback.targetType ?? null,
    candidate_norad_id: event?.candidate_norad_id ?? event?.noradId ?? fallback.candidateNoradId ?? null,
    candidate_name: event?.candidate_name ?? event?.objectName ?? fallback.candidateName ?? null,
    candidate_type: event?.candidate_type ?? event?.objectType ?? fallback.candidateType ?? null,
    sampled_tca_minutes: relativeTcaMinutes ?? explicitEventTimeMinutes,
    event_time_minutes: explicitEventTimeMinutes,
    timeline_minute: timelineMinute,
    risk_score: event?.risk_score ?? event?.pairRiskScore ?? fallback.riskScore ?? null,
    risk_band: riskBand,
    risk_color: event?.risk_color ?? event?.pairRiskColor ?? fallback.riskColor ?? null,
    event_class: eventClass,
    event_label: timelineEventLabel(
      eventClass,
      event?.event_label ?? event?.eventLabel ?? fallback.eventLabel ?? riskBand ?? null
    ),
    is_confirmed_collision: Boolean(
      event?.is_confirmed_collision ?? event?.isConfirmedCollision ?? (eventClass === "collision")
    ),
  };
}

function timelineEventKey(event) {
  const targetId = String(event?.target_norad_id ?? "");
  const candidateId = String(event?.candidate_norad_id ?? "");
  const eventClass = String(event?.event_class ?? "");
  const timelineMinute = Number(event?.timeline_minute ?? 0).toFixed(3);
  return `${targetId}:${candidateId}:${eventClass}:${timelineMinute}`;
}

function mergeTimelineEvents(events = []) {
  const merged = new Map();

  for (const event of events) {
    if (!event) continue;
    const key = timelineEventKey(event);
    if (!merged.has(key)) {
      merged.set(key, event);
      continue;
    }

    const existing = merged.get(key);
    const existingScore = Number(existing?.risk_score ?? 0);
    const nextScore = Number(event?.risk_score ?? 0);
    if (nextScore > existingScore) {
      merged.set(key, event);
    }
  }

  return [...merged.values()].sort((left, right) => left.timeline_minute - right.timeline_minute);
}

export default function App() {
  const { phase: introPhase } = useIntro();
  const recTime = useClock();
  const { message: toastMsg, phase: toastPhase, show: showToast } = useToast();
  const {
    message: warningToastMsg,
    phase: warningToastPhase,
    show: showWarningToast,
    clear: clearWarningToast,
  } = useToast(WARNING_TOAST_DURATION_MS);
  const [satTypes, setSatTypes] = useState(createSatTypeState);
  const [simRunning, setSimRunning] = useState(false);
  const [simSpeed, setSimSpeed] = useState(DEFAULT_SIM_SPEED);
  const [simActionPending, setSimActionPending] = useState(false);
  const [cursorPing, setCursorPing] = useState(null);
  const [selectedTarget, setSelectedTarget] = useState(null);
  const [analysisSnapshot, setAnalysisSnapshot] = useState(null);
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [comparedNoradId, setComparedNoradId] = useState(null);
  const [activeAlert, setActiveAlert] = useState(null);
  const [previewAlert, setPreviewAlert] = useState(null);
  const [activeScenario, setActiveScenario] = useState(null);
  const [selectionTimelineSeeds, setSelectionTimelineSeeds] = useState([]);
  const [datasetStats, setDatasetStats] = useState(EMPTY_DATASET_STATS);
  const [analysisOverview, setAnalysisOverview] = useState(EMPTY_ANALYSIS_OVERVIEW);
  const [selectionClearSignal, setSelectionClearSignal] = useState(0);
  const [focusNoradId, setFocusNoradId] = useState(null);
  const [focusMode, setFocusMode] = useState(false);
  const [refreshSignal, setRefreshSignal] = useState(0);
  const [simOffsetHours, setSimOffsetHours] = useState(0);
  const [layerVisibility, setLayerVisibility] = useState({
    uncertaintyZones: false,
  });
  const previousTargetIdRef = useRef(null);
  const cursorPingIdRef = useRef(0);
  const collisionStopRef = useRef(null);
  const pendingTargetNoradIdRef = useRef(null);
  const analysisApiCooldownUntilRef = useRef(0);
  const analysisApiToastShownRef = useRef(false);
  const selectionTimelineBaseMinutesRef = useRef(0);
  const simProgressRef = useRef(0);
  const simBaseTimeRef = useRef(Date.now());
  const simTimeRef = useRef(simBaseTimeRef.current);
  const analysisSyncRef = useRef({
    lastWallTimeMs: 0,
    lastHours: 0,
  });
  const overviewSimHours = useMemo(
    () => Number((Math.round(simOffsetHours / OVERVIEW_SYNC_STEP_HOURS) * OVERVIEW_SYNC_STEP_HOURS).toFixed(4)),
    [simOffsetHours]
  );


  const emitCursorPing = useCallback(({ x, y, force = false }) => {
    if (typeof window === "undefined") return;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;

    const width = window.innerWidth;
    const height = window.innerHeight;
    if (!force) {
      const centerX = width * 0.5;
      const centerY = height * 0.56;
      const radius = Math.min(width, height) * 0.32;
      const distance = Math.hypot(x - centerX, y - centerY);
      if (distance > radius) return;
    }

    cursorPingIdRef.current += 1;
    setCursorPing({ x, y, id: cursorPingIdRef.current });
  }, []);

  const handleSatTypeToggle = useCallback((typeId) => {
    setSatTypes((prev) => ({ ...prev, [typeId]: !prev[typeId] }));
  }, []);

  const handleLayerToggle = useCallback((layerId) => {
    setLayerVisibility((prev) => ({ ...prev, [layerId]: !prev[layerId] }));
  }, []);

  const handleSimStart = useCallback(() => {
    setSimRunning((prev) => {
      if (prev) return prev;
      clearWarningToast();
      showToast("SIMULATION RUNNING // LIVE PLAYBACK");
      return true;
    });
  }, [clearWarningToast, showToast]);

  const handleSimPause = useCallback(() => {
    setSimRunning((prev) => {
      if (!prev) return prev;
      const pausedProgress = simProgressRef.current;
      const pausedHours = Number(((pausedProgress * SIM_WINDOW_MS) / (60 * 60 * 1000)).toFixed(4));
      simTimeRef.current = progressToSimTimeMs(simBaseTimeRef.current, pausedProgress);
      analysisSyncRef.current = {
        lastWallTimeMs: 0,
        lastHours: pausedHours,
      };
      setSimOffsetHours(pausedHours);
      showToast("SIMULATION PAUSED");
      return false;
    });
  }, [showToast]);

  const handleSimComplete = useCallback(() => {
    setSimRunning((prev) => {
      if (!prev) return prev;
      showToast("SIMULATION COMPLETE // END OF WINDOW");
      return false;
    });
  }, [showToast]);

  const handleSimSpeedChange = useCallback((nextSpeed, speedLabel = `${nextSpeed}x`) => {
    setSimSpeed((prev) => {
      if (prev === nextSpeed) return prev;
      showToast(`SIMULATION SPEED ${speedLabel.toUpperCase()}`);
      return nextSpeed;
    });
  }, [showToast]);

  const handleSimProgressChange = useCallback((nextProgress, options = {}) => {
    simProgressRef.current = nextProgress;
    const nextSimTimeMs = progressToSimTimeMs(simBaseTimeRef.current, nextProgress);
    simTimeRef.current = nextSimTimeMs;

    const nextHours = Number(((nextSimTimeMs - simBaseTimeRef.current) / (60 * 60 * 1000)).toFixed(4));
    const wallTimeMs =
      typeof options.wallTimeMs === "number"
        ? options.wallTimeMs
        : typeof performance !== "undefined"
          ? performance.now()
          : Date.now();
    const shouldSync =
      options.forceSync ||
      nextProgress === 0 ||
      nextProgress === 1 ||
      wallTimeMs - analysisSyncRef.current.lastWallTimeMs >= ANALYSIS_SYNC_INTERVAL_MS;

    if (!shouldSync) return;

    analysisSyncRef.current = {
      lastWallTimeMs: wallTimeMs,
      lastHours: nextHours,
    };
    setSimOffsetHours((current) => (current === nextHours ? current : nextHours));
  }, []);

  const handleSimTriggerCollision = useCallback(async () => {
    if (simActionPending) return;
    setSimActionPending(true);
    const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || "/api").replace(/\/$/, "");

    if (datasetStats.source === "scenario" || activeScenario?.kind === "collision") {
      showToast("SIMULATION EVENT // CLEARING SYNTHETIC RISK FIELD");
      try {
        const res = await fetch(`${apiBaseUrl}/scenario/reset`, { method: "POST" });
        if (res.ok) {
          setActiveScenario(null);
          setActiveAlert(null);
          setPreviewAlert(null);
          setComparedNoradId(null);
          setSelectionTimelineSeeds([]);
          setFocusNoradId(null);
          setRefreshSignal((s) => s + 1);
          showToast("SIMULATION EVENT // SYNTHETIC RISK FIELD REMOVED");
        } else {
          const result = await res.json().catch(() => ({}));
          showToast(`SIMULATION EVENT // ${result.detail || "RISK FIELD CLEAR FAILED"}`);
        }
      } catch {
        showToast("SIMULATION EVENT // RISK FIELD CLEAR FAILED");
      } finally {
        setSimActionPending(false);
      }
      return;
    }

    showToast("SIMULATION EVENT // INJECTING RISK FIELD");
    try {
      const res = await fetch(`${apiBaseUrl}/scenario/trigger-collision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          anchor_norad_id: selectedTarget?.details?.NORAD_CAT_ID ?? null,
        }),
      });
      if (res.ok) {
        const result = await res.json().catch(() => ({}));
        setActiveAlert(null);
        setPreviewAlert(null);
        setActiveScenario({
          kind: "collision",
          title: "Injected Risk Field",
          collisionStarted: false,
          focusNoradId: result.focus_norad_id ?? null,
          compareNoradId: result.compare_norad_id ?? null,
          anchorName: result.anchor_name ?? null,
          compareName: result.threat_name ?? null,
          pairPreview: result.pair_preview ?? null,
          events: Array.isArray(result.scenario_events) ? result.scenario_events : [],
          fragmentIds: Array.isArray(result.fragment_ids) ? result.fragment_ids : [],
          injectedCount: result.injected_count ?? 0,
        });
        setComparedNoradId(null);
        setFocusNoradId(null);
        setRefreshSignal(s => s + 1);
        showToast(
          result.threat_name && result.anchor_name
            ? `SIMULATION EVENT // ${result.injected_count ?? 0} SYNTHETIC RISKS INJECTED`
            : "SIMULATION EVENT // RISK FIELD INJECTED"
        );
      } else {
        const result = await res.json().catch(() => ({}));
        showToast(`SIMULATION EVENT // ${result.detail || "COLLISION INJECTION FAILED"}`);
      }
    } catch {
      showToast("SIMULATION EVENT // COLLISION INJECTION FAILED");
    } finally {
      setSimActionPending(false);
    }
  }, [activeScenario?.kind, datasetStats.source, selectedTarget, showToast, simActionPending]);

  const handleStartCollisionSimulation = useCallback(() => {
    setActiveScenario((current) => {
      if (!current || current.kind !== "collision" || current.collisionStarted) {
        return current;
      }
      showToast(
        current.anchorName && current.compareName
          ? `COLLISION SIM // ${current.anchorName} VS ${current.compareName}`
          : "COLLISION SIM // IMPACT PLAYBACK ACTIVE"
      );
      return {
        ...current,
        collisionStarted: true,
        collisionStartedAt: Date.now(),
      };
    });
  }, [showToast]);

  const handleSimReset = useCallback(async () => {
    if (simActionPending) return;
    setSimActionPending(true);
    pendingTargetNoradIdRef.current = null;
    selectionTimelineBaseMinutesRef.current = 0;
    setSimRunning(false);
    setSimSpeed(DEFAULT_SIM_SPEED);
    setSimOffsetHours(0);
    setFocusMode(false);
    collisionStopRef.current = null;
    simProgressRef.current = 0;
    simBaseTimeRef.current = Date.now();
    simTimeRef.current = simBaseTimeRef.current;
    analysisSyncRef.current = {
      lastWallTimeMs: 0,
      lastHours: 0,
    };
    showToast("SIMULATION RESET // PURGING REDIS SCENARIO STATE...");

    try {
      const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || "/api").replace(/\/$/, "");
      const res = await fetch(`${apiBaseUrl}/scenario/reset`, { method: "POST" });
      if (res.ok) {
        setActiveScenario(null);
        setActiveAlert(null);
        setPreviewAlert(null);
        setSelectionTimelineSeeds([]);
        setComparedNoradId(null);
        setRefreshSignal(s => s + 1);
        showToast("SIMULATION RESET // SYSTEM RE-BASELINE TO CURRENT SPACE-TRACK EPOCH");
      } else {
        const result = await res.json().catch(() => ({}));
        showToast(`SIMULATION RESET // ${result.detail || "FAILED"}`);
      }
    } catch {
      showToast("SIMULATION RESET // FAILED TO REACH SERVER");
    } finally {
      setSimActionPending(false);
    }
  }, [showToast, simActionPending]);

  const handleReturnToLanding = useCallback(async () => {
    if (!simActionPending) {
      await handleSimReset();
    }
    window.location.assign("/");
  }, [handleSimReset, simActionPending]);

  const handlePointerDown = useCallback((event) => {
    if (event.button !== undefined && event.button !== 0) return;
    emitCursorPing({ x: event.clientX, y: event.clientY });
  }, [emitCursorPing]);

  const handleTargetChange = useCallback((snapshot) => {
    if (!snapshot) {
      pendingTargetNoradIdRef.current = null;
      selectionTimelineBaseMinutesRef.current = 0;
      setSelectedTarget(null);
      setAnalysisSnapshot(null);
      setAnalysisOpen(false);
      setFocusMode(false);
      setPreviewAlert(null);
      setSelectionTimelineSeeds([]);
      previousTargetIdRef.current = null;
      return;
    }

    const nextTarget = snapshot.target;
    const nextTargetId = nextTarget?.details?.NORAD_CAT_ID ?? null;
    const pendingTargetNoradId = pendingTargetNoradIdRef.current;
    const isNewTarget =
      nextTargetId !== null &&
      nextTargetId !== undefined &&
      String(previousTargetIdRef.current ?? "") !== String(nextTargetId);

    if (
      pendingTargetNoradId !== null &&
      pendingTargetNoradId !== undefined &&
      nextTargetId !== null &&
      nextTargetId !== undefined &&
      String(nextTargetId) !== String(pendingTargetNoradId)
    ) {
      return;
    }

    if (
      pendingTargetNoradId !== null &&
      pendingTargetNoradId !== undefined &&
      nextTargetId !== null &&
      nextTargetId !== undefined &&
      String(nextTargetId) === String(pendingTargetNoradId)
    ) {
      pendingTargetNoradIdRef.current = null;
    }

    if (isNewTarget) {
      const absoluteOffsetMinutes = simOffsetHours * 60;
      selectionTimelineBaseMinutesRef.current = absoluteOffsetMinutes;
      setSelectionTimelineSeeds(
        mergeTimelineEvents(
          (analysisOverview.alerts || [])
            .filter((alert) => String(alert?.target_norad_id ?? "") === String(nextTargetId))
            .map((alert) => normalizeTimelineEvent(alert, {}, { absoluteOffsetMinutes }))
            .filter(Boolean)
        )
      );
    }

    if (nextTargetId && previousTargetIdRef.current !== nextTargetId) {
      showToast(`TARGET LOCK // ${nextTarget.details.OBJECT_NAME}`);
    }

    previousTargetIdRef.current = nextTargetId;
    if (activeAlert && nextTargetId && nextTargetId !== activeAlert.target_norad_id) {
      setActiveAlert(null);
      setComparedNoradId(null);
    }
    if (previewAlert && nextTargetId && nextTargetId !== previewAlert.target_norad_id) {
      setPreviewAlert(null);
    }
    setSelectedTarget(nextTarget);
    setAnalysisSnapshot(snapshot.analysis ?? null);
  }, [activeAlert, analysisOverview.alerts, previewAlert, showToast, simOffsetHours]);

  const handleOpenAnalysis = useCallback(() => {
    if (!selectedTarget || !analysisSnapshot) return;
    setAnalysisOpen(true);
    showToast("DEEP ANALYSIS // TARGET BRIEF OPEN");
  }, [analysisSnapshot, selectedTarget, showToast]);

  const handleCloseAnalysis = useCallback(() => {
    setAnalysisOpen(false);
  }, []);

  const handleClearTarget = useCallback(() => {
    pendingTargetNoradIdRef.current = null;
    selectionTimelineBaseMinutesRef.current = 0;
    setSelectedTarget(null);
    setAnalysisSnapshot(null);
    setAnalysisOpen(false);
    setComparedNoradId(null);
    setActiveAlert(null);
    setPreviewAlert(null);
    setActiveScenario(null);
    setSelectionTimelineSeeds([]);
    setFocusMode(false);
    previousTargetIdRef.current = null;
    setSelectionClearSignal((current) => current + 1);
    setFocusNoradId(null);
  }, []);

  const handleDatasetStatsChange = useCallback((nextStats) => {
    setDatasetStats(nextStats);
  }, []);

  const handleCompareObject = useCallback((noradId) => {
    const nearbyObject = analysisSnapshot?.nearbyObjects?.find((item) => item.noradId === noradId);
    setActiveAlert(null);
    setPreviewAlert(null);
    setComparedNoradId((current) => {
      const nextValue = current === noradId ? null : noradId;
      if (nearbyObject) {
        showToast(
          nextValue
            ? `COMPARE LOCK // ${nearbyObject.objectName}`
            : `COMPARE CLEAR // ${nearbyObject.objectName}`
        );
      }
      return nextValue;
    });
  }, [analysisSnapshot, showToast]);

  useEffect(() => {
    const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || "/api").replace(/\/$/, "");
    const controller = new AbortController();
    if (Date.now() < analysisApiCooldownUntilRef.current) {
      return () => controller.abort();
    }

    const fetchOverview = async () => {
      try {
        const res = await fetch(
          `${apiBaseUrl}/analysis/overview?sim_hours=${overviewSimHours}`,
          { signal: controller.signal }
        );
        if (!res.ok) return;
        const result = await res.json();
        if (controller.signal.aborted) return;
        analysisApiCooldownUntilRef.current = 0;
        analysisApiToastShownRef.current = false;
        const overview = result?.data || {};
        setAnalysisOverview({
          zones: Array.isArray(overview.zones) ? overview.zones : [],
          alerts: Array.isArray(overview.alerts) ? overview.alerts : [],
          simulatedAt: overview.simulated_at || null,
          catalogCount: overview.catalog_count || 0,
        });
      } catch {
        if (!controller.signal.aborted) {
          analysisApiCooldownUntilRef.current = Date.now() + ANALYSIS_API_RETRY_MS;
          setAnalysisOverview(EMPTY_ANALYSIS_OVERVIEW);
        }
      }
    };

    fetchOverview();
    return () => controller.abort();
  }, [datasetStats.generatedAt, overviewSimHours, refreshSignal]);

  useEffect(() => {
    if (!selectedTarget) return;

    const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || "/api").replace(/\/$/, "");
    const controller = new AbortController();
    if (Date.now() < analysisApiCooldownUntilRef.current) {
      return () => controller.abort();
    }

    const fetchTargetAnalysis = async () => {
      try {
        const res = await fetch(
          `${apiBaseUrl}/analysis/target/${selectedTarget.details.NORAD_CAT_ID}`,
          { signal: controller.signal }
        );
        if (!res.ok) return;
        const result = await res.json();
        const data = result?.data;
        if (!data || controller.signal.aborted) return;
        analysisApiCooldownUntilRef.current = 0;
        analysisApiToastShownRef.current = false;
        setAnalysisSnapshot((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            shellPopulation: data.shellPopulation ?? prev.shellPopulation,
            shellDebrisCount: data.shellDebrisCount ?? prev.shellDebrisCount,
            shellDebrisRatio: data.shellDebrisRatio ?? prev.shellDebrisRatio,
            densityBand: data.densityBand ?? prev.densityBand,
            uncertaintyScore: data.uncertaintyScore ?? prev.uncertaintyScore,
            uncertaintyComponents: data.uncertaintyComponents ?? prev.uncertaintyComponents,
            uncertaintySource: data.uncertaintySource ?? prev.uncertaintySource,
            mitigations: Array.isArray(data.mitigations) ? data.mitigations : prev.mitigations,
          };
        });
      } catch {
        if (!controller.signal.aborted) {
          analysisApiCooldownUntilRef.current = Date.now() + ANALYSIS_API_RETRY_MS;
          if (!analysisApiToastShownRef.current) {
            analysisApiToastShownRef.current = true;
            showToast("TARGET ANALYSIS // BACKEND SCREENING UNAVAILABLE");
          }
        }
      }
    };

    fetchTargetAnalysis();
    return () => controller.abort();
  }, [refreshSignal, selectedTarget, showToast]);

  useEffect(() => {
    if (!selectedTarget || !analysisSnapshot) {
      if (activeAlert?.candidate_norad_id) {
        setComparedNoradId(activeAlert.candidate_norad_id);
      } else {
        setComparedNoradId(null);
      }
      return;
    }

    setComparedNoradId((current) => {
      if (!current) return null;
      if (
        activeAlert &&
        activeAlert.target_norad_id === selectedTarget.details.NORAD_CAT_ID &&
        activeAlert.candidate_norad_id === current
      ) {
        return current;
      }
      const stillVisible = analysisSnapshot.nearbyObjects?.some(
        (item) => item.noradId === current
      );
      return stillVisible ? current : null;
    });
  }, [selectedTarget, analysisSnapshot, activeAlert]);

  useEffect(() => {
    const preventBrowserWheelZoom = (event) => {
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
      }
    };

    const preventBrowserKeyZoom = (event) => {
      const isZoomKey = ["+", "-", "=", "0"].includes(event.key);
      if ((event.ctrlKey || event.metaKey) && isZoomKey) {
        event.preventDefault();
      }
    };

    window.addEventListener("wheel", preventBrowserWheelZoom, { passive: false });
    window.addEventListener("keydown", preventBrowserKeyZoom);

    return () => {
      window.removeEventListener("wheel", preventBrowserWheelZoom);
      window.removeEventListener("keydown", preventBrowserKeyZoom);
    };
  }, []);

  const activePair = useMemo(() => {
    if (activeAlert) {
      return activeAlert;
    }

    if (!selectedTarget || !analysisSnapshot || !comparedNoradId) {
      return null;
    }

    const comparedObject = analysisSnapshot.nearbyObjects?.find(
      (item) => item.noradId === comparedNoradId
    );
    if (!comparedObject) return null;

    return {
      target_norad_id: selectedTarget.details.NORAD_CAT_ID,
      target_name: selectedTarget.details.OBJECT_NAME,
      target_type: selectedTarget.type,
      candidate_norad_id: comparedObject.noradId,
      candidate_name: comparedObject.objectName,
      candidate_type: comparedObject.objectType,
      current_separation_km: comparedObject.currentSeparationKm,
      min_separation_km: comparedObject.minSeparationKm,
      sampled_tca_minutes: comparedObject.sampledTcaMinutes,
      risk_score: comparedObject.pairRiskScore,
      risk_band: comparedObject.pairRiskBand,
      risk_color: comparedObject.pairRiskColor,
      event_class: comparedObject.eventClass,
      event_label: comparedObject.eventLabel,
      is_confirmed_collision: comparedObject.isConfirmedCollision,
    };
  }, [activeAlert, analysisSnapshot, comparedNoradId, selectedTarget]);

  const activeTimelineEvents = useMemo(() => {
    if (!selectedTarget) {
      return [];
    }

    const selectedTimelineEvents = Array.isArray(analysisSnapshot?.timelineEvents)
      ? analysisSnapshot.timelineEvents
        .map((event) => normalizeTimelineEvent(event))
        .filter(Boolean)
      : [];
    const mergedSelectedTimelineEvents = mergeTimelineEvents([
      ...selectedTimelineEvents,
      ...selectionTimelineSeeds,
    ]);

    if (activeAlert && selectedTarget && mergedSelectedTimelineEvents.length > 0) {
      const pairEvent = mergedSelectedTimelineEvents.find(
        (event) =>
          String(event.target_norad_id) === String(activeAlert.target_norad_id) &&
          String(event.candidate_norad_id) === String(activeAlert.candidate_norad_id)
      );
      if (pairEvent) {
        return [pairEvent];
      }
    }

    if (selectedTarget && mergedSelectedTimelineEvents.length > 0) {
      return mergedSelectedTimelineEvents;
    }

    if (activeAlert && activePair) {
      const pairEvent = normalizeTimelineEvent(activePair, {}, {
        absoluteOffsetMinutes: selectionTimelineBaseMinutesRef.current,
      });
      return pairEvent ? [pairEvent] : [];
    }

    if (activePair) {
      const pairEvent = normalizeTimelineEvent(activePair, {}, {
        absoluteOffsetMinutes: selectionTimelineBaseMinutesRef.current,
      });
      return pairEvent ? [pairEvent] : [];
    }

    return [];
  }, [activeAlert, activePair, analysisSnapshot, selectedTarget, selectionTimelineSeeds]);

  const activePairTimelineEvent = useMemo(() => {
    if (!activePair) return null;

    const matchedEvent = activeTimelineEvents.find(
      (event) =>
        String(event?.target_norad_id ?? "") === String(activePair.target_norad_id ?? "") &&
        String(event?.candidate_norad_id ?? "") === String(activePair.candidate_norad_id ?? "")
    );
    if (matchedEvent) {
      return matchedEvent;
    }

    return normalizeTimelineEvent(activePair, {}, {
      absoluteOffsetMinutes: selectionTimelineBaseMinutesRef.current,
    });
  }, [activePair, activeTimelineEvents]);

  useEffect(() => {
    const collisionEvent = activeTimelineEvents.find((event) => event?.is_confirmed_collision) ?? null;
    const collisionMinute = Number(
      collisionEvent?.timeline_minute
        ?? collisionEvent?.event_time_minutes
        ?? collisionEvent?.sampled_tca_minutes
    );
    if (!simRunning || !collisionEvent || !Number.isFinite(collisionMinute)) {
      collisionStopRef.current = null;
      return;
    }

    const collisionHour = collisionMinute / 60;
    if (!Number.isFinite(collisionHour)) return;

    const stopKey = `${collisionEvent.target_norad_id}-${collisionEvent.candidate_norad_id}-${collisionMinute}`;
    if (simOffsetHours < collisionHour || collisionStopRef.current === stopKey) {
      return;
    }

    collisionStopRef.current = stopKey;
    setSimRunning(false);
    showToast("COLLISION DETECTED // PLAYBACK HALTED");
  }, [activeTimelineEvents, simOffsetHours, simRunning, showToast]);

  const focusModePair = useMemo(() => {
    const targetNoradId = selectedTarget?.details?.NORAD_CAT_ID ?? null;
    if (!targetNoradId) return null;

    if (
      activeAlert?.target_norad_id &&
      String(activeAlert.target_norad_id) === String(targetNoradId)
    ) {
      return {
        targetNoradId,
        candidateNoradId: activeAlert.candidate_norad_id ?? null,
      };
    }

    return {
      targetNoradId,
      candidateNoradId: null,
    };
  }, [activeAlert, selectedTarget]);

  const focusModeObjectIds = useMemo(() => {
    const ids = [];

    if (focusModePair?.targetNoradId !== null && focusModePair?.targetNoradId !== undefined) {
      ids.push(focusModePair.targetNoradId);
    }
    if (
      focusModePair?.candidateNoradId !== null &&
      focusModePair?.candidateNoradId !== undefined
    ) {
      ids.push(focusModePair.candidateNoradId);
    }

    return ids;
  }, [focusModePair]);

  const focusModeAvailable = Boolean(selectedTarget);
  const focusCounterpartNoradId = focusMode ? focusModePair?.candidateNoradId ?? null : null;

  const handleToggleFocusMode = useCallback(() => {
    if (!selectedTarget) {
      showToast("FOCUS MODE // SELECT OBJECT FIRST");
      return;
    }

    setFocusMode((current) => {
      const next = !current;
      showToast(
        next
          ? focusModePair?.candidateNoradId != null
            ? "FOCUS MODE // ALERT PAIR"
            : "FOCUS MODE // SINGLE TARGET"
          : "FOCUS MODE // FULL CATALOG"
      );
      return next;
    });
  }, [focusModePair, selectedTarget, showToast]);

  useEffect(() => {
    if (focusMode && !focusModeAvailable) {
      setFocusMode(false);
    }
  }, [focusMode, focusModeAvailable]);

  const activeSatTypes = SAT_TYPE_CONFIG
    .map((config) => config.id)
    .filter((type) => satTypes[type]);
  const riskInjected = datasetStats.source === "scenario" || activeScenario?.kind === "collision";
  const simDisplayTimestamp = useMemo(
    () => new Date(simBaseTimeRef.current + simOffsetHours * 3600 * 1000).toISOString(),
    [simOffsetHours]
  );

  return (
    <div
      style={{
        position: "relative",
        width: "100vw",
        height: "100vh",
        overflow: "hidden",
        background: "#0b0f14",
      }}
      className="scanlines vignette"
      onPointerDownCapture={handlePointerDown}
    >
      <div className="grain" />

      <Globe
        satTypes={activeSatTypes}
        onSelectionPing={emitCursorPing}
        onTargetChange={handleTargetChange}
        onDatasetStatsChange={handleDatasetStatsChange}
        selectionClearSignal={selectionClearSignal}
        focusNoradId={focusNoradId}
        refreshSignal={refreshSignal}
        simOffsetHours={simOffsetHours}
        simProgressRef={simProgressRef}
        simTimeRef={simTimeRef}
        simBaseTimeMs={simBaseTimeRef.current}
        comparedNoradId={comparedNoradId}
        focusCounterpartNoradId={focusCounterpartNoradId}
        focusMode={focusMode}
        focusObjectIds={focusModeObjectIds}
        activePair={activePair}
        scenarioState={activeScenario}
        uncertaintyZones={layerVisibility.uncertaintyZones ? analysisOverview.zones : []}
        showOrbitalPaths
      />

      <div
        className="satellite-mask"
        style={{ animation: "fadeInMask 0.7s ease-in-out forwards" }}
      />

      <IntroOverlay phase={introPhase} />
      <HUDCorners />

      <TopBar
        recTime={recTime}
        datasetStats={datasetStats}
        selectedTarget={selectedTarget}
        analysisSnapshot={analysisSnapshot}
        activePair={activePair}
        activeScenario={activeScenario}
        simOffsetHours={simOffsetHours}
      />

      <MissionSidebar
        satTypes={satTypes}
        onToggleSatType={handleSatTypeToggle}
        satTypeConfig={SAT_TYPE_CONFIG}
        datasetStats={datasetStats}
        layerVisibility={layerVisibility}
        onToggleLayer={handleLayerToggle}
        alerts={analysisOverview.alerts}
        activeAlertKey={
          activeAlert
            ? `${activeAlert.target_norad_id}-${activeAlert.candidate_norad_id}`
            : null
        }
        previewAlertKey={
          previewAlert
            ? `${previewAlert.target_norad_id}-${previewAlert.candidate_norad_id}`
            : null
        }
        onSelectAlert={(alert) => {
          const alertKey = `${alert.target_norad_id}-${alert.candidate_norad_id}`;
          const previewKey = previewAlert
            ? `${previewAlert.target_norad_id}-${previewAlert.candidate_norad_id}`
            : null;
          const activeKey = activeAlert
            ? `${activeAlert.target_norad_id}-${activeAlert.candidate_norad_id}`
            : null;

          setSatTypes((prev) => {
            const next = { ...prev };
            const targetType = alert?.target_type;
            const candidateType = alert?.candidate_type;
            if (targetType && Object.prototype.hasOwnProperty.call(next, targetType)) {
              next[targetType] = true;
            }
            if (candidateType && Object.prototype.hasOwnProperty.call(next, candidateType)) {
              next[candidateType] = true;
            }
            return next;
          });

          const absoluteOffsetMinutes = simOffsetHours * 60;
          selectionTimelineBaseMinutesRef.current = absoluteOffsetMinutes;
          const alertTimelineEvent = normalizeTimelineEvent(alert, {}, { absoluteOffsetMinutes });
          if (alertTimelineEvent) {
            setSelectionTimelineSeeds((current) =>
              mergeTimelineEvents([...current, alertTimelineEvent])
            );
          }

          pendingTargetNoradIdRef.current =
            String(selectedTarget?.details?.NORAD_CAT_ID ?? "") === String(alert.target_norad_id)
              ? null
              : alert.target_norad_id;
          setFocusNoradId(alert.target_norad_id);

          if (previewKey === alertKey && activeKey !== alertKey) {
            setPreviewAlert(alert);
            setActiveAlert(alert);
            setComparedNoradId(alert.candidate_norad_id);
            showToast(`ALERT SCENARIO // ${alert.target_name} VS ${alert.candidate_name}`);
            return;
          }

          setPreviewAlert(alert);
          setActiveAlert(activeKey === alertKey ? alert : null);
          setComparedNoradId(activeKey === alertKey ? alert.candidate_norad_id : null);
          showToast(
            activeKey === alertKey
              ? `ALERT SCENARIO // ${alert.target_name} VS ${alert.candidate_name}`
              : `ALERT TARGET // ${alert.target_name}`
          );
        }}
      />

      <TacticalInsightPanel
        target={selectedTarget}
        analysis={analysisSnapshot}
        activePair={activePair}
        activePairTimelineEvent={activePairTimelineEvent}
        comparedNoradId={comparedNoradId}
        simRunning={simRunning}
        onCompareObject={handleCompareObject}
        onOpenAnalysis={handleOpenAnalysis}
        onClearTarget={handleClearTarget}
        onShowWarning={showWarningToast}
        onClearWarning={clearWarningToast}
      />

      <Suspense fallback={null}>
        <DeepAnalysisOverlay
          target={selectedTarget}
          analysis={analysisSnapshot}
          activePair={activePair}
          activePairTimelineEvent={activePairTimelineEvent}
          isOpen={analysisOpen}
          onClose={handleCloseAnalysis}
          simTimestamp={simDisplayTimestamp}
        />
      </Suspense>

      <BottomBar
        simRunning={simRunning}
        simSpeed={simSpeed}
        onSimStart={handleSimStart}
        onSimPause={handleSimPause}
        onSimComplete={handleSimComplete}
        onSimSpeedChange={handleSimSpeedChange}
        onSimTriggerCollision={handleSimTriggerCollision}
        onStartCollisionSimulation={handleStartCollisionSimulation}
        onSimReset={handleSimReset}
        onOpenAnalysis={handleOpenAnalysis}
        analysisAvailable={Boolean(selectedTarget && analysisSnapshot)}
        simActionPending={simActionPending}
        simProgressRef={simProgressRef}
        onSimProgressChange={handleSimProgressChange}
        focusMode={focusMode}
        focusModeAvailable={focusModeAvailable}
        onToggleFocusMode={handleToggleFocusMode}
        activeScenario={activeScenario}
        timelineEvents={activeTimelineEvents}
        riskInjected={riskInjected}
      />

      <button
        type="button"
        onClick={handleReturnToLanding}
        disabled={simActionPending}
        style={{
          position: "fixed",
          left: "max(20px, calc((100vw - 760px) / 4 - 90px))",
          bottom: 56,
          zIndex: 31,
          minWidth: 156,
          padding: "10px 14px",
          borderRadius: 10,
          border: "1px solid rgba(255,120,120,0.34)",
          background: "linear-gradient(180deg, rgba(20,13,13,0.82), rgba(12,8,8,0.84))",
          color: "rgba(255,146,146,0.92)",
          boxShadow: "0 8px 24px rgba(0,0,0,0.36)",
          fontFamily: "'DM Mono', monospace",
          fontSize: "0.58rem",
          letterSpacing: "0.18em",
          textAlign: "center",
          textTransform: "uppercase",
          cursor: simActionPending ? "not-allowed" : "pointer",
          opacity: simActionPending ? 0.6 : 1,
        }}
      >
        {simActionPending ? "Exiting" : "Stand Down"}
      </button>

      <Toast message={toastMsg} phase={toastPhase} />
      <Toast message={warningToastMsg} phase={warningToastPhase} variant="warning" top={112} />

      <ClassificationHeader />
      <Suspense fallback={null}>
        <OrbitalPass recTime={recTime} analysis={analysisSnapshot} simTimestamp={simDisplayTimestamp} />
      </Suspense>
      <Suspense fallback={null}>
        <TelemetryOverlay
          analysis={analysisSnapshot}
          datasetStats={datasetStats}
          activePair={activePair}
          activePairTimelineEvent={activePairTimelineEvent}
          activeScenario={activeScenario}
        />
      </Suspense>

      <StatusBar
        recTime={recTime}
        datasetStats={datasetStats}
        selectedTarget={selectedTarget}
        alertCount={analysisOverview.alerts.length}
      />

      <CursorReticle ping={cursorPing} />
    </div>
  );
}
