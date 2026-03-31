import { useCallback, useEffect, useRef, useState } from "react";

function formatUtcTime(date = new Date()) {
  const part = (value) => String(value).padStart(2, "0");
  return (
    `${date.getUTCFullYear()}-${part(date.getUTCMonth() + 1)}-${part(date.getUTCDate())} ` +
    `${part(date.getUTCHours())}:${part(date.getUTCMinutes())}:${part(date.getUTCSeconds())}Z`
  );
}

export function useClock() {
  const [time, setTime] = useState(formatUtcTime());

  useEffect(() => {
    const id = setInterval(() => setTime(formatUtcTime()), 1000);
    return () => clearInterval(id);
  }, []);

  return time;
}

export function useToast(duration = 1500) {
  const [message, setMessage] = useState(null);
  const [phase, setPhase] = useState("in");
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

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return { message, phase, show };
}

export function useIntro() {
  const [phase, setPhase] = useState("in");

  useEffect(() => {
    const t1 = setTimeout(() => setPhase("out"), 2200);
    const t2 = setTimeout(() => {
      setPhase("done");
    }, 3100);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  return { phase };
}
