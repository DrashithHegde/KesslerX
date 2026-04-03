import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useLoader, useThree } from "@react-three/fiber";
import { OrbitControls, Sphere, Stars } from "@react-three/drei";
import * as THREE from "three";
import { twoline2satrec } from "satellite.js/dist/io.js";
import OrbitPath from "./OrbitPath";
import {
  buildDatasetStats,
  buildTargetAnalysis,
  getObjectTypeColor,
  getPropagationSnapshot,
} from "../../utils/orbitalAnalysis";
import {
  CRTEarthVertexShader,
  CRTEarthFragmentShader,
} from "./CRTEarthShader";

const EARTH_TEXTURE_URL =
  "https://unpkg.com/three-globe@2.41.12/example/img/earth-blue-marble.jpg";
const EARTH_RADIUS = 1;
const EARTH_POLAR_SCALE = 0.92;
const EARTH_STAR_OCCLUDER_RADIUS = EARTH_RADIUS - 0.003;
const MARKER_HUD_COLOR = "#d2882e";
const BASE_SATELLITE_RADIUS = 0.005;
const SELECTED_MARKER_RADIUS = 0.022;
const SELECTION_HALO_INNER_RADIUS = 0.05;
const SELECTION_HALO_OUTER_RADIUS = 0.068;
const NON_PAYLOAD_HIT_PIXEL_DIAMETER = 34;
const NON_PAYLOAD_HIT_SCALE_MIN = 1;
const NON_PAYLOAD_HIT_SCALE_MAX = 22;
const EARTH_OCCLUSION_RADIUS = EARTH_RADIUS * 1.01;
const SELECTED_MARKER_OCCLUSION_PADDING = SELECTED_MARKER_RADIUS;
const IMPACT_PROXIMITY_THRESHOLD_KM = 900;
const COLLISION_WAVE_THRESHOLD_KM = 1800;

function createPayloadMarkerSprite() {
  if (typeof document === "undefined") return null;

  const width = 34;
  const height = 24;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = MARKER_HUD_COLOR;

  const thickness = 2;
  const cornerLenH = 5;
  const cornerLenV = 4;
  const insetX = 4;
  const insetY = 3;

  ctx.fillRect(insetX, insetY, cornerLenH, thickness);
  ctx.fillRect(insetX, insetY, thickness, cornerLenV);
  ctx.fillRect(width - insetX - cornerLenH, insetY, cornerLenH, thickness);
  ctx.fillRect(width - insetX - thickness, insetY, thickness, cornerLenV);
  ctx.fillRect(insetX, height - insetY - thickness, cornerLenH, thickness);
  ctx.fillRect(insetX, height - insetY - cornerLenV, thickness, cornerLenV);
  ctx.fillRect(
    width - insetX - cornerLenH,
    height - insetY - thickness,
    cornerLenH,
    thickness
  );
  ctx.fillRect(
    width - insetX - thickness,
    height - insetY - cornerLenV,
    thickness,
    cornerLenV
  );

  return canvas.toDataURL("image/png");
}

function normalizeObjectType(rawType) {
  if (rawType === "PAYLOAD") return "PAYLOAD";
  if (rawType === "ROCKET BODY") return "ROCKET BODY";
  if (rawType === "DEBRIS") return "DEBRIS";
  return "OTHER";
}

function isOccludedByEarth(cameraPosition, targetPosition, padding = 0) {
  if (!cameraPosition || !targetPosition) return false;

  const radiusXZ = EARTH_OCCLUSION_RADIUS + padding;
  const radiusY = radiusXZ * EARTH_POLAR_SCALE;
  const invRadiusXZSq = 1 / (radiusXZ * radiusXZ);
  const invRadiusYSq = 1 / (radiusY * radiusY);

  const dx = targetPosition.x - cameraPosition.x;
  const dy = targetPosition.y - cameraPosition.y;
  const dz = targetPosition.z - cameraPosition.z;

  const a = (dx * dx + dz * dz) * invRadiusXZSq + dy * dy * invRadiusYSq;
  if (a <= 0) return false;

  const b =
    2 *
    ((cameraPosition.x * dx + cameraPosition.z * dz) * invRadiusXZSq +
      cameraPosition.y * dy * invRadiusYSq);
  const c =
    (cameraPosition.x * cameraPosition.x +
      cameraPosition.z * cameraPosition.z) *
      invRadiusXZSq +
    cameraPosition.y * cameraPosition.y * invRadiusYSq -
    1;
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return false;

  const sqrtDisc = Math.sqrt(discriminant);
  const t1 = (-b - sqrtDisc) / (2 * a);
  const t2 = (-b + sqrtDisc) / (2 * a);
  const tMin = Math.min(t1, t2);
  const tMax = Math.max(t1, t2);
  return (tMin >= 0 && tMin <= 1) || (tMax >= 0 && tMax <= 1);
}

