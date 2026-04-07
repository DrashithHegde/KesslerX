import { twoline2satrec } from "satellite.js/dist/io.js";
import {
  buildTargetAnalysis,
  buildTargetTimelineEvents,
} from "../utils/orbitalAnalysis";

let catalogVersion = "empty";
let workerRecords = [];
const analysisCache = new Map();
const workerScope = globalThis;

function normalizeObjectType(rawType) {
  if (rawType === "PAYLOAD") return "PAYLOAD";
  if (rawType === "ROCKET BODY") return "ROCKET BODY";
  if (rawType === "DEBRIS") return "DEBRIS";
  return "OTHER";
}

function buildWorkerRecords(records = []) {
  return records
    .filter((sat) => sat?.TLE_LINE1 && sat?.TLE_LINE2)
    .map((sat) => {
      try {
        return {
          satrec: twoline2satrec(sat.TLE_LINE1, sat.TLE_LINE2),
          type: normalizeObjectType(sat.OBJECT_TYPE),
          details: sat,
        };
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function handleSyncCatalog(message) {
  catalogVersion = message.catalogVersion || "unknown";
  workerRecords = buildWorkerRecords(message.records);
  analysisCache.clear();
}

function handleAnalyzeTarget(message) {
  const { requestId, targetNoradId, simulatedAt, windowStartAt } = message;
  const cacheKey = `${catalogVersion}:${targetNoradId}:${simulatedAt}:${windowStartAt}`;
  if (analysisCache.has(cacheKey)) {
    workerScope.postMessage({
      type: "analysisResult",
      requestId,
      payload: analysisCache.get(cacheKey),
    });
    return;
  }

  const target = workerRecords.find(
    (record) => String(record.details?.NORAD_CAT_ID) === String(targetNoradId)
  );
  if (!target) {
    workerScope.postMessage({
      type: "analysisResult",
      requestId,
      payload: null,
    });
    return;
  }

  const referenceDate = new Date(simulatedAt);
  const windowStartDate = new Date(windowStartAt);
  const analysis = buildTargetAnalysis(target, workerRecords, referenceDate);
  const timelineEvents = buildTargetTimelineEvents(target, workerRecords, windowStartDate);
  const payload = analysis
    ? {
      ...analysis,
      targetNoradId: target.details?.NORAD_CAT_ID ?? null,
      timelineEvents,
    }
    : null;

  analysisCache.set(cacheKey, payload);
  workerScope.postMessage({
    type: "analysisResult",
    requestId,
    payload,
  });
}

workerScope.onmessage = (event) => {
  const message = event.data || {};
  if (message.type === "syncCatalog") {
    handleSyncCatalog(message);
    return;
  }

  if (message.type === "analyzeTarget") {
    handleAnalyzeTarget(message);
  }
};
