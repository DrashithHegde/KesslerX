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
  if (event?.risk_band === "SEVERE") return "#ff5f57";
  if (event?.risk_band === "HIGH") return "#ff8c42";
  if (event?.risk_band === "ELEVATED") return "#ffd166";
  if (event?.event_class === "super_close_call") return "#ff8c42";
  if (event?.event_class === "close_approach") return "#ffd166";
  return "#00e5ff";
}

function isCollisionEvent(event) {
  return Boolean(
    event?.is_confirmed_collision || event?.event_class === "collision"
  );
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
  return fallbackLabel ?? "TRACKED EVENT";
}

function formatSimTime(progress) {
  const totalMinutes = Math.round(progress * SIM_WINDOW_HOURS * 60);
  const hours = String(Math.floor(totalMinutes / 60)).padStart(2, "0");
  const minutes = String(totalMinutes % 60).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function formatTimelineMinute(minute) {
  const numericMinute = Number(minute);
  if (!Number.isFinite(numericMinute)) return null;
  return formatSimTime(numericMinute / (SIM_WINDOW_HOURS * 60));
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

function formatDistance(km) {
  if (km === null || km === undefined || !Number.isFinite(Number(km))) return "";
  const numKm = Number(km);
  if (numKm < 1) return `${Math.round(numKm * 1000)} m`;
  return `${numKm} km`;
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
      background: "linear-gradient(180deg, rgba(12,18,24,0.58), rgba(9,13,18,0.74))",
      color: "rgba(200,214,229,0.24)",
      shadow: "none",
    }
    : tone === "warning"
      ? {
        border: "1px solid rgba(0,229,255,0.32)",
        background: "linear-gradient(180deg, rgba(0,229,255,0.14), rgba(0,229,255,0.05))",
        color: "rgba(145,247,255,0.96)",
        shadow: "0 0 14px rgba(0,229,255,0.12)",
      }
      : active
        ? {
          border: "1px solid rgba(0,229,255,0.46)",
          background: "linear-gradient(180deg, rgba(0,229,255,0.18), rgba(0,229,255,0.06))",
          color: "rgba(0,229,255,0.9)",
          shadow: "0 0 16px rgba(0,229,255,0.14), inset 0 0 10px rgba(0,229,255,0.06)",
        }
        : {
          border: "1px solid rgba(0,229,255,0.14)",
          background: "linear-gradient(180deg, rgba(14,20,26,0.82), rgba(8,12,18,0.92))",
          color: "rgba(214,228,239,0.72)",
          shadow: "none",
        };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        minWidth,
        padding: "7px 12px",
        borderRadius: 999,
        border: palette.border,
        background: palette.background,
        color: palette.color,
        boxShadow: palette.shadow,
        fontFamily: "'DM Mono', monospace",
        fontSize: "0.56rem",
        letterSpacing: "0.14em",
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

function SweepTimeline({ progress, onSeek, markers = [], onMarkerClick, showTimestampAnnotations = false }) {
  const trackRef = useRef(null);
  const [hoveredMarker, setHoveredMarker] = useState(null);
  const [scrubLocked, setScrubLocked] = useState(false);
  const timelineTopInset = 2;

  const seekFromClientX = (clientX) => {
    if (!trackRef.current || typeof onSeek !== "function") return;
    const rect = trackRef.current.getBoundingClientRect();
    const ratio = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1);
    onSeek(ratio);
  };

  useEffect(() => {
    if (!scrubLocked || typeof window === "undefined") return undefined;

    const handlePointerMove = (event) => {
      seekFromClientX(event.clientX);
    };
    const handlePointerDown = (event) => {
      if (trackRef.current?.contains(event.target)) return;
      setScrubLocked(false);
    };
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setScrubLocked(false);
      }
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [scrubLocked]);

  const handleTrackClick = (event) => {
    if (typeof onSeek !== "function") return;
    seekFromClientX(event.clientX);
    setScrubLocked((current) => !current);
  };

  return (
    <div
      style={{
        position: "relative",
        flex: 1,
        minWidth: 180,
        paddingTop: timelineTopInset,
      }}
    >
      {showTimestampAnnotations ? (
        <div
          style={{
            position: "absolute",
            insetInline: 0,
            top: 0,
            height: 10,
            display: "flex",
            justifyContent: "space-between",
            pointerEvents: "none",
          }}
        >
          {Array.from({ length: 7 }).map((_, i) => (
            <div
              key={`tick-${i}`}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                width: 0,
                overflow: "visible",
              }}
            >
              <span
                style={{
                  fontSize: "0.38rem",
                  color: "rgba(0,229,255,0.26)",
                  fontFamily: "'DM Mono', monospace",
                  marginBottom: 1,
                }}
              >
                T+{i}:00
              </span>
              <div
                style={{
                  width: 1,
                  height: 3,
                  background: "rgba(0,229,255,0.1)",
                }}
              />
            </div>
          ))}
        </div>
      ) : null}

      <div
        ref={trackRef}
        onClick={handleTrackClick}
        style={{
          position: "relative",
          height: 4,
          transform: "translateY(-4px)",
          borderRadius: 999,
          background:
            "linear-gradient(180deg, rgba(0,229,255,0.07), rgba(0,229,255,0.03))",
          border: "1px solid rgba(0,229,255,0.12)",
          boxShadow: "inset 0 0 18px rgba(0,229,255,0.05)",
          cursor: scrubLocked ? "ew-resize" : "pointer",
          overflow: "visible",
        }}
      >
        {/* Progress fill */}
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: `${progress * 100}%`,
            borderRadius: 999,
            background:
              "linear-gradient(90deg, rgba(0,229,255,0.95), rgba(74,222,255,0.42))",
            boxShadow: "0 0 20px rgba(0,229,255,0.18)",
          }}
        />

        {/* Event markers — clickable dots with vertical ticks */}
        {markers.map((marker, index) => {
          const isCollision = marker.isCollision;
          const isHovered = hoveredMarker === index;
          const markerSize = isCollision ? 8 : 6;
          const hoverScale = isHovered ? 1.6 : 1;

          return (
            <span
              key={`${marker.position}-${marker.color}-${index}`}
              style={{ position: "absolute", left: `${marker.position * 100}%`, top: "50%", zIndex: isHovered ? 20 : 10 }}
            >
              {/* Vertical tick line */}
              <span
                style={{
                  position: "absolute",
                  left: "50%",
                  transform: "translateX(-50%)",
                  top: -3,
                  width: 1,
                  height: 10,
                  background: `linear-gradient(180deg, ${marker.color}88, ${marker.color}22)`,
                  pointerEvents: "none",
                }}
              />

              {/* Clickable dot */}
              <span
                role="button"
                tabIndex={0}
                onClick={(event) => {
                  event.stopPropagation();
                  onMarkerClick?.(marker, index);
                }}
                onMouseEnter={() => setHoveredMarker(index)}
                onMouseLeave={() => setHoveredMarker(null)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    event.stopPropagation();
                    onMarkerClick?.(marker, index);
                  }
                }}
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  transform: `translate(-50%, -50%) scale(${hoverScale})`,
                  width: markerSize,
                  height: markerSize,
                  borderRadius: isCollision ? 2 : "50%",
                  background: marker.color,
                  boxShadow: isCollision
                    ? `0 0 16px ${marker.color}, 0 0 6px ${marker.color}`
                    : `0 0 12px ${marker.color}`,
                  border: "1px solid rgba(4,7,11,0.9)",
                  cursor: "pointer",
                  transition: "transform 0.15s ease, box-shadow 0.15s ease",
                  animation: isCollision ? "eventMarkerPulse 2s ease-in-out infinite" : "none",
                }}
                title={marker.title || undefined}
              />

              {/* Hover tooltip */}
              {isHovered && (
                <div
                  style={{
                    position: "absolute",
                    left: "50%",
                    bottom: 18,
                    transform: "translateX(-50%)",
                    padding: "6px 10px",
                    borderRadius: 6,
                    background: "rgba(8,12,18,0.95)",
                    border: `1px solid ${marker.color}44`,
                    boxShadow: `0 4px 16px rgba(0,0,0,0.5), 0 0 8px ${marker.color}22`,
                    whiteSpace: "nowrap",
                    pointerEvents: "none",
                    zIndex: 30,
                    display: "grid",
                    gap: 3,
                  }}
                >
                  <span
                    style={{
                      fontSize: "0.5rem",
                      letterSpacing: "0.14em",
                      textTransform: "uppercase",
                      color: marker.color,
                      fontFamily: "'DM Mono', monospace",
                    }}
                  >
                    {marker.eventLabel || "Event"}
                  </span>
                  <span
                    style={{
                      fontSize: "0.54rem",
                      color: "rgba(200,214,229,0.82)",
                      fontFamily: "'DM Mono', monospace",
                    }}
                  >
                    {marker.counterpartName || ""}
                  </span>
                  <div style={{ display: "flex", gap: 8 }}>
                    <span
                      style={{
                        fontSize: "0.48rem",
                        color: "rgba(200,214,229,0.5)",
                        fontFamily: "'DM Mono', monospace",
                      }}
                    >
                      T+{marker.timeLabel || "--:--"}
                    </span>
                    {marker.distance && (
                      <span
                        style={{
                          fontSize: "0.48rem",
                          color: "rgba(200,214,229,0.5)",
                          fontFamily: "'DM Mono', monospace",
                        }}
                      >
                        {marker.distance}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </span>
          );
        })}

        {/* Playhead */}
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: `${progress * 100}%`,
            transform: "translate(-50%, -50%)",
            width: 11,
            height: 11,
            borderRadius: "50%",
            background: "radial-gradient(circle at 35% 35%, #8ef7ff 0%, #00cfe8 45%, #081118 100%)",
            border: "1px solid rgba(190,252,255,0.78)",
            boxShadow: "0 0 18px rgba(0,229,255,0.36)",
            zIndex: 15,
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
  onSimReset,
  simActionPending = false,
  simProgressRef,
  onSimProgressChange,
  focusMode = false,
  onToggleFocusMode,
  timelineEvents = [],
  onJumpToEvent,
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

  const simTimelineMarkers = Array.isArray(timelineEvents)
    ? timelineEvents
      .map((event) => {
        const minute = eventTimelineMinute(event);
        if (minute === null) return null;
        return {
          position: minute / (SIM_WINDOW_HOURS * 60),
          label: timelineEventLabel(deriveTimelineEventClass(event), event?.event_label),
          timeLabel: formatTimelineMinute(minute),
          color: eventMarkerColor(event),
          isCollision: isCollisionEvent(event),
          distance: formatDistance(event?.min_separation_km),
          counterpartName: event?.candidate_name || event?.target_name || "",
          event, // pass original event for jump handler
        };
      })
      .filter(Boolean)
      .sort((left, right) => left.position - right.position)
    : [];

  const handleMarkerClick = (marker) => {
    if (!marker?.event || typeof onJumpToEvent !== "function") {
      // Fallback: just seek to position
      handleSeek(marker.position);
      return;
    }
    // Jump timeline and trigger event focus
    const ratio = marker.position;
    if (ratio < 1) {
      hasCompletedRef.current = false;
    }
    anchorProgressRef.current = ratio;
    syncProgress(ratio, { forceSync: true });
    onJumpToEvent(marker.event);
  };

  return (
    <div
      style={{
        pointerEvents: "none",
        position: "fixed",
        insetInline: 0,
        bottom: 26,
        zIndex: 30,
        display: "flex",
        justifyContent: "center",
        padding: "0 18px 0",
      }}
    >
      <div
        className="glass"
        style={{
          pointerEvents: "auto",
          width: "760px",
          maxWidth: "100%",
          borderRadius: 14,
          padding: "12px 12px 10px",
          border: "1px solid rgba(0,229,255,0.13)",
          boxShadow: "0 14px 34px rgba(0,0,0,0.45), inset 0 0 0 1px rgba(255,255,255,0.02)",
          background:
            "linear-gradient(180deg, rgba(11,15,20,0.9), rgba(7,11,16,0.95))",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            minHeight: 36,
          }}
        >
          <button
            type="button"
            onClick={handlePlayPause}
            style={{
              width: 34,
              height: 34,
              borderRadius: 10,
              border: "1px solid rgba(0,229,255,0.34)",
              background: "linear-gradient(180deg, rgba(0,229,255,0.16), rgba(0,229,255,0.05))",
              color: "#00e5ff",
              fontFamily: "'DM Mono', monospace",
              fontSize: "0.82rem",
              boxShadow: "0 0 16px rgba(0,229,255,0.12)",
              cursor: "pointer",
              transition: "all 0.2s ease",
              flexShrink: 0,
            }}
          >
            {simRunning ? "II" : ">"}
          </button>

          <div
            style={{
              minWidth: 118,
              padding: "0 4px",
              borderRadius: 0,
              border: "none",
              background: "transparent",
              fontSize: "0.44rem",
              letterSpacing: "0.14em",
              color: "rgba(214,228,239,0.42)",
              textTransform: "uppercase",
              whiteSpace: "nowrap",
              flexShrink: 0,
              textAlign: "center",
            }}
          >
            {simRunning ? "Playback live" : "Simulation standby"}
          </div>

          <div
            style={{
              flex: 1,
              minWidth: 180,
              display: "grid",
              gap: 2,
              padding: "0 2px 0",
              borderRadius: 0,
              border: "none",
              background: "transparent",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "flex-end",
                gap: 10,
                transform: "translateY(-8px)",
                fontSize: "0.44rem",
                letterSpacing: "0.14em",
                textTransform: "uppercase",
              }}
            >
              <span style={{ color: "rgba(255,209,102,0.72)" }}>
                {simTimelineMarkers.length > 0
                  ? `${simTimelineMarkers.length} tracked approaches`
                  : "No pair events"}
              </span>
            </div>
            <SweepTimeline
              progress={timelineProgress}
              onSeek={handleSeek}
              markers={simTimelineMarkers}
              onMarkerClick={handleMarkerClick}
              showTimestampAnnotations={simTimelineMarkers.length > 0}
            />
          </div>

          <div
            style={{
              padding: "6px 10px",
              borderRadius: 999,
              border: "1px solid rgba(0,229,255,0.18)",
              background: "rgba(0,229,255,0.06)",
              fontSize: "0.54rem",
              letterSpacing: "0.16em",
              color: "rgba(111,241,255,0.88)",
              textTransform: "uppercase",
              whiteSpace: "nowrap",
              flexShrink: 0,
              boxShadow: "0 0 14px rgba(0,229,255,0.08)",
            }}
          >
            T+ {formatSimTime(timelineProgress)}
          </div>
        </div>

        <div
          style={{
            marginTop: 6,
            paddingTop: 6,
            borderTop: "1px solid rgba(0,229,255,0.08)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
            flexWrap: "nowrap",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexWrap: "nowrap",
              padding: "0",
              borderRadius: 12,
              border: "none",
              background: "transparent",
              minWidth: 0,
            }}
          >
            <span
              style={{
                fontSize: "0.48rem",
                letterSpacing: "0.14em",
                color: "rgba(200,214,229,0.42)",
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
              flexWrap: "nowrap",
              justifyContent: "flex-end",
              padding: "0",
              borderRadius: 12,
              border: "none",
              background: "transparent",
            }}
          >
            <CompactChip
              label="Focus Mode"
              onClick={onToggleFocusMode}
              active={focusMode}
            />
            <CompactChip label="Reset" onClick={handleReset} />
          </div>
        </div>
      </div>
    </div>
  );
}