function CRTEarth() {
  const earthRef = useRef();
  const materialRef = useRef();
  const texture = useLoader(THREE.TextureLoader, EARTH_TEXTURE_URL);

  useEffect(() => {
    if (!texture) return;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = true;
  }, [texture]);

  const uniforms = useMemo(
    () => ({
      uTexture: { value: texture },
      uTime: { value: 0 },
      uPixelation: { value: 800.0 },
      uScanlineIntensity: { value: 0.02 },
      uGrainIntensity: { value: 0.012 },
      uChromaticAberration: { value: 0.3 },
      uVignetteStrength: { value: 0.4 },
      uBrightness: { value: 1.25 },
      uOpacity: { value: 0.85 },
    }),
    [texture]
  );

  useFrame((_, delta) => {
    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value += delta;
    }
  });

  return (
    <group ref={earthRef} scale={[1, EARTH_POLAR_SCALE, 1]}>
      <Sphere args={[EARTH_STAR_OCCLUDER_RADIUS, 64, 64]}>
        <meshBasicMaterial colorWrite={false} depthWrite />
      </Sphere>

      <Sphere args={[EARTH_RADIUS, 64, 64]}>
        <shaderMaterial
          ref={materialRef}
          vertexShader={CRTEarthVertexShader}
          fragmentShader={CRTEarthFragmentShader}
          uniforms={uniforms}
          transparent
        />
      </Sphere>

      <Sphere args={[EARTH_RADIUS + 0.001, 48, 48]}>
        <meshBasicMaterial
          color="#88ccdd"
          wireframe
          transparent
          opacity={0.018}
        />
      </Sphere>
    </group>
  );
}

function distanceBetweenPositionsKm(left, right) {
  if (!left || !right) return Infinity;
  const dx = left[0] - right[0];
  const dy = left[1] - right[1];
  const dz = left[2] - right[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz) * 6371;
}

function lerpPosition(left, right, alpha) {
  return [
    left[0] + (right[0] - left[0]) * alpha,
    left[1] + (right[1] - left[1]) * alpha,
    left[2] + (right[2] - left[2]) * alpha,
  ];
}

function smoothstep(edge0, edge1, value) {
  const x = THREE.MathUtils.clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return x * x * (3 - 2 * x);
}

function zoneColor(score) {
  if (score >= 80) return "#ff6b5f";
  if (score >= 60) return "#ff9f43";
  return "#ffd166";
}

function UncertaintyZones({ zones = [] }) {
  const visibleZones = zones.slice(0, 3);

  return (
    <group>
      {visibleZones.map((zone, index) => {
        const radius = 1 + zone.shell_mid_km / 6371;
        const color = zoneColor(zone.uncertainty_score);
        const opacity = Math.max(0.012, 0.028 - index * 0.006);

        return (
          <mesh key={`${zone.shell_start_km}-${zone.shell_end_km}`} scale={[1, EARTH_POLAR_SCALE, 1]}>
            <sphereGeometry args={[radius, 40, 28]} />
            <meshBasicMaterial
              color={color}
              transparent
              opacity={opacity}
              depthWrite={false}
              toneMapped={false}
              side={THREE.DoubleSide}
            />
          </mesh>
        );
      })}
    </group>
  );
}

