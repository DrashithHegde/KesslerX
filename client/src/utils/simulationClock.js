export const SIM_WINDOW_HOURS = 6;
export const SIM_WINDOW_MS = SIM_WINDOW_HOURS * 60 * 60 * 1000;
export const TIMELINE_DURATION_MS = 20000;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function progressToSimTimeMs(baseTimeMs, progress) {
  return baseTimeMs + clamp(progress, 0, 1) * SIM_WINDOW_MS;
}
