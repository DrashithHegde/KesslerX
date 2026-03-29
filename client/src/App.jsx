import { useState, useRef, useCallback, useEffect } from "react";

// ── Styles ────────────────────────────────────────────────────────────────
import "./styles/globals.css";

// ── Hooks ─────────────────────────────────────────────────────────────────
import { useClock, useToast, useIntro } from "./hooks";
import Globe from "./components/map/Globe";

// ── Constants ─────────────────────────────────────────────────────────────
import { LAYER_CONFIG } from "./constants/layers";

// ── Utils ─────────────────────────────────────────────────────────────────
import { generateTrend } from "./utils/helpers";

// ── Map ───────────────────────────────────────────────────────────────────
import IntroOverlay from "./components/map/IntroOverlay";

// ── Panels ────────────────────────────────────────────────────────────────
import TopBar from "./components/panels/TopBar";
import LayerControls from "./components/panels/LayerControls";
import InsightPanel from "./components/panels/InsightPanel";
import DeepAnalysisOverlay from "./components/panels/DeepAnalysisOverlay";
import BottomBar from "./components/panels/BottomBar";

// ── HUD ───────────────────────────────────────────────────────────────────
import HUDCorners from "./components/hud/HUDCorners";
import StatusBar from "./components/hud/StatusBar";
import Toast from "./components/hud/Toast"; import ClassificationHeader from "./components/hud/ClassificationHeader";
import OrbitalPass from "./components/hud/OrbitalPass";
import TelemetryOverlay from "./components/hud/TelemetryOverlay";
import CursorReticle from "./components/ui/CursorReticle";
// ─────────────────────────────────────────────────────────────────────────────
// App — root component
// ─────────────────────────────────────────────────────────────────────────────

