import { useEffect, useRef, useState } from "react";
import {
  SIM_WINDOW_HOURS,
  TIMELINE_DURATION_MS,
} from "../../utils/simulationClock";
const SPEED_OPTIONS = [
  { label: "1x", speed: 0.5 },
  { label: "2x", speed: 1 },
  { label: "3x", speed: 2 },
];

function eventMarkerColor(event) {
  if (event?.is_confirmed_collision || event?.event_class === "collision") return "#ff5f57";
  if (event?.event_class === "super_close_call") return "#ff8c42";
  if (event?.event_class === "close_approach") return "#ffd166";
  if (event?.risk_band === "SEVERE") return "#ff5f57";
  if (event?.risk_band === "HIGH") return "#ff8c42";
  if (event?.risk_band === "ELEVATED") return "#ffd166";
  return "#00e5ff";
}

function formatSimTime(progress) {
  const totalMinutes = Math.round(progress * SIM_WINDOW_HOURS * 60);
  const hours = String(Math.floor(totalMinutes / 60)).padStart(2, "0");
  const minutes = String(totalMinutes % 60).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function eventTimelineMinute(event) {
  const minute = Number(
    event?.timeline_minute
      ?? event?.event_time_minutes
      ?? event?.sampled_tca_minutes
  );
  return Number.isFinite(minute) ? minute : null;
}

function eventMarkerTitle(event) {
  const summary = event?.event_label || event?.risk_band || "Tracked approach";
  const counterpart = event?.candidate_name || event?.target_name || "Tracked object";
  const timelineMinute = eventTimelineMinute(event);
  const timePosition = timelineMinute !== null
    ? timelineMinute / (SIM_WINDOW_HOURS * 60)
    : Number.NaN;
  const timestamp = Number.isFinite(timePosition) ? `T+${formatSimTime(timePosition)}` : null;
  return [summary, counterpart, timestamp].filter(Boolean).join(" // ");
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

function SweepTimeline({ progress, onSeek, markers = [] }) {
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

        {markers.map((marker, index) => (
          <span key={`${marker.position}-${marker.color}-${index}`}>
            {marker.label ? (
              <span
                style={{
                  position: "absolute",
                  left: `${marker.position * 100}%`,
                  bottom: `calc(100% + ${index % 2 === 0 ? 10 : 24}px)`,
                  transform: "translateX(-50%)",
                  fontSize: "0.42rem",
                  letterSpacing: "0.12em",
                  color: marker.color,
                  textTransform: "uppercase",
                  whiteSpace: "nowrap",
                }}
              >
                {marker.label}
              </span>
            ) : null}
            <span
              style={{
                position: "absolute",
                left: `${marker.position * 100}%`,
                top: "50%",
                transform: "translate(-50%, -50%)",
                width: marker.label ? 8 : 7,
                height: marker.label ? 8 : 7,
                borderRadius: "50%",
                background: marker.color,
                boxShadow: `0 0 8px ${marker.color}`,
                border: "1px solid rgba(4,7,11,0.9)",
              }}
              title={marker.title || undefined}
            />
          </span>
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
  onSimComplete,
  onSimSpeedChange,
  onSimTriggerCollision,
  onStartCollisionSimulation,
  onSimReset,
  onOpenAnalysis,
  analysisAvailable,
  simActionPending = false,
  simProgressRef,
  onSimProgressChange,
  focusMode = false,
  onToggleFocusMode,
  activeScenario = null,
  timelineEvents = [],
  riskInjected = false,
}) {
  const [timelineProgress, setTimelineProgress] = useState(0);
  const rafRef = useRef(null);
  const hasCompletedRef = useRef(false);
  const timelineProgressRef = useRef(0);
  const anchorProgressRef = useRef(0);
  const anchorWallTimeRef = useRef(0);

  const syncProgress = (nextProgress, options = {}) => {
    timelineProgressRef.current = nextProgress;
    setTimelineProgress(nextProgress);
    if (simProgressRef) {
      simProgressRef.current = nextProgress;
    }
    onSimProgressChange?.(nextProgress, options);
  };

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
    timelineProgressRef.current = timelineProgress;
  }, [timelineProgress]);

  useEffect(() => {
    if (typeof window === "undefined" || !simRunning) {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      if (timelineProgress < 1) {
        hasCompletedRef.current = false;
      }
      return undefined;
    }

    anchorProgressRef.current = timelineProgressRef.current;
    anchorWallTimeRef.current = performance.now();

    const tick = (now) => {
      const elapsedWallMs = now - anchorWallTimeRef.current;
      const next = Math.min(
        anchorProgressRef.current + (elapsedWallMs * simSpeed) / TIMELINE_DURATION_MS,
        1
      );
      const shouldContinue = next < 1;

      syncProgress(next, { wallTimeMs: now });

      if (shouldContinue) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      if (!hasCompletedRef.current) {
        hasCompletedRef.current = true;
        onSimComplete?.();
      }
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [onSimComplete, onSimProgressChange, simRunning, simSpeed, simProgressRef]);

  const handlePlayPause = () => {
    if (simRunning) {
      onSimPause();
    } else {
      onSimStart();
    }
  };

  const handleSeek = (ratio) => {
    if (ratio < 1) {
      hasCompletedRef.current = false;
    }
    anchorProgressRef.current = ratio;
    syncProgress(ratio, { forceSync: true });
  };

  const handleReset = () => {
    hasCompletedRef.current = false;
    anchorProgressRef.current = 0;
    syncProgress(0, { forceSync: true });
    onSimReset();
  };
  const collisionReady =
    activeScenario?.kind === "collision" && !activeScenario?.collisionStarted;
  const collisionActive =
    activeScenario?.kind === "collision" && activeScenario?.collisionStarted;
  const scenarioTimelineMarkers = Array.isArray(timelineEvents)
    ? timelineEvents
      .map((event, index) => {
        const timelineMinute = eventTimelineMinute(event);
        if (timelineMinute === null) {
          return null;
        }

        return {
          position: Math.min(Math.max(timelineMinute / (SIM_WINDOW_HOURS * 60), 0), 1),
          color: eventMarkerColor(event),
          label: formatSimTime(timelineMinute / (SIM_WINDOW_HOURS * 60)),
          title: eventMarkerTitle(event) || `Event ${index + 1}`,
        };
      })
      .filter(Boolean)
      .sort((left, right) => left.position - right.position)
    : [];

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

          <SweepTimeline
            progress={timelineProgress}
            onSeek={handleSeek}
            markers={scenarioTimelineMarkers}
          />

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
            {SPEED_OPTIONS.map((option) => (
              <CompactChip
                key={option.label}
                label={option.label}
                onClick={() => onSimSpeedChange(option.speed, option.label)}
                active={simSpeed === option.speed}
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
            <CompactChip
              label={simActionPending ? "Working" : riskInjected ? "Deinject Risk" : "Inject Risk"}
              onClick={onSimTriggerCollision}
              tone="warning"
              disabled={simActionPending}
            />
            <CompactChip
              label={collisionActive ? "Collision Live" : "Start Collision"}
              onClick={onStartCollisionSimulation}
              tone="warning"
              active={collisionActive}
              disabled={simActionPending || !collisionReady}
            />
            <CompactChip
              label="Focus Mode"
              onClick={onToggleFocusMode}
              active={focusMode}
            />
            <CompactChip
              label="Open Analysis"
              onClick={onOpenAnalysis}
              active={analysisAvailable}
              disabled={!analysisAvailable}
            />
            <CompactChip label="Reset" onClick={handleReset} disabled={simActionPending} />
          </div>
        </div>
      </div>
    </div>
  );
}
