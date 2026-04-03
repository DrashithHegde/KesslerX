import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./styles/globals.css";
import { useClock, useToast, useIntro } from "./hooks";
import Globe from "./components/map/Globe";
import IntroOverlay from "./components/map/IntroOverlay";
import TopBar from "./components/panels/TopBar";
import MissionSidebar from "./components/panels/MissionSidebar";
import DeepAnalysisOverlay from "./components/panels/DeepAnalysisOverlay";
import BottomBar from "./components/panels/BottomBar";
import TacticalInsightPanel from "./components/panels/TacticalInsightPanel";
import HUDCorners from "./components/hud/HUDCorners";
import StatusBar from "./components/hud/StatusBar";
import Toast from "./components/hud/Toast";
import ClassificationHeader from "./components/hud/ClassificationHeader";
import OrbitalPass from "./components/hud/OrbitalPass";
import TelemetryOverlay from "./components/hud/TelemetryOverlay";
import CursorReticle from "./components/ui/CursorReticle";
import { SAT_TYPE_CONFIG, createSatTypeState } from "./constants/satelliteTypes";

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

export default function App() {
  const { phase: introPhase } = useIntro();
  const recTime = useClock();
  const { message: toastMsg, phase: toastPhase, show: showToast } = useToast();
  const [satTypes, setSatTypes] = useState(createSatTypeState);
  const [simRunning, setSimRunning] = useState(false);
  const [simSpeed, setSimSpeed] = useState(1);
  const [simActionPending, setSimActionPending] = useState(false);
  const [cursorPing, setCursorPing] = useState(null);
  const [selectedTarget, setSelectedTarget] = useState(null);
  const [analysisSnapshot, setAnalysisSnapshot] = useState(null);
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [comparedNoradId, setComparedNoradId] = useState(null);
  const [activeAlert, setActiveAlert] = useState(null);
  const [activeScenario, setActiveScenario] = useState(null);
  const [datasetStats, setDatasetStats] = useState(EMPTY_DATASET_STATS);
  const [analysisOverview, setAnalysisOverview] = useState(EMPTY_ANALYSIS_OVERVIEW);
  const [selectionClearSignal, setSelectionClearSignal] = useState(0);
  const [focusNoradId, setFocusNoradId] = useState(null);
  const [refreshSignal, setRefreshSignal] = useState(0);
  const [simOffsetHours, setSimOffsetHours] = useState(0);
  const [layerVisibility, setLayerVisibility] = useState({
    riskAlerts: true,
    orbitalPaths: true,
  });
  const previousTargetIdRef = useRef(null);
  const simProgressRef = useRef(0);


  const emitCursorPing = useCallback(({ x, y }) => {
    if (typeof window === "undefined") return;

    const width = window.innerWidth;
    const height = window.innerHeight;
    const centerX = width * 0.5;
    const centerY = height * 0.56;
    const radius = Math.min(width, height) * 0.32;
    const distance = Math.hypot(x - centerX, y - centerY);
    if (distance > radius) return;

    setCursorPing({ x, y, id: Date.now() });
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
      showToast("SIMULATION RUNNING // LIVE PLAYBACK");
      return true;
    });
  }, [showToast]);

  const handleSimPause = useCallback(() => {
    setSimRunning((prev) => {
      if (!prev) return prev;
      showToast("SIMULATION PAUSED");
      return false;
    });
  }, [showToast]);

  const handleSimSpeedChange = useCallback((nextSpeed) => {
    setSimSpeed((prev) => {
      if (prev === nextSpeed) return prev;
      showToast(`SIMULATION SPEED ${nextSpeed}X`);
      return nextSpeed;
    });
  }, [showToast]);

  const handleSimProgressChange = useCallback((nextProgress) => {
    simProgressRef.current = nextProgress;
    const nextHours = Number((nextProgress * 6).toFixed(3));
    setSimOffsetHours((current) =>
      Math.abs(current - nextHours) >= 0.05 || nextHours === 0 ? nextHours : current
    );
  }, []);

  const handleSimAddSatellite = useCallback(async () => {
    if (simActionPending) return;
    setSimActionPending(true);
    showToast("SIMULATION EVENT // INJECTING DEMO SATELLITE");
    try {
      const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || "/api").replace(/\/$/, "");
      const res = await fetch(`${apiBaseUrl}/scenario/inject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          anchor_norad_id: selectedTarget?.details?.NORAD_CAT_ID ?? null,
          object_name: selectedTarget?.details?.OBJECT_NAME
            ? `${selectedTarget.details.OBJECT_NAME} PROX-1`
            : "GHOST APPARITION",
          object_type: "PAYLOAD"
        })
      });
        if (res.ok) {
          const result = await res.json().catch(() => ({}));
          setActiveAlert(result.pair_preview ?? null);
          setActiveScenario({
            kind: "proximity",
            title: "Synthetic Neighbor",
            collisionStarted: false,
            focusNoradId: result.focus_norad_id ?? null,
            compareNoradId: result.compare_norad_id ?? null,
            anchorName: result.anchor_name ?? null,
            compareName: result.synthetic_name ?? null,
            pairPreview: result.pair_preview ?? null,
            fragmentIds: [],
            injectedCount: 1,
          });
          setFocusNoradId(result.focus_norad_id ?? selectedTarget?.details?.NORAD_CAT_ID ?? null);
          setComparedNoradId(result.compare_norad_id ?? null);
          setRefreshSignal(s => s + 1);
        showToast(
          result.synthetic_name && result.anchor_name
            ? `SIMULATION EVENT // ${result.synthetic_name} DEPLOYED NEAR ${result.anchor_name}`
            : "SIMULATION EVENT // DEPLOYMENT SUCCESSFUL"
        );
      } else {
        const result = await res.json().catch(() => ({}));
        showToast(`SIMULATION EVENT // ${result.detail || "DEPLOYMENT FAILED"}`);
      }
    } catch {
      showToast("SIMULATION EVENT // DEPLOYMENT FAILED");
    } finally {
      setSimActionPending(false);
    }
  }, [selectedTarget, showToast, simActionPending]);

  const handleSimTriggerCollision = useCallback(async () => {
    if (simActionPending) return;
    setSimActionPending(true);
    showToast("SIMULATION EVENT // INJECTING DEBRIS CLOUD");
    try {
      const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || "/api").replace(/\/$/, "");
      const res = await fetch(`${apiBaseUrl}/scenario/trigger-collision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          anchor_norad_id: selectedTarget?.details?.NORAD_CAT_ID ?? null,
        }),
      });
        if (res.ok) {
          const result = await res.json().catch(() => ({}));
          setActiveAlert(result.pair_preview ?? null);
          setActiveScenario({
            kind: "collision",
            title: "Collision Simulation",
            collisionStarted: false,
            focusNoradId: result.focus_norad_id ?? null,
            compareNoradId: result.compare_norad_id ?? null,
            anchorName: result.anchor_name ?? null,
            compareName: result.threat_name ?? null,
            pairPreview: result.pair_preview ?? null,
            fragmentIds: Array.isArray(result.fragment_ids) ? result.fragment_ids : [],
            injectedCount: result.injected_count ?? 0,
          });
          setFocusNoradId(result.focus_norad_id ?? selectedTarget?.details?.NORAD_CAT_ID ?? null);
          setComparedNoradId(result.compare_norad_id ?? null);
          setRefreshSignal(s => s + 1);
        showToast(
          result.threat_name && result.anchor_name
            ? `SIMULATION EVENT // ${result.threat_name} ARMED AGAINST ${result.anchor_name}`
            : "SIMULATION EVENT // COLLISION SCENARIO TRIGGERED"
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
  }, [selectedTarget, showToast, simActionPending]);

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
    setSimRunning(false);
    setSimSpeed(1);
    setSimOffsetHours(0);
    simProgressRef.current = 0;
    showToast("SIMULATION RESET // PURGING REDIS SCENARIO STATE...");
    
    try {
        const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || "/api").replace(/\/$/, "");
        const res = await fetch(`${apiBaseUrl}/scenario/reset`, { method: "POST" });
        if (res.ok) {
          setActiveScenario(null);
          setActiveAlert(null);
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

  const handlePointerDown = useCallback((event) => {
    if (event.button !== undefined && event.button !== 0) return;
    emitCursorPing({ x: event.clientX, y: event.clientY });
  }, [emitCursorPing]);

  const handleTargetChange = useCallback((snapshot) => {
    if (!snapshot) {
      setSelectedTarget(null);
      setAnalysisSnapshot(null);
      setAnalysisOpen(false);
      previousTargetIdRef.current = null;
      return;
    }

    const nextTarget = snapshot.target;
    const nextTargetId = nextTarget?.details?.NORAD_CAT_ID ?? null;

    if (nextTargetId && previousTargetIdRef.current !== nextTargetId) {
      showToast(`TARGET LOCK // ${nextTarget.details.OBJECT_NAME}`);
    }

    previousTargetIdRef.current = nextTargetId;
    if (
      activeAlert &&
      nextTargetId &&
      nextTargetId !== activeAlert.target_norad_id &&
      focusNoradId !== activeAlert.target_norad_id
    ) {
      setActiveAlert(null);
      setComparedNoradId(null);
    }
    setSelectedTarget(nextTarget);
    setAnalysisSnapshot(snapshot.analysis ?? null);
  }, [activeAlert, focusNoradId, showToast]);

  const handleOpenAnalysis = useCallback(() => {
    if (!selectedTarget || !analysisSnapshot) return;
    setAnalysisOpen(true);
    showToast("DEEP ANALYSIS // TARGET BRIEF OPEN");
  }, [analysisSnapshot, selectedTarget, showToast]);

  const handleCloseAnalysis = useCallback(() => {
    setAnalysisOpen(false);
  }, []);

  const handleClearTarget = useCallback(() => {
    setSelectedTarget(null);
    setAnalysisSnapshot(null);
    setAnalysisOpen(false);
    setComparedNoradId(null);
    setActiveAlert(null);
    setActiveScenario(null);
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

    const fetchOverview = async () => {
      try {
        const res = await fetch(
          `${apiBaseUrl}/analysis/overview?sim_hours=${simOffsetHours}`,
          { signal: controller.signal }
        );
        if (!res.ok) return;
        const result = await res.json();
        if (controller.signal.aborted) return;
        const overview = result?.data || {};
        setAnalysisOverview({
          zones: Array.isArray(overview.zones) ? overview.zones : [],
          alerts: Array.isArray(overview.alerts) ? overview.alerts : [],
          simulatedAt: overview.simulated_at || null,
          catalogCount: overview.catalog_count || 0,
        });
      } catch {
        if (!controller.signal.aborted) {
          setAnalysisOverview(EMPTY_ANALYSIS_OVERVIEW);
        }
      }
    };

    fetchOverview();
    return () => controller.abort();
  }, [datasetStats.generatedAt, refreshSignal, simOffsetHours]);

  useEffect(() => {
    if (!selectedTarget) return;

    const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || "/api").replace(/\/$/, "");
    const controller = new AbortController();

    const fetchTargetAnalysis = async () => {
      try {
        const res = await fetch(
          `${apiBaseUrl}/analysis/target/${selectedTarget.details.NORAD_CAT_ID}?sim_hours=${simOffsetHours}`,
          { signal: controller.signal }
        );
        if (!res.ok) return;
        const result = await res.json();
        const data = result?.data;
        if (!data || controller.signal.aborted) return;
        setAnalysisSnapshot((prev) => ({
          ...(prev || {}),
          ...data,
        }));
      } catch {
        if (!controller.signal.aborted) {
          showToast("TARGET ANALYSIS // BACKEND SCREENING UNAVAILABLE");
        }
      }
    };

    fetchTargetAnalysis();
    return () => controller.abort();
  }, [refreshSignal, selectedTarget, showToast, simOffsetHours]);

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
    };
  }, [activeAlert, analysisSnapshot, comparedNoradId, selectedTarget]);

  const activeSatTypes = SAT_TYPE_CONFIG
    .map((config) => config.id)
    .filter((type) => satTypes[type]);

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
        comparedNoradId={comparedNoradId}
        activePair={activePair}
        scenarioState={activeScenario}
        uncertaintyZones={analysisOverview.zones}
        showOrbitalPaths={layerVisibility.orbitalPaths}
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
        onSelectAlert={(alert) => {
          setActiveAlert(alert);
          setComparedNoradId(alert.candidate_norad_id);
          setFocusNoradId(alert.target_norad_id);
          showToast(`ALERT QUEUE // ${alert.target_name} VS ${alert.candidate_name}`);
        }}
      />

      <TacticalInsightPanel
        target={selectedTarget}
        analysis={analysisSnapshot}
        activePair={activePair}
        comparedNoradId={comparedNoradId}
        onCompareObject={handleCompareObject}
        onOpenAnalysis={handleOpenAnalysis}
        onClearTarget={handleClearTarget}
      />

      <DeepAnalysisOverlay
        target={selectedTarget}
        analysis={analysisSnapshot}
        isOpen={analysisOpen}
        onClose={handleCloseAnalysis}
        simTimestamp={analysisOverview.simulatedAt}
      />

      <BottomBar
        simRunning={simRunning}
        simSpeed={simSpeed}
        onSimStart={handleSimStart}
        onSimPause={handleSimPause}
        onSimSpeedChange={handleSimSpeedChange}
        onSimAddSatellite={handleSimAddSatellite}
        onSimTriggerCollision={handleSimTriggerCollision}
        onStartCollisionSimulation={handleStartCollisionSimulation}
        onSimReset={handleSimReset}
        onOpenAnalysis={handleOpenAnalysis}
        analysisAvailable={Boolean(selectedTarget && analysisSnapshot)}
        simActionPending={simActionPending}
        simProgressRef={simProgressRef}
        onSimProgressChange={handleSimProgressChange}
        activeScenario={activeScenario}
      />

      <Toast message={toastMsg} phase={toastPhase} />

      <ClassificationHeader />
      <OrbitalPass recTime={recTime} analysis={analysisSnapshot} simTimestamp={analysisOverview.simulatedAt} />
      <TelemetryOverlay
        analysis={analysisSnapshot}
        datasetStats={datasetStats}
        activePair={activePair}
        activeScenario={activeScenario}
      />

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