export default function App() {
  // ── Intro & panel visibility ─────────────────────────────────────────────
  const { phase: introPhase, panelsVisible } = useIntro();
  const SAT_TYPE_CONFIG = [
    { id: "PAYLOAD", label: "Satellites", icon: "🛰️", desc: "Active satellites (blue)" },
    { id: "ROCKET BODY", label: "Rocket Bodies", icon: "🚀", desc: "Rocket stages (green)" },
    { id: "DEBRIS", label: "Debris", icon: "✸", desc: "Trackable debris (dusky brown)" },
    { id: "OTHER", label: "Other/Unknown", icon: "?", desc: "Other/unknown (gray)" },
  ];

  // ── Live clock ───────────────────────────────────────────────────────────
  const recTime = useClock();

  // ── Toast ────────────────────────────────────────────────────────────────
  const { message: toastMsg, phase: toastPhase, show: showToast } = useToast();

  // ── City & layer state ───────────────────────────────────────────────────
  const activeCity = null;   // City selection handled elsewhere (Pan-India overview)
  const [activeLayers, setActiveLayers] = useState({
    aqi: true,
    ndvi: false,
    ndwi: false,
    lst: false,
    all: false,
  });
  const [coords, setCoords] = useState({
    lat: "20.5937",
    lng: "78.9629",
  });

  // ── Insight panel state ──────────────────────────────────────────────────
  const [selectedZone, setSelectedZone] = useState(null);
  const [insightOpen, setInsightOpen] = useState(false);
  const [deepAnalysisOpen, setDeepAnalysisOpen] = useState(false);
  const [trendData, setTrendData] = useState([]);
  const [satTypes, setSatTypes] = useState({
    PAYLOAD: true,
    "ROCKET BODY": true,
    DEBRIS: true,
    OTHER: true,
  });
  const [simRunning, setSimRunning] = useState(false);
  const [simSpeed, setSimSpeed] = useState(1);
  const [cursorPing, setCursorPing] = useState(null);

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
  }, [setCursorPing]);

  function handleSatTypeToggle(typeId) {
    setSatTypes((prev) => ({ ...prev, [typeId]: !prev[typeId] }));
  }
  const activeCityLabel = null;

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

  // ── Handlers ─────────────────────────────────────────────────────────────

  function handleZoneClick(zone) {
    setSelectedZone(zone);
    setTrendData(generateTrend(zone.severity));
    setInsightOpen(true);
    setDeepAnalysisOpen(false);
    showToast(`ANOMALY DETECTED // ${zone.name.toUpperCase()}`);
  }

  function handleInsightClose() {
    setInsightOpen(false);
    setDeepAnalysisOpen(false);
    setTimeout(() => setSelectedZone(null), 420); // wait for slide-out
  }

  function handleDeepAnalysisOpen() {
    if (!selectedZone) return;
    setDeepAnalysisOpen(true);
  }

  function handleDeepAnalysisClose() {
    setDeepAnalysisOpen(false);
  }

  const handleLayerToggle = useCallback((layerId) => {
    setActiveLayers((prev) => {
      if (layerId === "all") {
        const isCurrentlyActive = prev.all;
        if (isCurrentlyActive) {
          // Toggle off all layers
          return {
            aqi: false,
            ndvi: false,
            ndwi: false,
            lst: false,
            all: false,
          };
        } else {
          // Toggle on all layers
          return {
            aqi: true,
            ndvi: true,
            ndwi: true,
            lst: true,
            all: true,
          };
        }
      }

      // Individual layer toggle: if already active, turn it off; otherwise activate it
      const isCurrentlyActive = prev[layerId];
      if (isCurrentlyActive) {
        // Toggle off — show base map only
        return {
          aqi: false,
          ndvi: false,
          ndwi: false,
          lst: false,
          all: false,
        };
      } else {
        // Toggle on — single-select
        return {
          aqi: layerId === "aqi",
          ndvi: layerId === "ndvi",
          ndwi: layerId === "ndwi",
          lst: layerId === "lst",
          all: false,
        };
      }
    });

    const layerLabel = LAYER_CONFIG[layerId]?.label || "Layer";
    const action = activeLayers[layerId] ? "DEACTIVATED" : "ACTIVATED";
    showToast(`${layerLabel.toUpperCase()} LAYER ${action}`);
  }, [showToast, activeLayers]);

  const handlePointerDown = useCallback((event) => {
    if (event.button !== undefined && event.button !== 0) return;
    emitCursorPing({ x: event.clientX, y: event.clientY });
  }, [emitCursorPing]);

  // Prevent browser-level zoom (Ctrl/Cmd + wheel / +/- / 0)
  // so only the map surface performs zoom interactions.
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

  // ── Render ───────────────────────────────────────────────────────────────

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
      {/* Grain texture */}
      <div className="grain" />

      {/* ── 3D Earth Simulation */}
      <Globe
        satTypes={Object.keys(satTypes).filter((k) => satTypes[k])}
        onSelectionPing={emitCursorPing}
      />

      {/* ── Satellite circular mask overlays ─────────────────────────────── */}
      <div
        className="satellite-mask"
        style={{ animation: "fadeInMask 0.7s ease-in-out forwards" }}
      />

      {/* ── Intro overlay ────────────────────────────────────────────────── */}
      <IntroOverlay phase={introPhase} />

      {/* ── HUD corners ──────────────────────────────────────────────────── */}
      <HUDCorners />

      {/* ── Panels (always visible) ─────────────────────────────────────── */}
      <>
        <TopBar
          activeLayers={activeLayers}
          recTime={recTime}
          coords={coords}
        />

        {/* Layer controls on left — always visible */}
        <LayerControls
          activeLayers={activeLayers}
          onToggleLayer={handleLayerToggle}
          satTypes={satTypes}
          onToggleSatType={handleSatTypeToggle}
          satTypeConfig={SAT_TYPE_CONFIG}
        />

        <DeepAnalysisOverlay
          zone={selectedZone}
          cityLabel={activeCityLabel}
          trendData={trendData}
          activeLayers={activeLayers}
          isOpen={deepAnalysisOpen}
          onClose={handleDeepAnalysisClose}
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
        />
      </>

      {/* ── Toast ────────────────────────────────────────────────────────── */}
      <Toast message={toastMsg} phase={toastPhase} />

      {/* ── Intelligence Agency Overlays ─────────────────────────────────── */}
      <>
        <ClassificationHeader />
        <OrbitalPass recTime={recTime} />
        <TelemetryOverlay coords={coords} />
      </>

      {/* ── Status bar ───────────────────────────────────────────────────── */}
      <StatusBar activeCity={activeCity} recTime={recTime} />

      {/* ── Cursor halo ──────────────────────────────────────────────────── */}
      <CursorReticle ping={cursorPing} />
    </div>
  );
}
