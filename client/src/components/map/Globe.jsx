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

function SatelliteSwarm({
  satData,
  onSelectSatellite,
  onPayloadOverlayUpdate,
  onSelectionPing,
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

    const now = new Date();
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
      <instancedMesh ref={meshRef} args={[null, null, satData.length]}>
        <sphereGeometry args={[BASE_SATELLITE_RADIUS, 8, 8]} />
        <meshBasicMaterial color="#ffffff" toneMapped={false} />
      </instancedMesh>

      <instancedMesh
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

function SelectionHalo() {
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
        args={[SELECTION_HALO_INNER_RADIUS, SELECTION_HALO_OUTER_RADIUS, 48]}
      />
      <meshBasicMaterial
        color="#f5c842"
        transparent
        opacity={0.65}
        toneMapped={false}
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </mesh>
  );
}

function SelectedSatelliteMarker({ sat }) {
  const markerRef = useRef();
  const { camera } = useThree();

  useFrame(() => {
    const nextSnapshot = getPropagationSnapshot(sat.satrec);
    if (!nextSnapshot || !markerRef.current) return;

    markerRef.current.position.set(...nextSnapshot.position);
    markerRef.current.visible = !isOccludedByEarth(
      camera.position,
      markerRef.current.position,
      SELECTED_MARKER_OCCLUSION_PADDING
    );
  });

  return (
    <group ref={markerRef}>
      <mesh>
        <sphereGeometry args={[SELECTED_MARKER_RADIUS, 16, 16]} />
        <meshBasicMaterial
          color="#f5c842"
          toneMapped={false}
          depthWrite
        />
      </mesh>

      <SelectionHalo />
    </group>
  );
}

export default function Globe({
  satTypes,
  onSelectionPing,
  onTargetChange,
  onDatasetStatsChange,
  selectionClearSignal,
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

  const analysisSnapshot = useMemo(() => {
    if (!selectedSat) return null;
    return buildTargetAnalysis(selectedSat, allSatData);
  }, [allSatData, selectedSat]);

  const orbitColor = selectedSat
    ? getObjectTypeColor(selectedSat.type)
    : "#ff4444";

  useEffect(() => {
    onDatasetStatsChange?.(datasetStats);
  }, [datasetStats, onDatasetStatsChange]);

  useEffect(() => {
    const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || "/api").replace(/\/$/, "");
    const controller = new AbortController();

    async function loadSatellites() {
      try {
        const response = await fetch(`${apiBaseUrl}/satellites`, {
          signal: controller.signal,
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
          error: error instanceof Error ? error.message : "Unknown fetch error",
        });
      }
    }

    loadSatellites();

    return () => controller.abort();
  }, []);

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

        <SatelliteSwarm
          satData={filteredSatData}
          onSelectSatellite={handleSelectSatellite}
          onPayloadOverlayUpdate={handlePayloadOverlayUpdate}
          onSelectionPing={onSelectionPing}
        />

        {selectedSat && (
          <OrbitPath
            satrec={selectedSat.satrec}
            color={orbitColor}
            pastColor={orbitColor}
            futureColor={orbitColor}
            opacity={0.6}
          />
        )}

        {selectedSat && <SelectedSatelliteMarker sat={selectedSat} />}

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
