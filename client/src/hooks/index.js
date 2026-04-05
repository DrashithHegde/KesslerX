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
  const hideTimerRef = useRef(null);
  const clearTimerRef = useRef(null);
  const tokenRef = useRef(0);

  const clearTimers = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    if (clearTimerRef.current) {
      clearTimeout(clearTimerRef.current);
      clearTimerRef.current = null;
    }
  }, []);

  const show = useCallback((msg) => {
    tokenRef.current += 1;
    const currentToken = tokenRef.current;

    clearTimers();
    setMessage(msg);
    setPhase("in");

    hideTimerRef.current = setTimeout(() => {
      if (tokenRef.current !== currentToken) return;
      setPhase("out");
      clearTimerRef.current = setTimeout(() => {
        if (tokenRef.current !== currentToken) return;
        setMessage(null);
        clearTimerRef.current = null;
      }, 350);
      hideTimerRef.current = null;
    }, duration);
  }, [clearTimers, duration]);

  const clear = useCallback(() => {
    tokenRef.current += 1;
    clearTimers();
    setMessage(null);
    setPhase("in");
  }, [clearTimers]);

  useEffect(() => {
    return () => {
      clearTimers();
    };
  }, [clearTimers]);

  return { message, phase, show, clear };
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
