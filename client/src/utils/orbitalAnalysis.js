import { gstime, propagate } from "satellite.js/dist/propagation.js";
import { eciToGeodetic } from "satellite.js/dist/transforms.js";

const EARTH_RADIUS_KM = 6371;
const SCREENING_WINDOW_MINUTES = 90;
const SCREENING_STEP_MINUTES = 5;
const SCREENING_CANDIDATE_LIMIT = 24;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function round(value, digits = 1) {
  if (!Number.isFinite(value)) return null;
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function degrees(radians) {
  return (radians * 180) / Math.PI;
}

function distanceKm(positionA, positionB) {
  if (!positionA || !positionB) return Infinity;

  const dx = positionA[0] - positionB[0];
  const dy = positionA[1] - positionB[1];
  const dz = positionA[2] - positionB[2];

  return Math.sqrt(dx * dx + dy * dy + dz * dz) * EARTH_RADIUS_KM;
}

function describeObjectType(type) {
  if (type === "PAYLOAD") return "Operational payload";
  if (type === "ROCKET BODY") return "Rocket body";
  if (type === "DEBRIS") return "Tracked debris";
  return "Unclassified object";
}

export function getObjectTypeColor(type) {
  if (type === "PAYLOAD") return "#6395EE";
  if (type === "ROCKET BODY") return "#00FF7A";
  if (type === "DEBRIS") return "#b08a6b";
  return "#94a3b8";
}

export function getRiskBand(score) {
  if (score >= 80) return "SEVERE";
  if (score >= 60) return "HIGH";
  if (score >= 40) return "ELEVATED";
  return "LOW";
}

export function getRiskColor(score) {
  if (score >= 80) return "#ff5f57";
  if (score >= 60) return "#ff8c42";
  if (score >= 40) return "#ffd166";
  return "#00d1ff";
}

export function getOrbitalRegime(altitudeKm) {
  if (!Number.isFinite(altitudeKm)) return "UNKNOWN";
  if (altitudeKm < 2000) return "LEO";
  if (altitudeKm < 35786) return "MEO";
  if (altitudeKm < 36050) return "GEO";
  return "HIGH EARTH";
}

export function formatUtc(dateLike) {
  const date = dateLike instanceof Date ? dateLike : new Date(dateLike);
  if (Number.isNaN(date.getTime())) return "--";

  const part = (value) => String(value).padStart(2, "0");
  return (
    `${date.getUTCFullYear()}-${part(date.getUTCMonth() + 1)}-${part(date.getUTCDate())} ` +
    `${part(date.getUTCHours())}:${part(date.getUTCMinutes())}:${part(date.getUTCSeconds())}Z`
  );
}

export function getLaunchAgeYears(launchDate) {
  if (!launchDate) return null;

  const parsed = new Date(launchDate);
  if (Number.isNaN(parsed.getTime())) return null;

  const diffMs = Date.now() - parsed.getTime();
  return round(diffMs / (365.25 * 24 * 60 * 60 * 1000), 1);
}

export function getPropagationSnapshot(satrec, date = new Date()) {
  try {
    const gmst = gstime(date);
    const pv = propagate(satrec, date);
    if (!pv?.position) return null;

    const geodetic = eciToGeodetic(pv.position, gmst);
    const radius = 1 + geodetic.height / EARTH_RADIUS_KM;
    const lat = geodetic.latitude;
    const lon = geodetic.longitude;

    const position = [
      radius * Math.cos(lat) * Math.cos(lon),
      radius * Math.sin(lat),
      -radius * Math.cos(lat) * Math.sin(lon),
    ];

    let speedKps = null;
    if (pv.velocity) {
      speedKps = Math.sqrt(
        pv.velocity.x ** 2 + pv.velocity.y ** 2 + pv.velocity.z ** 2
      );
    }

    return {
      position,
      altitudeKm: round(geodetic.height, 1),
      latitudeDeg: round(degrees(lat), 2),
      longitudeDeg: round(degrees(lon), 2),
      speedKps: round(speedKps, 2),
    };
  } catch {
    return null;
  }
}

function separationRiskScore(separationKm) {
  if (!Number.isFinite(separationKm)) return 0;
  if (separationKm <= 10) return 100;
  if (separationKm <= 25) return 92;
  if (separationKm <= 50) return 84;
  if (separationKm <= 100) return 72;
  if (separationKm <= 200) return 54;
  if (separationKm <= 500) return 32;
  return 14;
}

function candidateScore(targetState, candidateState) {
  const altitudeDelta = Math.abs(candidateState.altitudeKm - targetState.altitudeKm);
  const separation = distanceKm(targetState.position, candidateState.position);
  return altitudeDelta * 1.35 + separation * 0.18;
}

function buildRiskDrivers({
  target,
  shellPopulation,
  shellDebrisCount,
  closestApproach,
  uncertaintyScore,
}) {
  const drivers = [];

  if (closestApproach) {
    drivers.push(
      `Tracked screening found ${closestApproach.objectName} reaching a sampled minimum separation of ${closestApproach.minSeparationKm} km in the next ${SCREENING_WINDOW_MINUTES} minutes.`
    );
  }

  if (shellPopulation >= 25) {
    drivers.push(
      `The selected object sits inside a dense altitude shell with ${shellPopulation} tracked neighbors within +/-100 km.`
    );
  } else if (shellPopulation >= 10) {
    drivers.push(
      "The altitude shell is moderately populated, increasing conjunction screening workload around this object."
    );
  } else {
    drivers.push(
      "Tracked population in the immediate altitude shell is limited, so observed conjunction pressure is currently contained."
    );
  }

  if (shellDebrisCount > 0) {
    drivers.push(
      `Tracked debris accounts for ${shellDebrisCount} nearby shell objects, which raises uncertainty about fragment-rich traffic in this regime.`
    );
  }

  if (target.type === "PAYLOAD") {
    drivers.push(
      "Because the target is an operational payload, collision consequence is elevated even when the screening signal is moderate."
    );
  }

  if (uncertaintyScore >= 65) {
    drivers.push(
      "The uncertainty model is elevated, indicating debris-dense surroundings where untracked fragments are more plausible."
    );
  }

  return drivers;
}

function buildMitigations({ riskBand, target, closestApproach }) {
  const actions = [];

  if (closestApproach && closestApproach.sampledTcaMinutes !== null) {
    actions.push(
      `Prioritize manual review of the closest screened approach before T+${closestApproach.sampledTcaMinutes} min to confirm whether higher-fidelity conjunction analysis is required.`
    );
  }

  if (riskBand === "SEVERE" || riskBand === "HIGH") {
    actions.push(
      "Increase propagation cadence and compare against a higher-precision conjunction workflow before committing to mission operations in this window."
    );
    actions.push(
      "Prepare a small radial or along-track maneuver option so the vehicle can respond if the conjunction trend tightens."
    );
  }

  if (target.type === "PAYLOAD") {
    actions.push(
      "Protect mission value by keeping collision-avoidance authority, contact windows, and maneuver fuel margins available."
    );
  } else {
    actions.push(
      "Track this object as an environmental hazard source and flag it for future conjunction screening against active payloads."
    );
  }

  actions.push(
    "Treat the uncertainty score as a debris-surveillance cue, not an exact collision forecast; the model is designed for risk triage under incomplete tracking."
  );

  return actions;
}

function buildSummary({
  target,
  regime,
  closestApproach,
  riskBand,
  shellPopulation,
  uncertaintyScore,
}) {
  if (closestApproach) {
    return `${describeObjectType(target.type)} ${target.details.OBJECT_NAME} is operating in ${regime}. Screened conjunction risk is ${riskBand.toLowerCase()} because the nearest tracked object reaches ${closestApproach.minSeparationKm} km and the surrounding shell contains ${shellPopulation} tracked objects with an uncertainty score of ${uncertaintyScore}.`;
  }

  return `${describeObjectType(target.type)} ${target.details.OBJECT_NAME} is operating in ${regime}. No tight screened conjunction was found in the current ${SCREENING_WINDOW_MINUTES}-minute window, but uncertainty remains ${riskBand === "LOW" ? "manageable" : "elevated"} due to incomplete debris visibility.`;
}

export function buildDatasetStats(records, datasetMeta = {}) {
  const byType = {
    PAYLOAD: 0,
    "ROCKET BODY": 0,
    DEBRIS: 0,
    OTHER: 0,
  };

  for (const record of records) {
    const type = record.type && byType[record.type] !== undefined ? record.type : "OTHER";
    byType[type] += 1;
  }

  const totalTracked = records.length;
  const debrisShare = totalTracked > 0 ? round((byType.DEBRIS / totalTracked) * 100, 1) : 0;

  return {
    totalTracked,
    byType,
    debrisShare,
    status: datasetMeta.status || "idle",
    cached: Boolean(datasetMeta.cached),
    cacheAgeSeconds: datasetMeta.cacheAgeSeconds ?? null,
    generatedAt: datasetMeta.generatedAt ?? null,
    fetchWindowOpen: datasetMeta.fetchWindowOpen ?? null,
    error: datasetMeta.error ?? null,
  };
}

export function buildTargetAnalysis(target, records) {
  if (!target?.satrec) return null;

  const now = new Date();
  const targetNow = getPropagationSnapshot(target.satrec, now);
  if (!targetNow) return null;

  const targetLaunchAgeYears = getLaunchAgeYears(target.details.LAUNCH_DATE);
  const regime = getOrbitalRegime(targetNow.altitudeKm);

  const candidateStates = [];
  for (const candidate of records) {
    if (!candidate?.satrec) continue;
    if (candidate.details.NORAD_CAT_ID === target.details.NORAD_CAT_ID) continue;

    const state = getPropagationSnapshot(candidate.satrec, now);
    if (!state) continue;

    candidateStates.push({
      target: candidate,
      state,
      currentSeparationKm: round(distanceKm(targetNow.position, state.position), 1),
      altitudeDeltaKm: round(Math.abs(state.altitudeKm - targetNow.altitudeKm), 1),
    });
  }

  const shellPopulation = candidateStates.filter(
    (candidate) => candidate.altitudeDeltaKm <= 100
  );
  const shellDebrisCount = shellPopulation.filter(
    (candidate) => candidate.target.type === "DEBRIS"
  ).length;
  const closeShellCount = candidateStates.filter(
    (candidate) => candidate.altitudeDeltaKm <= 50
  ).length;

  const shortlist = [...candidateStates]
    .sort(
      (left, right) =>
        candidateScore(targetNow, left.state) - candidateScore(targetNow, right.state)
    )
    .slice(0, SCREENING_CANDIDATE_LIMIT);

  const screeningTimes = [];
  const targetSamples = [];
  for (let minute = 0; minute <= SCREENING_WINDOW_MINUTES; minute += SCREENING_STEP_MINUTES) {
    const sampleTime = new Date(now.getTime() + minute * 60 * 1000);
    screeningTimes.push(minute);
    targetSamples.push(getPropagationSnapshot(target.satrec, sampleTime));
  }

  let closestApproach = null;
  const riskTimeline = screeningTimes.map(() => 0);

  for (const candidate of shortlist) {
    let candidateBest = null;

    for (let index = 0; index < screeningTimes.length; index += 1) {
      const targetState = targetSamples[index];
      const candidateState = getPropagationSnapshot(
        candidate.target.satrec,
        new Date(now.getTime() + screeningTimes[index] * 60 * 1000)
      );
      if (!targetState || !candidateState) continue;

      const separationKm = round(
        distanceKm(targetState.position, candidateState.position),
        1
      );
      riskTimeline[index] = Math.max(riskTimeline[index], separationRiskScore(separationKm));

      if (!candidateBest || separationKm < candidateBest.minSeparationKm) {
        candidateBest = {
          objectName: candidate.target.details.OBJECT_NAME || "UNKNOWN OBJECT",
          objectType: candidate.target.type,
          noradId: candidate.target.details.NORAD_CAT_ID,
          currentSeparationKm: candidate.currentSeparationKm,
          minSeparationKm: separationKm,
          sampledTcaMinutes: screeningTimes[index],
          altitudeDeltaKm: candidate.altitudeDeltaKm,
        };
      }
    }

    if (
      candidateBest &&
      (!closestApproach ||
        candidateBest.minSeparationKm < closestApproach.minSeparationKm)
    ) {
      closestApproach = candidateBest;
    }
  }

  const shellDensityScore = clamp(closeShellCount * 2.8 + shellPopulation.length * 0.6, 0, 34);
  const uncertaintyScore = clamp(
    18 +
      shellPopulation.length * 0.55 +
      (shellPopulation.length > 0
        ? (shellDebrisCount / shellPopulation.length) * 48
        : 0),
    0,
    100
  );
  const closestScore = closestApproach
    ? separationRiskScore(closestApproach.minSeparationKm) * 0.32
    : 0;
  const consequenceScore =
    target.type === "PAYLOAD" ? 24 : target.type === "ROCKET BODY" ? 16 : 12;
  const riskScore = round(
    clamp(consequenceScore + shellDensityScore + closestScore + uncertaintyScore * 0.35, 0, 100),
    1
  );
  const riskBand = getRiskBand(riskScore);
  const riskColor = getRiskColor(riskScore);

  return {
    sampledAt: now.toISOString(),
    regime,
    riskScore,
    riskBand,
    riskColor,
    currentState: targetNow,
    launchAgeYears: targetLaunchAgeYears,
    shellPopulation: shellPopulation.length,
    shellDebrisCount,
    closeShellCount,
    uncertaintyScore: round(uncertaintyScore, 1),
    closestApproach,
    riskTimeline,
    screeningTimes,
    summary: buildSummary({
      target,
      regime,
      closestApproach,
      riskBand,
      shellPopulation: shellPopulation.length,
      uncertaintyScore: round(uncertaintyScore, 1),
    }),
    drivers: buildRiskDrivers({
      target,
      shellPopulation: shellPopulation.length,
      shellDebrisCount,
      closestApproach,
      uncertaintyScore: round(uncertaintyScore, 1),
    }),
    mitigations: buildMitigations({ riskBand, target, closestApproach }),
    note:
      "This briefing uses tracked-object screening plus a debris-density heuristic. It prioritizes operational risk under uncertainty instead of claiming exact collision prediction.",
  };
}
