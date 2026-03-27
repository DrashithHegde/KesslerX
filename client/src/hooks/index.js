import { useState, useEffect, useRef, useCallback } from "react";
import { formatUTCTime } from "../utils/helpers";

// ─────────────────────────────────────────────────────────────────────────────
// useClock
// Returns a live UTC timestamp string, updated every second
// ─────────────────────────────────────────────────────────────────────────────
export function useClock() {
  const [time, setTime] = useState(formatUTCTime());

  useEffect(() => {
    const id = setInterval(() => setTime(formatUTCTime()), 1000);
    return () => clearInterval(id);
  }, []);

  return time;
}

// ─────────────────────────────────────────────────────────────────────────────
// useToast
// Manages a timed notification toast
// Returns: { message, phase, show }
// ─────────────────────────────────────────────────────────────────────────────
export function useToast(duration = 1500) {
  const [message, setMessage] = useState(null);
  const [phase, setPhase] = useState("in"); // "in" | "out"
  const timerRef = useRef(null);

  const show = useCallback((msg) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setMessage(msg);
    setPhase("in");

    timerRef.current = setTimeout(() => {
      setPhase("out");
      setTimeout(() => setMessage(null), 350);
    }, duration);
  }, [duration]);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  return { message, phase, show };
}

// ─────────────────────────────────────────────────────────────────────────────
// useIntro
// Manages the three-phase intro animation: "in" → "out" → "done"
// ─────────────────────────────────────────────────────────────────────────────
export function useIntro() {
  const [phase, setPhase] = useState("in");
  const [panelsVisible, setPanelsVisible] = useState(false);

  useEffect(() => {
    const t1 = setTimeout(() => setPhase("out"), 2200);
    const t2 = setTimeout(() => {
      setPhase("done");
      setPanelsVisible(true);
    }, 3100);

    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  return { phase, panelsVisible };
}