function SatelliteSwarm({
  satData,
  onSelectSatellite,
  onPayloadOverlayUpdate,
  onSelectionPing,
  simProgressRef,
  simOffsetHours,
}) {
  const { camera } = useThree();
  const meshRef = useRef();
  const hitboxRef = useRef();
  const satPositionsRef = useRef([]);
  const pointerDownPos = useRef({ x: 0, y: 0 });
  const overlayUpdateRef = useRef(0);
  const tmpWorldPos = useMemo(() => new THREE.Vector3(), []);
  const tmpCamPos = useMemo(() => new THREE.Vector3(), []);
  const tmpProjected = useMemo(() => new THREE.Vector3(), []);

  useEffect(() => {
    if (!meshRef.current || satData.length === 0) return;

    satData.forEach((sat, index) => {
      meshRef.current.setColorAt(index, sat.color);
    });
    meshRef.current.instanceColor.needsUpdate = true;
  }, [satData]);

  useEffect(() => {
    if (satData.length !== 0) return;
    onPayloadOverlayUpdate?.([]);
  }, [onPayloadOverlayUpdate, satData.length]);

  useFrame((state) => {
    if (!meshRef.current || !hitboxRef.current || satData.length === 0) return;

    const simProgress = simProgressRef?.current || 0;
    const offsetHours = simOffsetHours ?? simProgress * 6;
    const now = new Date(Date.now() + offsetHours * 3600 * 1000);
    const dummy = new THREE.Object3D();
    const overlayPayload = [];
    const viewport = state.size;
    const camPos = tmpCamPos.copy(state.camera.position);
    const tanHalfFov = Math.tan((state.camera.fov * Math.PI) / 360);

    satData.forEach((sat, index) => {
      const snapshot = getPropagationSnapshot(sat.satrec, now);
      if (!snapshot) return;

      tmpWorldPos.set(...snapshot.position);

      if (!satPositionsRef.current[index]) {
        satPositionsRef.current[index] = new THREE.Vector3();
      }
      satPositionsRef.current[index].copy(tmpWorldPos);

      const occluded = isOccludedByEarth(camPos, tmpWorldPos);
      const visibleScale = occluded ? 0.000001 : 1;

      dummy.position.copy(tmpWorldPos);
      dummy.scale.setScalar(visibleScale);
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(index, dummy.matrix);

      let hitScale = 1;
      if (!occluded && sat.type !== "PAYLOAD") {
        const dist = tmpWorldPos.distanceTo(camPos);
        const worldDiameter =
          (NON_PAYLOAD_HIT_PIXEL_DIAMETER * 2 * dist * tanHalfFov) /
          viewport.height;
        const desiredRadius = worldDiameter / 2;
        const scaleFromRadius = desiredRadius / BASE_SATELLITE_RADIUS;
        hitScale = THREE.MathUtils.clamp(
          scaleFromRadius,
          NON_PAYLOAD_HIT_SCALE_MIN,
          NON_PAYLOAD_HIT_SCALE_MAX
        );
      }

      dummy.scale.setScalar(occluded ? 0.000001 : hitScale);
      dummy.updateMatrix();
      hitboxRef.current.setMatrixAt(index, dummy.matrix);

      if (sat.type === "PAYLOAD" && !occluded) {
          tmpProjected.copy(tmpWorldPos).project(state.camera);
          const screenX = (tmpProjected.x * 0.5 + 0.5) * viewport.width;
          const screenY = (-tmpProjected.y * 0.5 + 0.5) * viewport.height;
          if (
            screenX >= 0 &&
            screenX <= viewport.width &&
            screenY >= 0 &&
            screenY <= viewport.height
          ) {
            overlayPayload.push({
              id: sat.details.NORAD_CAT_ID || `payload-${index}`,
              x: screenX,
              y: screenY,
              seed: Number(sat.details.NORAD_CAT_ID) || index + 1,
              sat,
            });
          }
      }
    });

    meshRef.current.instanceMatrix.needsUpdate = true;
    hitboxRef.current.instanceMatrix.needsUpdate = true;

    const elapsed = state.clock.getElapsedTime();
    if (elapsed - overlayUpdateRef.current > 0.05) {
      overlayUpdateRef.current = elapsed;
      onPayloadOverlayUpdate?.(overlayPayload);
    }
  });

  const isOccludedFromCamera = useCallback(
    (satPos) => isOccludedByEarth(camera.position, satPos),
    [camera]
  );

  const handlePointerDown = (event) => {
    pointerDownPos.current = { x: event.clientX, y: event.clientY };
  };

  const handleClick = (event) => {
    event.stopPropagation();

    const dx = event.clientX - pointerDownPos.current.x;
    const dy = event.clientY - pointerDownPos.current.y;
    if (dx * dx + dy * dy > 25) return;

    const instanceId = event.instanceId;
    if (instanceId === undefined || instanceId >= satData.length) return;

    const satPos = satPositionsRef.current[instanceId];
    if (isOccludedFromCamera(satPos)) return;

    onSelectionPing?.({ x: event.clientX, y: event.clientY });
    onSelectSatellite(satData[instanceId]);
  };

  if (satData.length === 0) return null;

  return (
    <>
      <instancedMesh key={`visual-${satData.length}`} ref={meshRef} args={[null, null, satData.length]}>
        <sphereGeometry args={[BASE_SATELLITE_RADIUS, 8, 8]} />
        <meshBasicMaterial color="#ffffff" toneMapped={false} />
      </instancedMesh>

      <instancedMesh
        key={`hitbox-${satData.length}`}
        ref={hitboxRef}
        args={[null, null, satData.length]}
        onPointerDown={handlePointerDown}
        onClick={handleClick}
      >
        <sphereGeometry args={[BASE_SATELLITE_RADIUS, 8, 8]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} depthTest={false} />
      </instancedMesh>
    </>
  );
}

function SelectionHalo({
  color = "#f5c842",
  innerRadius = SELECTION_HALO_INNER_RADIUS,
  outerRadius = SELECTION_HALO_OUTER_RADIUS,
  opacity = 0.65,
}) {
  const ringRef = useRef();
  const { camera } = useThree();

  useFrame((state) => {
    if (!ringRef.current) return;
    ringRef.current.quaternion.copy(camera.quaternion);
    const pulse = 1 + Math.sin(state.clock.elapsedTime * 2.8) * 0.12;
    ringRef.current.scale.set(pulse, pulse, pulse);
  });

  return (
    <mesh ref={ringRef}>
      <ringGeometry
        args={[innerRadius, outerRadius, 48]}
      />
      <meshBasicMaterial
        color={color}
        transparent
        opacity={opacity}
        toneMapped={false}
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </mesh>
  );
}

function SelectedSatelliteMarker({
  sat,
  simProgressRef,
  simOffsetHours = 0,
  referenceTime = null,
  color = "#f5c842",
  markerRadius = SELECTED_MARKER_RADIUS,
  haloInnerRadius = SELECTION_HALO_INNER_RADIUS,
  haloOuterRadius = SELECTION_HALO_OUTER_RADIUS,
  haloOpacity = 0.65,
  forceVisible = false,
}) {
  const markerRef = useRef();
  const { camera } = useThree();

  useFrame(() => {
    const simProgress = simProgressRef?.current || 0;
    const now =
      referenceTime instanceof Date
        ? referenceTime
        : new Date(Date.now() + (simOffsetHours ?? simProgress * 6) * 3600 * 1000);
    const nextSnapshot = getPropagationSnapshot(sat.satrec, now);
    if (!nextSnapshot || !markerRef.current) return;

    markerRef.current.position.set(...nextSnapshot.position);
    markerRef.current.visible = forceVisible
      ? true
      : !isOccludedByEarth(
          camera.position,
          markerRef.current.position,
          SELECTED_MARKER_OCCLUSION_PADDING
        );
  });

  return (
    <group ref={markerRef}>
      <mesh>
        <sphereGeometry args={[markerRadius, 16, 16]} />
        <meshBasicMaterial
          color={color}
          toneMapped={false}
          depthTest={!forceVisible}
          depthWrite
        />
      </mesh>

      <SelectionHalo
        color={color}
        innerRadius={haloInnerRadius}
        outerRadius={haloOuterRadius}
        opacity={haloOpacity}
      />
    </group>
  );
}

