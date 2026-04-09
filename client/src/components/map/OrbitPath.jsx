import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { gstime, propagate } from "satellite.js/dist/propagation.js";
import { eciToGeodetic } from "satellite.js/dist/transforms.js";

const ORBIT_PATH_UPDATE_INTERVAL_MS = 60;

function toReferenceTimeMs(referenceTime) {
  if (referenceTime instanceof Date) {
    return referenceTime.getTime();
  }

  const parsed = new Date(referenceTime).getTime();
  return Number.isFinite(parsed) ? parsed : Date.now();
}

// ─────────────────────────────────────────────────────────────────────────────
// OrbitPath — renders the orbital trajectory of a satellite as a glowing line
// ─────────────────────────────────────────────────────────────────────────────

export default function OrbitPath({
  satrec,
  color = "#46f3ff",
  opacity = 0.8,
  pastColor = "#46f3ff",
  futureColor = "#46f3ff",
  referenceTime = new Date(),
  simTimeRef = null,
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

  const { pastPoints, futurePoints } = useMemo(() => {
    if (!satrec) return { pastPoints: [], futurePoints: [] };

    const now = new Date(activeReferenceTimeMs);
    const pastPts = [];
    const futurePts = [];

    // Approximate orbital period from mean motion (rev/day)
    const meanMotion = satrec.no * (1440.0 / (2.0 * Math.PI));
    const periodMinutes = meanMotion > 0 ? 1440.0 / meanMotion : 90;

    // One orbit into the past and one into the future
    const steps = 200;
    const stepMs = (periodMinutes * 60 * 1000) / steps;

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

        pastPts.push(new THREE.Vector3(x, y, -z));
      } catch {
        continue;
      }
    }

    for (let i = 0; i <= steps; i++) {
      const t = new Date(now.getTime() + i * stepMs);
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

        futurePts.push(new THREE.Vector3(x, y, -z));
      } catch {
        continue;
      }
    }

    return { pastPoints: pastPts, futurePoints: futurePts };
  }, [activeReferenceTimeMs, satrec]);

  const pastGeometry = useMemo(() => {
    if (pastPoints.length < 2) return null;
    return new THREE.BufferGeometry().setFromPoints(pastPoints);
  }, [pastPoints]);

  const pastTubeGeometry = useMemo(() => {
    if (pastPoints.length < 2) return null;
    const curve = new THREE.CatmullRomCurve3(pastPoints);
    return new THREE.TubeGeometry(curve, pastPoints.length * 2, 0.0045, 8, false);
  }, [pastPoints]);

  const futureGeometry = useMemo(() => {
    if (futurePoints.length < 2) return null;
    return new THREE.BufferGeometry().setFromPoints(futurePoints);
  }, [futurePoints]);

  const futureTubeGeometry = useMemo(() => {
    if (futurePoints.length < 2) return null;
    const curve = new THREE.CatmullRomCurve3(futurePoints);
    return new THREE.TubeGeometry(curve, futurePoints.length * 2, 0.003, 8, false);
  }, [futurePoints]);

  useEffect(() => {
    // For LineDashedMaterial, line distances must be computed on the Line object.
    if (dashedLineRef.current) {
      dashedLineRef.current.computeLineDistances();
    }
    if (dashedGlowLineRef.current) {
      dashedGlowLineRef.current.computeLineDistances();
    }
  }, [futureGeometry]);

  if (!pastGeometry && !futureGeometry) return null;

  return (
    <group>
      {/* Past orbit (solid) */}
      {pastTubeGeometry && (
        <mesh geometry={pastTubeGeometry} renderOrder={9} frustumCulled={false}>
          <meshBasicMaterial
            color={pastColor || color}
            transparent
            opacity={opacity * 0.25}
            toneMapped={false}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
      )}

      {pastGeometry && (
        <>
          <line geometry={pastGeometry} frustumCulled={false} renderOrder={10}>
            <lineBasicMaterial
              color={pastColor || color}
              transparent={true}
              opacity={opacity * 0.8}
              linewidth={2}
              depthWrite={false}
              depthTest={true}
              toneMapped={false}
              blending={THREE.AdditiveBlending}
            />
          </line>
          <line geometry={pastGeometry} frustumCulled={false} renderOrder={10}>
            <lineBasicMaterial
              color={pastColor || color}
              transparent={true}
              opacity={opacity * 0.35}
              linewidth={3}
              depthWrite={false}
              depthTest={true}
              toneMapped={false}
              blending={THREE.AdditiveBlending}
            />
          </line>
        </>
      )}

      {/* Future orbit (dotted / dashed) */}
      {futureGeometry && (
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
