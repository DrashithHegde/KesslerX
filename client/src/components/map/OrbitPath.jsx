import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { gstime, propagate } from "satellite.js/dist/propagation.js";
import { eciToGeodetic } from "satellite.js/dist/transforms.js";
import { SIM_WINDOW_HOURS } from "../../utils/simulationClock";

const ORBIT_PATH_UPDATE_INTERVAL_MS = 60;

function toReferenceTimeMs(referenceTime) {
  if (referenceTime instanceof Date) {
    return referenceTime.getTime();
  }

  const parsed = new Date(referenceTime).getTime();
  return Number.isFinite(parsed) ? parsed : Date.now();
}

// Custom shader material for past orbit with trailing fade-out
const PAST_FADE_VERTEX_SHADER = `
  attribute float alpha;
  varying float vAlpha;
  void main() {
    vAlpha = alpha;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const PAST_FADE_FRAGMENT_SHADER = `
  uniform vec3 uColor;
  uniform float uBaseOpacity;
  varying float vAlpha;
  void main() {
    gl_FragColor = vec4(uColor, uBaseOpacity * vAlpha);
  }
`;

// ─────────────────────────────────────────────────────────────────────────────
// OrbitPath — renders the orbital trajectory of a satellite
// Past: solid, dim, with smooth fade-out at the trailing end
// Future: dotted/dashed, brighter (optional via showFuture prop)
// ─────────────────────────────────────────────────────────────────────────────

export default function OrbitPath({
  satrec,
  color = "#46f3ff",
  opacity = 0.8,
  pastColor = "#46f3ff",
  futureColor = "#46f3ff",
  referenceTime = new Date(),
  simTimeRef = null,
  simBaseTimeMs,
  showFuture = true,
}) {
  const dashedLineRef = useRef();
  const dashedGlowLineRef = useRef();
  const lastPathUpdateRef = useRef(0);
  const baseReferenceTimeMs = useMemo(() => toReferenceTimeMs(referenceTime), [referenceTime]);
  const [activeReferenceTimeMs, setActiveReferenceTimeMs] = useState(baseReferenceTimeMs);

  useEffect(() => {
    lastPathUpdateRef.current = baseReferenceTimeMs;
    setActiveReferenceTimeMs(baseReferenceTimeMs);
  }, [baseReferenceTimeMs, satrec]);

  useFrame(() => {
    const liveReferenceTimeMs = Number(simTimeRef?.current);
    if (!Number.isFinite(liveReferenceTimeMs)) return;
    if (Math.abs(liveReferenceTimeMs - lastPathUpdateRef.current) < ORBIT_PATH_UPDATE_INTERVAL_MS) {
      return;
    }

    lastPathUpdateRef.current = liveReferenceTimeMs;
    setActiveReferenceTimeMs((current) =>
      Math.abs(current - liveReferenceTimeMs) < 1 ? current : liveReferenceTimeMs
    );
  });

  const { pastPoints, periodMs } = useMemo(() => {
    if (!satrec) return { pastPoints: [], periodMs: 90 * 60 * 1000 };

    const now = new Date(activeReferenceTimeMs);
    const pastPts = [];

    // Approximate orbital period from mean motion (rev/day)
    const meanMotion = satrec.no * (1440.0 / (2.0 * Math.PI));
    const periodMinutes = meanMotion > 0 ? 1440.0 / meanMotion : 90;
    const pMs = periodMinutes * 60 * 1000;

    const steps = 200;

    // --- PAST PATH ---
    // Always generate exactly 1 full revolution to ensure stable geometry
    const stepMs = pMs / steps;
    for (let i = steps; i >= 0; i--) {
      const t = new Date(now.getTime() - i * stepMs);
      try {
        const gmst = gstime(t);
        const pv = propagate(satrec, t);
        const posEci = pv.position;
        if (!posEci) continue;

        const gd = eciToGeodetic(posEci, gmst);
        const r = 1 + gd.height / 6371;
        const lat = gd.latitude;
        const lon = gd.longitude;

        const x = r * Math.cos(lat) * Math.cos(lon);
        const z = r * Math.cos(lat) * Math.sin(lon);
        const y = r * Math.sin(lat);

        const pt = new THREE.Vector3(x, y, -z);
        pt.timestampMs = t.getTime();
        pastPts.push(pt);
      } catch {
        continue;
      }
    }

    return { pastPoints: pastPts, periodMs: pMs };
  }, [activeReferenceTimeMs, satrec, simBaseTimeMs]);

  // --- FIXED FUTURE VECTOR PATH ---
  // Calculates an absolute coordinate path spanning exactly simBaseTimeMs -> simBaseTimeMs + 6hrs.
  // We NEVER re-calculate this frame by frame so the geometric lines/distance-offsets stay frozen.
  const futureFixedPoints = useMemo(() => {
    if (!satrec || !showFuture) return [];

    const fixedPts = [];
    const fixedStartTimeMs = Number.isFinite(simBaseTimeMs) ? simBaseTimeMs : new Date().getTime();
    const futureDurationMs = SIM_WINDOW_HOURS * 60 * 60 * 1000;
    const futureSteps = 400; // high res for smooth clipping

    for (let i = 0; i <= futureSteps; i++) {
      const tMs = fixedStartTimeMs + i * (futureDurationMs / futureSteps);
      const tDate = new Date(tMs);
      try {
        const gmst = gstime(tDate);
        const pv = propagate(satrec, tDate);
        const posEci = pv.position;
        if (!posEci) continue;

        const gd = eciToGeodetic(posEci, gmst);
        const r = 1 + gd.height / 6371;
        const x = r * Math.cos(gd.latitude) * Math.cos(gd.longitude);
        const z = r * Math.cos(gd.latitude) * Math.sin(gd.longitude);
        const y = r * Math.sin(gd.latitude);
        fixedPts.push(new THREE.Vector3(x, y, -z));
      } catch {
        continue;
      }
    }
    return fixedPts;
  }, [satrec, showFuture, simBaseTimeMs]);

  // Math out which exact point slice we are currently flying over
  const activeFutureSliceIndex = useMemo(() => {
    if (futureFixedPoints.length < 2) return 0;
    const fixedStartTimeMs = Number.isFinite(simBaseTimeMs) ? simBaseTimeMs : activeReferenceTimeMs;
    const elapsedMs = activeReferenceTimeMs - fixedStartTimeMs;
    const futureDurationMs = SIM_WINDOW_HOURS * 60 * 60 * 1000;
    const futureSteps = 400;
    
    let startIndex = Math.floor((elapsedMs / futureDurationMs) * futureSteps);
    return Math.max(0, Math.min(startIndex, futureFixedPoints.length - 2));
  }, [activeReferenceTimeMs, simBaseTimeMs, futureFixedPoints.length]);

  // Tube geometry needs a natively truncated array since it generates full poly surfaces
  const activeFuturePoints = useMemo(() => {
    if (futureFixedPoints.length < 2) return [];
    return futureFixedPoints.slice(activeFutureSliceIndex);
  }, [futureFixedPoints, activeFutureSliceIndex]);

  // Filter out any past points that occurred before the true simulation start.
  // This gracefully masks out the past trace before the user hits "play".
  const validPastPoints = useMemo(() => {
    return pastPoints.filter(pt => pt.timestampMs >= simBaseTimeMs);
  }, [pastPoints, simBaseTimeMs]);

  // Past orbit geometry with per-vertex alpha for trailing fade-out
  const pastFadeGeometry = useMemo(() => {
    if (validPastPoints.length < 2) return null;
    const geometry = new THREE.BufferGeometry().setFromPoints(validPastPoints);
    const alphas = new Float32Array(validPastPoints.length);
    
    // First 35% of the orbit is the natural fade zone (starting from 1 rev ago backwards)
    const fadeZone = 0.35; 

    for (let i = 0; i < validPastPoints.length; i++) {
      // 0 = oldest point of the trailing curve, 1 = newest point (current pos)
      const t = i / (validPastPoints.length - 1); 

      // Apply the smooth trailing fade out for the oldest 35%
      if (t < fadeZone) {
        const fadeT = t / fadeZone;
        alphas[i] = fadeT * fadeT * (3 - 2 * fadeT); 
      } else {
        alphas[i] = 1.0;
      }
    }
    
    geometry.setAttribute("alpha", new THREE.BufferAttribute(alphas, 1));
    return geometry;
  }, [validPastPoints]);

  // Past tube geometry (dim glow tube underneath)
  const pastTubeGeometry = useMemo(() => {
    if (validPastPoints.length < 2) return null;
    const curve = new THREE.CatmullRomCurve3(validPastPoints);
    return new THREE.TubeGeometry(curve, validPastPoints.length * 2, 0.003, 8, false);
  }, [validPastPoints]);

  // Past fade shader uniforms
  const pastFadeUniforms = useMemo(() => ({
    uColor: { value: new THREE.Color(pastColor || color) },
    uBaseOpacity: { value: opacity * 0.45 },
  }), [pastColor, color, opacity]);

  const pastFadeGlowUniforms = useMemo(() => ({
    uColor: { value: new THREE.Color(pastColor || color) },
    uBaseOpacity: { value: opacity * 0.18 },
  }), [pastColor, color, opacity]);

  const futureGeometry = useMemo(() => {
    if (futureFixedPoints.length < 2) return null;
    return new THREE.BufferGeometry().setFromPoints(futureFixedPoints);
  }, [futureFixedPoints]);

  const futureTubeGeometry = useMemo(() => {
    if (activeFuturePoints.length < 2) return null;
    const curve = new THREE.CatmullRomCurve3(activeFuturePoints);
    return new THREE.TubeGeometry(curve, activeFuturePoints.length * 2, 0.003, 8, false);
  }, [activeFuturePoints]);



  useEffect(() => {
    // For LineDashedMaterial, line distances must be computed on the Line object.
    // Because futureGeometry is derived from fixed mathematical coordinates, 
    // it always computes cumulative distances from the same anchor point at simBaseTime!
    if (dashedLineRef.current) {
      dashedLineRef.current.computeLineDistances();
    }
    if (dashedGlowLineRef.current) {
      dashedGlowLineRef.current.computeLineDistances();
    }
  }, [futureGeometry]);

  useEffect(() => {
    // Dynamically clip the drawn range of the fixed future geometry
    // This perfectly masks the lines rendering without recalculating distances.
    if (futureGeometry && futureFixedPoints.length > 0) {
      const count = futureFixedPoints.length - activeFutureSliceIndex;
      futureGeometry.setDrawRange(activeFutureSliceIndex, count);
    }
  }, [futureGeometry, activeFutureSliceIndex, futureFixedPoints.length]);

  if (!pastFadeGeometry && !futureGeometry) return null;

  return (
    <group>
      {/* Past orbit — dim solid with smooth trailing fade-out */}
      {pastTubeGeometry && (
        <mesh geometry={pastTubeGeometry} renderOrder={9} frustumCulled={false}>
          <meshBasicMaterial
            color={pastColor || color}
            transparent
            opacity={opacity * 0.1}
            toneMapped={false}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
      )}

      {pastFadeGeometry && (
        <>
          <line geometry={pastFadeGeometry} frustumCulled={false} renderOrder={10}>
            <shaderMaterial
              vertexShader={PAST_FADE_VERTEX_SHADER}
              fragmentShader={PAST_FADE_FRAGMENT_SHADER}
              uniforms={pastFadeUniforms}
              transparent
              depthWrite={false}
              depthTest
              toneMapped={false}
              blending={THREE.AdditiveBlending}
            />
          </line>
          <line geometry={pastFadeGeometry} frustumCulled={false} renderOrder={10}>
            <shaderMaterial
              vertexShader={PAST_FADE_VERTEX_SHADER}
              fragmentShader={PAST_FADE_FRAGMENT_SHADER}
              uniforms={pastFadeGlowUniforms}
              transparent
              depthWrite={false}
              depthTest
              toneMapped={false}
              blending={THREE.AdditiveBlending}
            />
          </line>
        </>
      )}

      {/* Future orbit — dotted / dashed, brighter */}
      {showFuture && futureGeometry && (
        <>
          {futureTubeGeometry && (
            <mesh
              geometry={futureTubeGeometry}
              renderOrder={10}
              frustumCulled={false}
            >
              <meshBasicMaterial
                color={futureColor || color}
                transparent
                opacity={opacity * 0.2}
                toneMapped={false}
                blending={THREE.AdditiveBlending}
                depthWrite={false}
              />
            </mesh>
          )}
          <line
            ref={dashedLineRef}
            geometry={futureGeometry}
            frustumCulled={false}
            renderOrder={11}
          >
            <lineDashedMaterial
              color={futureColor || color}
              transparent={true}
              opacity={opacity}
              dashSize={0.05}
              gapSize={0.035}
              depthWrite={false}
              depthTest={true}
              toneMapped={false}
              blending={THREE.AdditiveBlending}
            />
          </line>
          <line
            ref={dashedGlowLineRef}
            geometry={futureGeometry}
            frustumCulled={false}
            renderOrder={11}
          >
            <lineDashedMaterial
              color={futureColor || color}
              transparent={true}
              opacity={opacity * 0.28}
              dashSize={0.05}
              gapSize={0.035}
              depthWrite={false}
              depthTest={true}
              toneMapped={false}
              blending={THREE.AdditiveBlending}
            />
          </line>
        </>
      )}
    </group>
  );
}
