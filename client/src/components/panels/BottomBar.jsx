import { useEffect, useRef, useState } from "react";

const TIMELINE_DURATION_MS = 20000; // baseline sweep length

function formatSimTime(progress) {
  const totalSeconds = Math.round(progress * 3600); // pretend 60-minute range
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function SpeedButton({ value, active, onClick }) {
  const base =
    "px-3 py-1 text-[0.65rem] tracking-[0.2em] uppercase rounded-md border transition-all duration-200";
  const state = active
    ? "border-[#00D1FF]/80 text-[#00D1FF] shadow-[0_0_12px_rgba(0,209,255,0.4)] bg-[#00D1FF]/10"
    : "border-white/10 text-white/60 hover:border-[#00D1FF]/50";
  return (
    <button type="button" onClick={() => onClick(value)} className={`${base} ${state}`}>
      {value}x
    </button>
  );
}

function ScenarioButton({ label, onClick, tone = "default" }) {
  const base =
    "flex-1 min-w-[120px] px-3 py-2 text-[0.58rem] tracking-[0.2em] uppercase rounded-lg border transition-all duration-200";
  const state =
    tone === "warning"
      ? "border-[#FF8C42]/70 text-[#FF8C42] bg-[#FF8C42]/10 hover:bg-[#FF8C42]/20 shadow-[0_0_14px_rgba(255,140,66,0.35)]"
      : "border-white/10 text-white/70 hover:border-[#00D1FF]/50 hover:text-[#00D1FF]";
  return (
    <button type="button" onClick={onClick} className={`${base} ${state}`}>
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
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-[0.55rem] uppercase tracking-[0.3em] text-white/50">
        <span>Timeline</span>
        <span>Δ {formatSimTime(progress)}</span>
      </div>
      <div
        ref={trackRef}
        onClick={handleClick}
        className="relative h-2 rounded-full bg-white/10 cursor-pointer"
      >
        <div
          className="absolute left-0 top-0 h-full rounded-full bg-gradient-to-r from-[#00D1FF]/70 to-[#00D1FF]/30"
          style={{ width: `${progress * 100}%` }}
        />
        <div
          className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border border-[#00D1FF] bg-[#0B0F14] shadow-[0_0_12px_rgba(0,209,255,0.6)]"
          style={{ left: `calc(${progress * 100}% - 8px)` }}
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
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center pb-6">
      <div className="pointer-events-auto w-[520px] max-w-[92vw] rounded-2xl border border-white/10 bg-[#0B0F14]/90 px-6 py-4 shadow-[0_8px_40px_rgba(0,0,0,0.65)] backdrop-blur-2xl">
        <div className="flex items-center justify-between text-[0.6rem] uppercase tracking-[0.4em] text-white/60">
          <span>Simulation Control</span>
          <span className="text-[#00D1FF]">T+ {formatSimTime(timelineProgress)}</span>
        </div>

        <div className="mt-3 flex items-center gap-4">
          <button
            type="button"
            onClick={handlePlayPause}
            className={`h-12 w-12 rounded-full border transition-all duration-200 shadow-[0_0_18px_rgba(0,209,255,0.35)] flex items-center justify-center text-lg ${
              simRunning
                ? "border-[#FF8C42]/60 text-[#FF8C42] bg-[#FF8C42]/10"
                : "border-[#00D1FF]/70 text-[#00D1FF] bg-[#00D1FF]/10"
            }`}
          >
            {simRunning ? "❚❚" : "▶"}
          </button>

          <div className="flex flex-1 flex-col gap-3">
            <Timeline progress={timelineProgress} onSeek={handleSeek} />
            <div className="flex items-center gap-3">
              <span className="text-[0.55rem] uppercase tracking-[0.3em] text-white/40">
                Speed
              </span>
              <div className="flex items-center gap-2">
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

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <ScenarioButton label="Inject Risk" onClick={onSimTriggerCollision} tone="warning" />
          <ScenarioButton label="Add Satellite" onClick={onSimAddSatellite} />
          <ScenarioButton label="Reset" onClick={handleReset} />
        </div>
      </div>
    </div>
  );
}