function PairLink({
  leftSat,
  rightSat,
  referenceTime,
  simOffsetHours = 0,
  simProgressRef,
  color = "#77dcff",
}) {
  const lineRef = useRef();
  const leftRef = useRef(new THREE.Vector3());
  const rightRef = useRef(new THREE.Vector3());

  useFrame(() => {
    if (!lineRef.current || !leftSat?.satrec || !rightSat?.satrec) return;

    const simProgress = simProgressRef?.current || 0;
    const now =
      referenceTime instanceof Date
        ? referenceTime
        : new Date(Date.now() + (simOffsetHours ?? simProgress * 6) * 3600 * 1000);

    const leftSnapshot = getPropagationSnapshot(leftSat.satrec, now);
    const rightSnapshot = getPropagationSnapshot(rightSat.satrec, now);
    if (!leftSnapshot || !rightSnapshot) return;

    leftRef.current.set(...leftSnapshot.position);
    rightRef.current.set(...rightSnapshot.position);

    const positions = lineRef.current.geometry.attributes.position.array;
    positions[0] = leftRef.current.x;
    positions[1] = leftRef.current.y;
    positions[2] = leftRef.current.z;
    positions[3] = rightRef.current.x;
    positions[4] = rightRef.current.y;
    positions[5] = rightRef.current.z;
    lineRef.current.geometry.attributes.position.needsUpdate = true;
    lineRef.current.computeLineDistances?.();
  });

  return (
    <line ref={lineRef} renderOrder={8}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[new Float32Array(6), 3]}
          count={2}
          itemSize={3}
        />
      </bufferGeometry>
      <lineBasicMaterial
        color={color}
        transparent
        opacity={0.75}
        depthTest={false}
        toneMapped={false}
      />
    </line>
  );
}

