import { useCallback, useEffect, useRef, useState } from "react";
import "./styles/globals.css";
import { useClock, useToast, useIntro } from "./hooks";
import Globe from "./components/map/Globe";
import IntroOverlay from "./components/map/IntroOverlay";
import TopBar from "./components/panels/TopBar";
import LayerControls from "./components/panels/LayerControls";
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
  error: null,
};

export default function App() {
  const { phase: introPhase } = useIntro();
  const recTime = useClock();
  const { message: toastMsg, phase: toastPhase, show: showToast } = useToast();
  const [satTypes, setSatTypes] = useState(createSatTypeState);
  const [simRunning, setSimRunning] = useState(false);
  const [simSpeed, setSimSpeed] = useState(1);
  const [cursorPing, setCursorPing] = useState(null);
  const [selectedTarget, setSelectedTarget] = useState(null);
  const [analysisSnapshot, setAnalysisSnapshot] = useState(null);
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [datasetStats, setDatasetStats] = useState(EMPTY_DATASET_STATS);
  const [layerControlsTop, setLayerControlsTop] = useState(208);
  const [selectionClearSignal, setSelectionClearSignal] = useState(0);
  const previousTargetIdRef = useRef(null);

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

  const handleSimAddSatellite = useCallback(() => {
    showToast("SIMULATION EVENT // DEMO SATELLITE DEPLOYED");
  }, [showToast]);

  const handleSimTriggerCollision = useCallback(() => {
    showToast("SIMULATION EVENT // COLLISION SCENARIO TRIGGERED");
  }, [showToast]);

  const handleSimReset = useCallback(() => {
    setSimRunning(false);
    setSimSpeed(1);
    showToast("SIMULATION RESET // SYSTEM STANDBY");
  }, [showToast]);

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
    setSelectedTarget(nextTarget);
    setAnalysisSnapshot(snapshot.analysis);
  }, [showToast]);

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
    previousTargetIdRef.current = null;
    setSelectionClearSignal((current) => current + 1);
  }, []);

  const handleDatasetStatsChange = useCallback((nextStats) => {
    setDatasetStats(nextStats);
  }, []);

  const handleClassificationBoundsChange = useCallback((bounds) => {
    if (!bounds?.bottom) return;
    setLayerControlsTop(Math.max(208, Math.round(bounds.bottom + 18)));
  }, []);

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
      />

      <LayerControls
        satTypes={satTypes}
        onToggleSatType={handleSatTypeToggle}
        satTypeConfig={SAT_TYPE_CONFIG}
        datasetStats={datasetStats}
        topOffset={layerControlsTop}
      />

      <TacticalInsightPanel
        target={selectedTarget}
        analysis={analysisSnapshot}
        onOpenAnalysis={handleOpenAnalysis}
        onClearTarget={handleClearTarget}
      />

      <DeepAnalysisOverlay
        target={selectedTarget}
        analysis={analysisSnapshot}
        isOpen={analysisOpen}
        onClose={handleCloseAnalysis}
      />

      <BottomBar
        simRunning={simRunning}
        simSpeed={simSpeed}
        onSimStart={handleSimStart}
        onSimPause={handleSimPause}
        onSimSpeedChange={handleSimSpeedChange}
        onSimAddSatellite={handleSimAddSatellite}
        onSimTriggerCollision={handleSimTriggerCollision}
        onSimReset={handleSimReset}
        onOpenAnalysis={handleOpenAnalysis}
        analysisAvailable={Boolean(selectedTarget && analysisSnapshot)}
      />

      <Toast message={toastMsg} phase={toastPhase} />

      <ClassificationHeader onBoundsChange={handleClassificationBoundsChange} />
      <OrbitalPass recTime={recTime} analysis={analysisSnapshot} />
      <TelemetryOverlay analysis={analysisSnapshot} datasetStats={datasetStats} />

      <StatusBar
        recTime={recTime}
        datasetStats={datasetStats}
        selectedTarget={selectedTarget}
      />

      <CursorReticle ping={cursorPing} />
    </div>
  );
}
