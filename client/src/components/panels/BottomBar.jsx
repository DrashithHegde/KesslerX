import { useEffect, useRef, useState } from "react";

const TIMELINE_DURATION_MS = 20000;
const TIMELINE_MARKERS = [
  { position: 0.14, color: "#00e5ff" },
  { position: 0.08, color: "#6fdcff" },
  { position: 0.19, color: "#4aa8ff" },
  { position: 0.27, color: "#8ee7ff" },
  { position: 0.36, color: "#58b8ff" },
  { position: 0.44, color: "#7ccfff" },
  { position: 0.58, color: "#7ad6ff" },
  { position: 0.66, color: "#99ecff" },
];

function formatSimTime(progress) {
  const totalSeconds = Math.round(progress * 3600);
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function CompactChip({
  label,
  onClick,
  active = false,
  disabled = false,
  tone = "default",
  minWidth,
}) {
  const palette = disabled
    ? {
        border: "1px solid rgba(0,229,255,0.08)",
        background: "rgba(11,15,20,0.44)",
        color: "rgba(200,214,229,0.24)",
        shadow: "none",
      }
    : tone === "warning"
      ? {
          border: "1px solid rgba(0,229,255,0.28)",
          background: "rgba(0,229,255,0.08)",
          color: "rgba(0,229,255,0.86)",
          shadow: "0 0 12px rgba(0,229,255,0.1)",
        }
      : active
        ? {
            border: "1px solid rgba(0,229,255,0.42)",
            background: "rgba(0,229,255,0.1)",
            color: "rgba(0,229,255,0.9)",
            shadow: "0 0 14px rgba(0,229,255,0.12), inset 0 0 8px rgba(0,229,255,0.05)",
          }
        : {
            border: "1px solid rgba(0,229,255,0.12)",
            background: "rgba(11,15,20,0.72)",
            color: "rgba(200,214,229,0.62)",
            shadow: "none",
          };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        minWidth,
        padding: "5px 10px",
        borderRadius: 999,
        border: palette.border,
        background: palette.background,
        color: palette.color,
        boxShadow: palette.shadow,
        fontFamily: "'DM Mono', monospace",
        fontSize: "0.5rem",
        letterSpacing: "0.16em",
        textTransform: "uppercase",
        whiteSpace: "nowrap",
        transition: "all 0.2s ease",
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      {label}
    </button>
  );
}

function SweepTimeline({ progress, onSeek }) {
  const trackRef = useRef(null);

  const handleClick = (event) => {
    if (!trackRef.current || typeof onSeek !== "function") return;
    const rect = trackRef.current.getBoundingClientRect();
    const ratio = Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1);
    onSeek(ratio);
  };

  return (
    <div style={{ position: "relative", flex: 1, minWidth: 180 }}>
      <div
        ref={trackRef}
        onClick={handleClick}
        style={{
          position: "relative",
          height: 7,
          borderRadius: 999,
          background: "rgba(0,229,255,0.08)",
          border: "1px solid rgba(0,229,255,0.08)",
          cursor: "pointer",
          overflow: "visible",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: `${progress * 100}%`,
            borderRadius: 999,
            background:
              "linear-gradient(90deg, rgba(0,229,255,0.72), rgba(0,229,255,0.24))",
          }}
        />

        {TIMELINE_MARKERS.map((marker) => (
          <span
            key={`${marker.position}-${marker.color}`}
            style={{
              position: "absolute",
              left: `${marker.position * 100}%`,
              top: "50%",
              transform: "translate(-50%, -50%)",
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: marker.color,
              boxShadow: `0 0 8px ${marker.color}`,
              border: "1px solid rgba(4,7,11,0.9)",
            }}
          />
        ))}

        <div
          style={{
            position: "absolute",
            top: "50%",
            left: `${progress * 100}%`,
            transform: "translate(-50%, -50%)",
            width: 13,
            height: 13,
            borderRadius: "50%",
            background: "#0b0f14",
            border: "1px solid rgba(0,229,255,0.78)",
            boxShadow: "0 0 12px rgba(0,229,255,0.28)",
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

  const handlePlayPause = () => {
    if (simRunning) {
      onSimPause();
    } else {
      onSimStart();
    }
  };

  const handleSeek = (ratio) => {
    setTimelineProgress(ratio);
  };

  const handleReset = () => {
    setTimelineProgress(0);
    onSimReset();
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
        padding: "0 18px 34px",
      }}
    >
      <div
        className="glass"
        style={{
          pointerEvents: "auto",
          width: "760px",
          maxWidth: "100%",
          borderRadius: 14,
          padding: "9px 12px 10px",
          border: "1px solid rgba(0,229,255,0.13)",
          boxShadow: "0 10px 30px rgba(0,0,0,0.42)",
          background:
            "linear-gradient(180deg, rgba(11,15,20,0.82), rgba(8,12,18,0.9))",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            minHeight: 34,
          }}
        >
          <button
            type="button"
            onClick={handlePlayPause}
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              border: "1px solid rgba(0,229,255,0.28)",
              background: "rgba(0,229,255,0.08)",
              color: "#00e5ff",
              fontFamily: "'DM Mono', monospace",
              fontSize: "0.72rem",
              boxShadow: "0 0 12px rgba(0,229,255,0.1)",
              cursor: "pointer",
              transition: "all 0.2s ease",
              flexShrink: 0,
            }}
          >
            {simRunning ? "II" : ">"}
          </button>

          <div
            style={{
              fontSize: "0.48rem",
              letterSpacing: "0.16em",
              color: "rgba(200,214,229,0.34)",
              textTransform: "uppercase",
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            {simRunning ? "Playback live" : "Scenario standby"}
          </div>

          <SweepTimeline progress={timelineProgress} onSeek={handleSeek} />

          <div
            style={{
              fontSize: "0.5rem",
              letterSpacing: "0.18em",
              color: "rgba(0,229,255,0.72)",
              textTransform: "uppercase",
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            T+ {formatSimTime(timelineProgress)}
          </div>
        </div>

        <div
          style={{
            marginTop: 8,
            paddingTop: 8,
            borderTop: "1px solid rgba(0,229,255,0.08)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexWrap: "wrap",
            }}
          >
            <span
              style={{
                fontSize: "0.48rem",
                letterSpacing: "0.16em",
                color: "rgba(200,214,229,0.34)",
                textTransform: "uppercase",
              }}
            >
              Speed
            </span>
            {[1, 2, 5].map((value) => (
              <CompactChip
                key={value}
                label={`${value}x`}
                onClick={() => onSimSpeedChange(value)}
                active={simSpeed === value}
                minWidth={46}
              />
            ))}
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexWrap: "wrap",
              justifyContent: "flex-end",
            }}
          >
            <CompactChip label="Inject Risk" onClick={onSimTriggerCollision} tone="warning" />
            <CompactChip label="Add Satellite" onClick={onSimAddSatellite} />
            <CompactChip
              label="Open Analysis"
              onClick={onOpenAnalysis}
              active={analysisAvailable}
              disabled={!analysisAvailable}
            />
            <CompactChip label="Reset" onClick={handleReset} />
          </div>
        </div>
      </div>
    </div>
  );
}