function CollisionPulse({ position }) {
  const coreRef = useRef();
  const shellRef = useRef();

  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    const pulse = (Math.sin(t * 2.4) + 1) * 0.5;

    if (coreRef.current) {
      const scale = 1 + pulse * 1.4;
      coreRef.current.scale.setScalar(scale);
      coreRef.current.material.opacity = 0.45 + pulse * 0.25;
    }

    if (shellRef.current) {
      const scale = 1.8 + pulse * 3.4;
      shellRef.current.scale.setScalar(scale);
      shellRef.current.material.opacity = 0.22 - pulse * 0.08;
    }
  });

  return (
    <group position={position}>
      <mesh ref={coreRef} renderOrder={9}>
        <sphereGeometry args={[0.02, 24, 24]} />
        <meshBasicMaterial
          color="#ff7b5f"
          transparent
          opacity={0.55}
          depthTest={false}
          toneMapped={false}
        />
      </mesh>
      <mesh ref={shellRef} renderOrder={8}>
        <sphereGeometry args={[0.03, 24, 24]} />
        <meshBasicMaterial
          color="#ffb36b"
          transparent
          wireframe
          opacity={0.18}
          depthTest={false}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

function StaticConnector({ start, end, color = "#ffd166", opacity = 0.45 }) {
  const positions = useMemo(
    () => new Float32Array([...start, ...end]),
    [end, start]
  );

  return (
    <line renderOrder={7}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
          count={2}
          itemSize={3}
        />
      </bufferGeometry>
      <lineBasicMaterial
        color={color}
        transparent
        opacity={opacity}
        depthTest={false}
        toneMapped={false}
      />
    </line>
  );
}

function CollisionSimulationOverlay({ data, startedAt }) {
  const targetRef = useRef();
  const candidateRef = useRef();
  const flashCoreRef = useRef();
  const flashShellRef = useRef();
  const fragmentRefs = useRef([]);

  const fragmentDirections = useMemo(
    () =>
      Array.from({ length: 150 }, (_, index) => {
        const phi = Math.acos(1 - (2 * (index + 0.5)) / 150);
        const theta = Math.PI * (1 + Math.sqrt(5)) * (index + 0.5);
        return new THREE.Vector3(
          Math.cos(theta) * Math.sin(phi),
          Math.sin(theta) * Math.sin(phi),
          Math.cos(phi)
        ).normalize();
      }),
    []
  );

  const targetTrailPoints = useMemo(
    () => [new THREE.Vector3(...data.targetStart), new THREE.Vector3(...data.midpoint)],
    [data.midpoint, data.targetStart]
  );
  const candidateTrailPoints = useMemo(
    () => [new THREE.Vector3(...data.candidateStart), new THREE.Vector3(...data.midpoint)],
    [data.candidateStart, data.midpoint]
  );

  useFrame((state) => {
    const elapsed = Math.max(0, (Date.now() - startedAt) / 1000);
    const progress = THREE.MathUtils.clamp(elapsed / 10, 0, 1);
    const approachProgress = smoothstep(0, 0.42, progress);
    const impactProgress = smoothstep(0.42, 0.62, progress);
    const cascadeProgress = smoothstep(0.58, 1, progress);

    const targetPosition =
      progress < 0.5
        ? lerpPosition(data.targetStart, data.midpoint, approachProgress)
        : data.midpoint;
    const candidatePosition =
      progress < 0.5
        ? lerpPosition(data.candidateStart, data.midpoint, approachProgress)
        : data.midpoint;

    if (targetRef.current) {
      targetRef.current.position.set(...targetPosition);
      targetRef.current.visible = progress < 0.58;
    }
    if (candidateRef.current) {
      candidateRef.current.position.set(...candidatePosition);
      candidateRef.current.visible = progress < 0.58;
    }

    if (flashCoreRef.current) {
      const intensity = progress < 0.42 ? 0 : progress < 0.7 ? impactProgress : 1 - (progress - 0.7) / 0.3;
      const clamped = Math.max(0, intensity);
      const scale = 1 + clamped * 6.0;
      flashCoreRef.current.scale.setScalar(scale);
      flashCoreRef.current.material.opacity = clamped * 0.88;
    }

    if (flashShellRef.current) {
      const shellStrength = progress < 0.5 ? 0 : Math.max(0, 1 - (progress - 0.5) / 0.5);
      flashShellRef.current.scale.setScalar(2.0 + cascadeProgress * 10);
      flashShellRef.current.material.opacity = shellStrength * 0.32;
    }

    fragmentRefs.current.forEach((fragment, index) => {
      if (!fragment) return;
      const direction = fragmentDirections[index % fragmentDirections.length];
      const randomOffset = ((index * 137.5) % 1) * 0.8;
      const radius = 0.08 + cascadeProgress * (0.24 + randomOffset);
      fragment.position.set(
        data.midpoint[0] + direction.x * radius,
        data.midpoint[1] + direction.y * radius,
        data.midpoint[2] + direction.z * radius
      );
      fragment.material.opacity = progress > 0.5 ? 0.9 - cascadeProgress * 0.35 : 0;
    });
  });

  return (
    <group>
      <line renderOrder={6}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[new Float32Array(targetTrailPoints.flatMap((point) => [point.x, point.y, point.z])), 3]}
            count={2}
            itemSize={3}
          />
        </bufferGeometry>
        <lineBasicMaterial color="#f5c842" transparent opacity={0.38} depthTest={false} toneMapped={false} />
      </line>
      <line renderOrder={6}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[new Float32Array(candidateTrailPoints.flatMap((point) => [point.x, point.y, point.z])), 3]}
            count={2}
            itemSize={3}
          />
        </bufferGeometry>
        <lineBasicMaterial color="#00e5ff" transparent opacity={0.38} depthTest={false} toneMapped={false} />
      </line>

      <group ref={targetRef}>
        <mesh renderOrder={9}>
          <sphereGeometry args={[0.034, 18, 18]} />
          <meshBasicMaterial color="#f5c842" depthTest={false} toneMapped={false} />
        </mesh>
      </group>

      <group ref={candidateRef}>
        <mesh renderOrder={9}>
          <sphereGeometry args={[0.029, 18, 18]} />
          <meshBasicMaterial color="#00e5ff" depthTest={false} toneMapped={false} />
        </mesh>
      </group>

      <group position={data.midpoint}>
        <mesh ref={flashCoreRef} renderOrder={10}>
          <sphereGeometry args={[0.024, 20, 20]} />
          <meshBasicMaterial color="#ff6b5f" transparent opacity={0} depthTest={false} toneMapped={false} />
        </mesh>
        <mesh ref={flashShellRef} renderOrder={9}>
          <sphereGeometry args={[0.04, 24, 24]} />
          <meshBasicMaterial color="#ffb36b" transparent wireframe opacity={0} depthTest={false} toneMapped={false} />
        </mesh>
      </group>

      {fragmentDirections.map((_, index) => (
        <mesh
          key={`fragment-${index}`}
          ref={(node) => {
            fragmentRefs.current[index] = node;
          }}
          position={data.midpoint}
          renderOrder={8}
        >
          <sphereGeometry args={[0.008, 10, 10]} />
          <meshBasicMaterial color="#ff9f43" transparent opacity={0} depthTest={false} toneMapped={false} />
        </mesh>
      ))}

      <CollisionPulse position={data.midpoint} />

      {data.primaryImpacts.map((impact) => (
        <group key={`impact-${impact.noradId}`} position={impact.position}>
          <mesh renderOrder={8}>
            <sphereGeometry args={[impact.isSynthetic ? 0.014 : 0.012, 14, 14]} />
            <meshBasicMaterial
              color={impact.isSynthetic ? "#ff8c42" : "#ffd166"}
              transparent
              opacity={0.92}
              depthTest={false}
              toneMapped={false}
            />
          </mesh>
        </group>
      ))}

      {data.primaryImpacts.map((impact) => (
        <StaticConnector
          key={`connector-${impact.noradId}`}
          start={data.midpoint}
          end={impact.position}
          color={impact.isSynthetic ? "#ff8c42" : "#ffd166"}
          opacity={impact.isSynthetic ? 0.28 : 0.4}
        />
      ))}

      {data.cascadeLinks.map((link) => (
        <group key={`cascade-${link.from.noradId}-${link.to.noradId}`}>
          <StaticConnector start={link.from.position} end={link.to.position} color="#ff5f57" opacity={0.5} />
          <group position={link.to.position}>
            <mesh renderOrder={8}>
              <sphereGeometry args={[0.013, 14, 14]} />
              <meshBasicMaterial
                color="#ff5f57"
                transparent
                opacity={0.92}
                depthTest={false}
                toneMapped={false}
              />
            </mesh>
          </group>
        </group>
      ))}
    </group>
  );
}

