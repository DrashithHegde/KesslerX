import { useEffect, useRef, useState } from "react";

const TIMELINE_DURATION_MS = 20000;

function formatSimTime(progress) {
  const totalSeconds = Math.round(progress * 3600);
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function SpeedButton({ value, active, onClick }) {
  return (
    <button
      type="button"
      onClick={() => onClick(value)}
      style={{
        padding: "4px 12px",
        fontSize: "0.65rem",
        letterSpacing: "0.2em",
        textTransform: "uppercase",
        borderRadius: 6,
        border: active
          ? "1px solid rgba(0,209,255,0.8)"
          : "1px solid rgba(255,255,255,0.12)",
        color: active ? "#00D1FF" : "rgba(255,255,255,0.6)",
        background: active ? "rgba(0,209,255,0.1)" : "transparent",
        boxShadow: active ? "0 0 12px rgba(0,209,255,0.4)" : "none",
        transition: "all 0.2s ease",
        cursor: "pointer",
      }}
    >
      {value}x
    </button>
  );
}

function ScenarioButton({ label, onClick, tone = "default", disabled = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        flex: 1,
        minWidth: 120,
        padding: "8px 12px",
        fontSize: "0.58rem",
        letterSpacing: "0.2em",
        textTransform: "uppercase",
        borderRadius: 8,
        border:
          tone === "warning"
            ? "1px solid rgba(255,140,66,0.7)"
            : "1px solid rgba(255,255,255,0.12)",
        color: disabled
          ? "rgba(255,255,255,0.3)"
          : tone === "warning"
            ? "#FF8C42"
            : "rgba(255,255,255,0.7)",
        background: tone === "warning" ? "rgba(255,140,66,0.1)" : "transparent",
        boxShadow:
          tone === "warning" && !disabled ? "0 0 14px rgba(255,140,66,0.35)" : "none",
        transition: "all 0.2s ease",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.65 : 1,
      }}
    >
      {label}
    </button>
  );
}

function Timeline({ progress, onSeek }) {
  const trackRef = useRef(null);

  const handleClick = (event) => {
    if (!trackRef.current || typeof onSeek !== "function") return;
    const rect = trackRef.current.getBoundingClientRect();
    const ratio = Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1);
    onSeek(ratio);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontSize: "0.55rem",
          textTransform: "uppercase",
          letterSpacing: "0.3em",
          color: "rgba(255,255,255,0.5)",
        }}
      >
        <span>Timeline</span>
        <span>Delta {formatSimTime(progress)}</span>
      </div>
      <div
        ref={trackRef}
        onClick={handleClick}
        style={{
          position: "relative",
          height: 8,
          borderRadius: 999,
          background: "rgba(255,255,255,0.1)",
          cursor: "pointer",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            height: "100%",
            borderRadius: 999,
            background:
              "linear-gradient(to right, rgba(0,209,255,0.7), rgba(0,209,255,0.3))",
            width: `${progress * 100}%`,
          }}
        />
        <div
          style={{
            position: "absolute",
            top: "50%",
            transform: "translateY(-50%)",
            width: 16,
            height: 16,
            borderRadius: "50%",
            border: "1px solid #00D1FF",
            background: "#0B0F14",
            boxShadow: "0 0 12px rgba(0,209,255,0.6)",
            left: `calc(${progress * 100}% - 8px)`,
          }}
        />
      </div>
    </div>
  );
}

export default function BottomBar({
  simRunning,
  simSpeed,
  onSimStart,
  onSimPause,
  onSimSpeedChange,
  onSimAddSatellite,
  onSimTriggerCollision,
  onSimReset,
  onOpenAnalysis,
  analysisAvailable,
}) {
  const [timelineProgress, setTimelineProgress] = useState(0);
  const rafRef = useRef(null);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !simRunning) {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      return undefined;
    }

    let last = performance.now();
    const duration = TIMELINE_DURATION_MS / simSpeed;

    const tick = (now) => {
      const delta = now - last;
      last = now;
      setTimelineProgress((prev) => (prev + delta / duration) % 1);
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [simRunning, simSpeed]);

  const handleSeek = (ratio) => {
    setTimelineProgress(ratio);
  };

  const handleReset = () => {
    setTimelineProgress(0);
    onSimReset();
  };

  const handlePlayPause = () => {
    if (simRunning) {
      onSimPause();
    } else {
      onSimStart();
    }
  };

  return (
    <div
      style={{
        pointerEvents: "none",
        position: "fixed",
        insetInline: 0,
        bottom: 0,
        zIndex: 30,
        display: "flex",
        justifyContent: "center",
        paddingBottom: 24,
      }}
    >
      <div
        style={{
          pointerEvents: "auto",
          width: "560px",
          maxWidth: "92vw",
          borderRadius: 16,
          border: "1px solid rgba(255,255,255,0.1)",
          background: "rgba(11,15,20,0.9)",
          padding: "16px 24px",
          boxShadow: "0 8px 40px rgba(0,0,0,0.65)",
          backdropFilter: "blur(24px)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: "0.6rem",
            textTransform: "uppercase",
            letterSpacing: "0.4em",
            color: "rgba(255,255,255,0.6)",
          }}
        >
          <span>Simulation Control</span>
          <span style={{ color: "#00D1FF" }}>T+ {formatSimTime(timelineProgress)}</span>
        </div>

        <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 16 }}>
          <button
            type="button"
            onClick={handlePlayPause}
            style={{
              width: 48,
              height: 48,
              borderRadius: "50%",
              border: simRunning
                ? "1px solid rgba(255,140,66,0.6)"
                : "1px solid rgba(0,209,255,0.7)",
              color: simRunning ? "#FF8C42" : "#00D1FF",
              background: simRunning ? "rgba(255,140,66,0.1)" : "rgba(0,209,255,0.1)",
              boxShadow: "0 0 18px rgba(0,209,255,0.35)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "1rem",
              transition: "all 0.2s ease",
              cursor: "pointer",
            }}
          >
            {simRunning ? "||" : ">"}
          </button>

          <div style={{ display: "flex", flex: 1, flexDirection: "column", gap: 12 }}>
            <Timeline progress={timelineProgress} onSeek={handleSeek} />
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span
                style={{
                  fontSize: "0.55rem",
                  textTransform: "uppercase",
                  letterSpacing: "0.3em",
                  color: "rgba(255,255,255,0.4)",
                }}
              >
                Speed
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {[1, 2, 5].map((value) => (
                  <SpeedButton
                    key={value}
                    value={value}
                    active={simSpeed === value}
                    onClick={onSimSpeedChange}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        <div
          style={{
            marginTop: 16,
            display: "grid",
            gap: 12,
            gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
          }}
        >
          <ScenarioButton label="Inject Risk" onClick={onSimTriggerCollision} tone="warning" />
          <ScenarioButton label="Add Satellite" onClick={onSimAddSatellite} />
          <ScenarioButton
            label="Open Analysis"
            onClick={onOpenAnalysis}
            disabled={!analysisAvailable}
          />
          <ScenarioButton label="Reset" onClick={handleReset} />
        </div>
      </div>
    </div>
  );
}