export default function Globe({
  satTypes,
  onSelectionPing,
  onTargetChange,
  onDatasetStatsChange,
  selectionClearSignal,
  focusNoradId,
  refreshSignal,
  simOffsetHours = 0,
  simProgressRef,
  comparedNoradId = null,
  activePair = null,
  scenarioState = null,
  uncertaintyZones = [],
  showOrbitalPaths = true,
}) {
  const controlsRef = useRef();
  const [selectedSat, setSelectedSat] = useState(null);
  const [allSatData, setAllSatData] = useState([]);
  const [datasetMeta, setDatasetMeta] = useState({
    status: "loading",
    cached: false,
    cacheAgeSeconds: null,
    generatedAt: null,
    fetchWindowOpen: null,
    error: null,
  });
  const [payloadOverlayMarkers, setPayloadOverlayMarkers] = useState([]);
  const markerSprite = useMemo(() => createPayloadMarkerSprite(), []);

  const filteredSatData = useMemo(() => {
    if (!Array.isArray(satTypes) || satTypes.length === 0) return [];
    return allSatData.filter((sat) => satTypes.includes(sat.type));
  }, [allSatData, satTypes]);

  const datasetStats = useMemo(
    () => buildDatasetStats(allSatData, datasetMeta),
    [allSatData, datasetMeta]
  );
  const simulatedDate = useMemo(
    () => new Date(Date.now() + simOffsetHours * 3600 * 1000),
    [simOffsetHours]
  );

  const analysisSnapshot = useMemo(() => {
    if (!selectedSat) return null;
    return buildTargetAnalysis(selectedSat, allSatData, simulatedDate);
  }, [allSatData, selectedSat, simulatedDate]);
  const comparedSat = useMemo(() => {
    if (!comparedNoradId) return null;
    return allSatData.find((sat) => sat.details.NORAD_CAT_ID === comparedNoradId) || null;
  }, [allSatData, comparedNoradId]);
  const pairReferenceTime = useMemo(() => {
    if (
      activePair?.sampled_tca_minutes === undefined ||
      activePair?.sampled_tca_minutes === null ||
      !selectedSat ||
      !comparedSat
    ) {
      return null;
    }
    const baseTime = activePair.sampled_at 
      ? new Date(activePair.sampled_at).getTime() 
      : simulatedDate.getTime();
    return new Date(baseTime + activePair.sampled_tca_minutes * 60 * 1000);
  }, [activePair, comparedSat, selectedSat, simulatedDate]);
  const pairModeActive = Boolean(selectedSat && comparedSat && activePair);
  const collisionVisualization = useMemo(() => {
    if (
      scenarioState?.kind !== "collision" ||
      !scenarioState?.collisionStarted ||
      !pairModeActive ||
      !pairReferenceTime ||
      !selectedSat ||
      !comparedSat
    ) {
      return null;
    }

    const targetSnapshot = getPropagationSnapshot(selectedSat.satrec, pairReferenceTime);
    const comparedSnapshot = getPropagationSnapshot(comparedSat.satrec, pairReferenceTime);
    const approachStartTime = new Date(pairReferenceTime.getTime() - 20 * 60 * 1000);
    const targetStartSnapshot = getPropagationSnapshot(selectedSat.satrec, approachStartTime);
    const comparedStartSnapshot = getPropagationSnapshot(comparedSat.satrec, approachStartTime);
    if (!targetSnapshot || !comparedSnapshot) return null;

    const midpoint = [
      (targetSnapshot.position[0] + comparedSnapshot.position[0]) / 2,
      (targetSnapshot.position[1] + comparedSnapshot.position[1]) / 2,
      (targetSnapshot.position[2] + comparedSnapshot.position[2]) / 2,
    ];

    const fragmentIds = new Set((scenarioState.fragmentIds || []).map((id) => String(id)));
    const nearbyObjects = allSatData
      .filter((sat) => {
        const noradId = sat.details?.NORAD_CAT_ID;
        return (
          noradId !== selectedSat.details.NORAD_CAT_ID &&
          noradId !== comparedSat.details.NORAD_CAT_ID
        );
      })
      .map((sat) => {
        const snapshot = getPropagationSnapshot(sat.satrec, pairReferenceTime);
        if (!snapshot) return null;
        return {
          noradId: sat.details.NORAD_CAT_ID,
          objectName: sat.details?.OBJECT_NAME || sat.details?.NORAD_CAT_ID,
          type: sat.type,
          isSynthetic: Boolean(sat.details?.is_synthetic),
          isFragment: fragmentIds.has(String(sat.details.NORAD_CAT_ID)),
          position: snapshot.position,
          distanceKm: distanceBetweenPositionsKm(snapshot.position, midpoint),
        };
      })
      .filter(Boolean)
      .filter((item) => item.isFragment || item.distanceKm <= COLLISION_WAVE_THRESHOLD_KM)
      .sort((left, right) => {
        if (left.isFragment !== right.isFragment) {
          return left.isFragment ? -1 : 1;
        }
        return left.distanceKm - right.distanceKm;
      })
      .slice(0, 32);

    const primaryImpacts = nearbyObjects
      .filter((item) => item.isFragment || item.distanceKm <= IMPACT_PROXIMITY_THRESHOLD_KM)
      .slice(0, 14);

    const cascadeSources = primaryImpacts.filter((item) => !item.isFragment).slice(0, 3);
    const cascadeTargets = nearbyObjects.filter(
      (item) =>
        !primaryImpacts.some((primary) => primary.noradId === item.noradId) &&
        !item.isSynthetic &&
        !item.isFragment
    );

    const cascadeLinks = cascadeSources
      .map((source) => {
        const nextTarget = cascadeTargets
          .map((candidate) => ({
            candidate,
            distanceKm: distanceBetweenPositionsKm(candidate.position, source.position),
          }))
          .sort((left, right) => left.distanceKm - right.distanceKm)[0];

        if (!nextTarget) return null;
        return {
          from: source,
          to: nextTarget.candidate,
        };
      })
      .filter(Boolean);

    return {
      midpoint,
      targetStart: targetStartSnapshot?.position || targetSnapshot.position,
      candidateStart: comparedStartSnapshot?.position || comparedSnapshot.position,
      primaryImpacts,
      cascadeLinks,
      affectedCount: primaryImpacts.filter((item) => !item.isFragment && !item.isSynthetic).length,
      fragmentCount: primaryImpacts.filter((item) => item.isFragment).length,
    };
  }, [allSatData, comparedSat, pairModeActive, pairReferenceTime, scenarioState, selectedSat]);
  const collisionPlaybackActive = Boolean(
    scenarioState?.kind === "collision" &&
      scenarioState?.collisionStarted &&
      collisionVisualization
  );

  const orbitColor = selectedSat
    ? getObjectTypeColor(selectedSat.type)
    : "#ff4444";
  const comparedOrbitColor = comparedSat
    ? getObjectTypeColor(comparedSat.type)
    : "#00e5ff";

  useEffect(() => {
    onDatasetStatsChange?.(datasetStats);
  }, [datasetStats, onDatasetStatsChange]);

  useEffect(() => {
    const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || "/api").replace(/\/$/, "");
    const controller = new AbortController();

    async function loadSatellites() {
      try {
        const response = await fetch(`${apiBaseUrl}/satellites?t=${Date.now()}`, {
          signal: controller.signal,
          headers: {
            "Cache-Control": "no-cache",
            "Pragma": "no-cache"
          }
        });

        if (!response.ok) {
          throw new Error(`Request failed (${response.status})`);
        }

        const payload = await response.json();
        const records = Array.isArray(payload.data)
          ? payload.data
              .filter((sat) => sat?.TLE_LINE1 && sat?.TLE_LINE2)
              .map((sat) => {
                const type = normalizeObjectType(sat.OBJECT_TYPE);
                return {
                  satrec: twoline2satrec(sat.TLE_LINE1, sat.TLE_LINE2),
                  color: new THREE.Color(getObjectTypeColor(type)),
                  type,
                  details: sat,
                };
              })
              .filter((record) => record.satrec)
          : [];

        setAllSatData(records);
        setDatasetMeta({
          status: payload.status || "ready",
          cached: Boolean(payload.cached),
          cacheAgeSeconds: payload.cache_age_seconds ?? null,
          generatedAt: payload.generated_at ?? new Date().toISOString(),
          fetchWindowOpen: payload.fetch_window_open ?? null,
          source: payload.source ?? "unknown",
          error: null,
        });
      } catch (error) {
        if (controller.signal.aborted) return;

        setAllSatData([]);
        setDatasetMeta({
          status: "error",
          cached: false,
          cacheAgeSeconds: null,
          generatedAt: null,
          fetchWindowOpen: null,
          source: "unknown",
          error: error instanceof Error ? error.message : "Unknown fetch error",
        });
      }
    }

    loadSatellites();

    return () => controller.abort();
  }, [refreshSignal]);

  useEffect(() => {
    if (!selectedSat) return;

    const isVisible = filteredSatData.some(
      (sat) => sat.details.NORAD_CAT_ID === selectedSat.details.NORAD_CAT_ID
    );

    if (!isVisible) {
      setSelectedSat(null);
      if (controlsRef.current) {
        controlsRef.current.target.set(0, 0, 0);
      }
    }
  }, [filteredSatData, selectedSat]);

  useEffect(() => {
    if (!selectionClearSignal) return;
    setSelectedSat(null);
    if (controlsRef.current) {
      controlsRef.current.target.set(0, 0, 0);
    }
  }, [selectionClearSignal]);

  useEffect(() => {
    if (!focusNoradId) return;
    const match = allSatData.find((sat) => sat.details.NORAD_CAT_ID === focusNoradId);
    if (match) {
      setSelectedSat(match);
    }
  }, [allSatData, focusNoradId]);

  useEffect(() => {
    if (selectedSat && analysisSnapshot) {
      onTargetChange?.({ target: selectedSat, analysis: analysisSnapshot });
    } else {
      onTargetChange?.(null);
    }
  }, [analysisSnapshot, onTargetChange, selectedSat]);

  const handlePayloadOverlayUpdate = useCallback((markers) => {
    setPayloadOverlayMarkers(markers);
  }, []);

  const handleSelectSatellite = useCallback((sat) => {
    setSelectedSat((current) => {
      if (
        current &&
        sat.details.NORAD_CAT_ID === current.details.NORAD_CAT_ID
      ) {
        return null;
      }
      return sat;
    });
  }, []);

  const handleMarkerClick = useCallback(
    (marker) => {
      if (!marker?.sat) return;
      handleSelectSatellite(marker.sat);
      onSelectionPing?.({ x: marker.x, y: marker.y });
    },
    [handleSelectSatellite, onSelectionPing]
  );

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 0,
        background: "#050a10",
      }}
    >
      {datasetMeta.error && (
        <div className="target-hud-panel" style={{ bottom: 50, left: 20, width: 300 }}>
          <div className="target-hud-header">
            <span className="target-hud-rec">o</span>
            <span className="target-hud-title">DATA LINK WARNING</span>
          </div>
          <div style={{ fontSize: "0.62rem", color: "rgba(200,214,229,0.72)", lineHeight: 1.6 }}>
            {datasetMeta.error}
          </div>
        </div>
      )}

      <Canvas
        camera={{ position: [0, 0, 3.5], fov: 45 }}
        gl={{ antialias: true, alpha: false }}
        onCreated={({ gl }) => {
          gl.setClearColor("#050a10");
          gl.toneMapping = THREE.NoToneMapping;
        }}
      >
        <Stars
          radius={100}
          depth={50}
          count={5000}
          factor={4}
          saturation={0}
          fade
          speed={1}
        />

        <CRTEarth />
        <UncertaintyZones zones={uncertaintyZones} />

        <SatelliteSwarm
          satData={filteredSatData}
          onSelectSatellite={handleSelectSatellite}
          onPayloadOverlayUpdate={handlePayloadOverlayUpdate}
          onSelectionPing={onSelectionPing}
          simProgressRef={simProgressRef}
          simOffsetHours={simOffsetHours}
        />

        {selectedSat && showOrbitalPaths && (
          <OrbitPath
            satrec={selectedSat.satrec}
            color={orbitColor}
            pastColor={orbitColor}
            futureColor={orbitColor}
            opacity={0.6}
            referenceTime={pairReferenceTime || simulatedDate}
          />
        )}
        {pairModeActive && showOrbitalPaths ? (
          <OrbitPath
            satrec={comparedSat.satrec}
            color={comparedOrbitColor}
            pastColor={comparedOrbitColor}
            futureColor={comparedOrbitColor}
            opacity={0.42}
            referenceTime={pairReferenceTime || simulatedDate}
          />
        ) : null}

        {selectedSat && !collisionPlaybackActive && (
          <SelectedSatelliteMarker
            sat={selectedSat}
            simProgressRef={simProgressRef}
            simOffsetHours={simOffsetHours}
            referenceTime={pairReferenceTime}
            forceVisible={pairModeActive}
          />
        )}
        {selectedSat && comparedSat && !collisionPlaybackActive ? (
          <SelectedSatelliteMarker
            sat={comparedSat}
            simProgressRef={simProgressRef}
            simOffsetHours={simOffsetHours}
            referenceTime={pairReferenceTime}
            color="#00e5ff"
            markerRadius={0.017}
            haloInnerRadius={0.036}
            haloOuterRadius={0.05}
            haloOpacity={0.58}
            forceVisible={pairModeActive}
          />
        ) : null}
        {pairModeActive && !collisionPlaybackActive ? (
          <PairLink
            leftSat={selectedSat}
            rightSat={comparedSat}
            referenceTime={pairReferenceTime}
            simOffsetHours={simOffsetHours}
            simProgressRef={simProgressRef}
          />
        ) : null}
        {collisionPlaybackActive ? (
          <CollisionSimulationOverlay
            data={collisionVisualization}
            startedAt={scenarioState.collisionStartedAt || Date.now()}
          />
        ) : null}

        <OrbitControls
          ref={controlsRef}
          enablePan={false}
          minDistance={1.2}
          maxDistance={10}
          autoRotate={false}
          autoRotateSpeed={0.05}
          zoomSpeed={0.3}
          rotateSpeed={0.4}
          enableDamping
          dampingFactor={0.05}
        />
      </Canvas>

      <div className="payload-marker-overlay">
        {payloadOverlayMarkers.map((marker) => (
          <div
            key={marker.id}
            className="payload-marker"
            style={{
              left: `${marker.x}px`,
              top: `${marker.y}px`,
              backgroundImage: markerSprite ? `url(${markerSprite})` : "none",
              animationDelay: `${(marker.seed % 11) * 0.08}s`,
              cursor: "inherit",
            }}
            role="button"
            tabIndex={0}
            onClick={(event) => {
              event.stopPropagation();
              handleMarkerClick(marker);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                handleMarkerClick(marker);
              }
            }}
          />
        ))}
      </div>
    </div>
  );
}
