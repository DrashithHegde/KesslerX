import { useRef, useState, useEffect, useMemo, useCallback } from "react";
import { Canvas, useFrame, useThree, useLoader } from "@react-three/fiber";
import { OrbitControls, Stars, Sphere, Html } from "@react-three/drei";
import * as THREE from "three";
import { gstime, propagate } from "satellite.js/dist/propagation.js";
import { twoline2satrec } from "satellite.js/dist/io.js";
import { eciToGeodetic } from "satellite.js/dist/transforms.js";
import OrbitPath from "./OrbitPath";
import {
  CRTEarthVertexShader,
  CRTEarthFragmentShader,
} from "./CRTEarthShader";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────
const EARTH_TEXTURE_URL =
  "https://unpkg.com/three-globe@2.41.12/example/img/earth-blue-marble.jpg";
const EARTH_RADIUS = 1;
const EARTH_POLAR_SCALE = 0.92; // Stylized flattening to mimic the CRT reference silhouette
const MARKER_HUD_COLOR = "#d2882e"; // Slightly darker, desaturated orange for PAYLOAD markers

// ─────────────────────────────────────────────────────────────────────────────
// Marker sprite (used for DOM overlay)
// ─────────────────────────────────────────────────────────────────────────────
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

  // Top-left corner
  ctx.fillRect(insetX, insetY, cornerLenH, thickness);
  ctx.fillRect(insetX, insetY, thickness, cornerLenV);

  // Top-right corner
  ctx.fillRect(width - insetX - cornerLenH, insetY, cornerLenH, thickness);
  ctx.fillRect(width - insetX - thickness, insetY, thickness, cornerLenV);

  // Bottom-left corner
  ctx.fillRect(insetX, height - insetY - thickness, cornerLenH, thickness);
  ctx.fillRect(insetX, height - insetY - cornerLenV, thickness, cornerLenV);

  // Bottom-right corner
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

// ─────────────────────────────────────────────────────────────────────────────
// 1. CRT-styled Earth — vibrant, subtle pixelation/scanlines, no blue glow
// ─────────────────────────────────────────────────────────────────────────────
function CRTEarth() {
  const earthRef = useRef();
  const materialRef = useRef();

  const texture = useLoader(THREE.TextureLoader, EARTH_TEXTURE_URL);

  useEffect(() => {
    if (texture) {
      // LinearFilter for smooth base — shader handles the subtle CRT pixelation
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.generateMipmaps = true;
    }
  }, [texture]);

  const uniforms = useMemo(
    () => ({
      uTexture: { value: texture },
      uTime: { value: 0 },
      uPixelation: { value: 800.0 },         // Very fine — near HD, just a hint of pixel grid
      uScanlineIntensity: { value: 0.02 },    // Barely visible scanlines
      uGrainIntensity: { value: 0.012 },      // Near-invisible grain
      uChromaticAberration: { value: 0.3 },   // Very subtle color fringing
      uVignetteStrength: { value: 0.4 },      // Gentle edge darkening
      uBrightness: { value: 1.25 },           // Vibrant
    }),
    [texture]
  );

  useFrame((_, delta) => {
    if (earthRef.current) {
      // disabled: keep Earth as the main static view
      // earthRef.current.rotation.y += 0.0001;
    }
    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value += delta;
    }
  });

  return (
    <group ref={earthRef} scale={[1, EARTH_POLAR_SCALE, 1]}>
      {/* Main CRT Earth */}
      <Sphere args={[EARTH_RADIUS, 64, 64]}>
        <shaderMaterial
          ref={materialRef}
          vertexShader={CRTEarthVertexShader}
          fragmentShader={CRTEarthFragmentShader}
          uniforms={uniforms}
        />
      </Sphere>

      {/* Very faint wireframe overlay for subtle grid feel */}
      <Sphere args={[EARTH_RADIUS + 0.001, 48, 48]}>
        <meshBasicMaterial
          color="#88ccdd"
          wireframe={true}
          transparent={true}
          opacity={0.018}
        />
      </Sphere>
    </group>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Decorative orbit ring (like the red/dashed ring in the screenshots)
// ─────────────────────────────────────────────────────────────────────────────
function OrbitalDecorRing() {
  const ringRef = useRef();
  const points = useMemo(() => {
    const pts = [];
    const n = 256;
    const r = EARTH_RADIUS + 0.32;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r));
    }
    return pts;
  }, []);

  const geometry = useMemo(
    () => new THREE.BufferGeometry().setFromPoints(points),
    [points]
  );

  useFrame(() => {
    if (ringRef.current) {
      ringRef.current.rotation.x = 0.3;
      ringRef.current.rotation.z = 0.1;
    }
  });

  return (
    <group ref={ringRef}>
      <line geometry={geometry}>
        <lineBasicMaterial
          color="#c0392b"
          transparent={true}
          opacity={0.25}
          depthWrite={false}
        />
      </line>
    </group>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Utility: Get satellite 3D position with metadata
// ─────────────────────────────────────────────────────────────────────────────
function getSatellitePosition(satrec, date = new Date()) {
  try {
    const gmst = gstime(date);
    const pv = propagate(satrec, date);
    const posEci = pv.position;
    if (!posEci) return null;
    const gd = eciToGeodetic(posEci, gmst);
    const r = EARTH_RADIUS + gd.height / 6371;
    const lat = gd.latitude;
    const lon = gd.longitude;
    const x = r * Math.cos(lat) * Math.cos(lon);
    const z = r * Math.cos(lat) * Math.sin(lon);
    const y = r * Math.sin(lat);
    return {
      position: [x, y, -z],
      height: gd.height,
      lat: THREE.MathUtils.radToDeg(lat),
      lon: THREE.MathUtils.radToDeg(lon),
    };
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Camera tracker: surveillance-style – keeps selected sat centered
// ─────────────────────────────────────────────────────────────────────────────
function CameraTracker({ selectedSat, controlsRef }) {
  const { camera } = useThree();
  const targetPos = useRef(new THREE.Vector3());
  const hasLockedOn = useRef(false);

  useFrame(() => {
    if (!selectedSat || !controlsRef.current) {
      if (hasLockedOn.current) {
        // Smoothly return to origin when deselected
        controlsRef.current?.target.lerp(new THREE.Vector3(0, 0, 0), 0.05);
        controlsRef.current?.update();
        if (controlsRef.current?.target.length() < 0.01) {
          hasLockedOn.current = false;
        }
      }
      return;
    }

    const posData = getSatellitePosition(selectedSat.satrec);
    if (!posData) return;

    const [sx, sy, sz] = posData.position;
    targetPos.current.set(sx, sy, sz);

    // Lock orbit controls target onto the satellite
    const lerpSpeed = hasLockedOn.current ? 0.03 : 0.06;
    controlsRef.current.target.lerp(targetPos.current, lerpSpeed);

    // On first lock, nudge camera closer
    if (!hasLockedOn.current) {
      const dir = new THREE.Vector3(sx, sy, sz).normalize();
      const camDest = dir.multiplyScalar(2.5);
      camera.position.lerp(camDest, 0.04);
      hasLockedOn.current = true;
    }

    controlsRef.current.update();
  });

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Satellite Swarm — instanced dots + PAYLOAD corner-box marker
// ─────────────────────────────────────────────────────────────────────────────
function SatelliteSwarm({
  onSelectSatellite,
  satTypes,
  selectedSat,
  onPayloadOverlayUpdate,
  onSelectionPing,
}) {
  const meshRef = useRef();
  const [satData, setSatData] = useState([]);
  const overlayUpdateRef = useRef(0);
  const tmpWorldPos = useMemo(() => new THREE.Vector3(), []);
  const tmpCamPos = useMemo(() => new THREE.Vector3(), []);
  const tmpDir = useMemo(() => new THREE.Vector3(), []);
  const tmpProjected = useMemo(() => new THREE.Vector3(), []);

  // Fetch satellite data from backend
  useEffect(() => {
    fetch("http://localhost:8000/api/satellites")
      .then((res) => res.json())
      .then((data) => {
        console.log(
          `📡 Space-Track Data Status: ${data.status} | Cached: ${data.cached}`
        );
        if (data.data) {
          const records = data.data.map((sat) => {
            let colorHex = "#888888";
            if (sat.OBJECT_TYPE === "PAYLOAD") colorHex = "#6395EE";
            else if (sat.OBJECT_TYPE === "DEBRIS") colorHex = "#DA2C43";
            else if (sat.OBJECT_TYPE === "ROCKET BODY") colorHex = "#00FF00";
            return {
              satrec: twoline2satrec(sat.TLE_LINE1, sat.TLE_LINE2),
              color: new THREE.Color(colorHex),
              type: sat.OBJECT_TYPE,
              details: sat,
            };
          });
          setSatData(records);
        }
      })
      .catch((err) => console.error("Failed to fetch satellites:", err));
  }, []);

  // Filter by active types
  const filteredSatData = useMemo(() => {
    return satTypes && satTypes.length > 0
      ? satData.filter((s) => satTypes.includes(s.type))
      : satData;
  }, [satData, satTypes]);

  // Set instance colors
  useEffect(() => {
    if (meshRef.current && filteredSatData.length > 0) {
      filteredSatData.forEach((sat, i) => {
        meshRef.current.setColorAt(i, sat.color);
      });
      meshRef.current.instanceColor.needsUpdate = true;
    }
  }, [filteredSatData]);

  // Animate positions + collect payload label positions
  useFrame((state) => {
    if (!meshRef.current || filteredSatData.length === 0) return;

    const now = new Date();
    const gmst = gstime(now);
    const dummy = new THREE.Object3D();
    const overlayPayload = [];
    const camera = state.camera;
    const viewport = state.size;
    const camPos = tmpCamPos.copy(camera.position);

    filteredSatData.forEach((sat, i) => {
      const pv = propagate(sat.satrec, now);
      const posEci = pv.position;

      if (posEci) {
        const gd = eciToGeodetic(posEci, gmst);
        const r = EARTH_RADIUS + gd.height / 6371;
        const lat = gd.latitude;
        const lon = gd.longitude;
        const x = r * Math.cos(lat) * Math.cos(lon);
        const z = r * Math.cos(lat) * Math.sin(lon);
        const y = r * Math.sin(lat);

        dummy.position.set(x, y, -z);
        dummy.updateMatrix();
        meshRef.current.setMatrixAt(i, dummy.matrix);

        if (sat.type === "PAYLOAD") {
          tmpWorldPos.set(x, y, -z);

          const dir = tmpDir.subVectors(tmpWorldPos, camPos);
          const a = dir.lengthSq();
          let occluded = false;
          if (a > 0.0) {
            const b = 2 * camPos.dot(dir);
            const occlusionRadius = EARTH_RADIUS * 1.01;
            const c = camPos.lengthSq() - occlusionRadius * occlusionRadius;
            const discriminant = b * b - 4 * a * c;
            if (discriminant >= 0) {
              const sqrtDisc = Math.sqrt(discriminant);
              const t1 = (-b - sqrtDisc) / (2 * a);
              const t2 = (-b + sqrtDisc) / (2 * a);
              const tMin = Math.min(t1, t2);
              const tMax = Math.max(t1, t2);
              if ((tMin >= 0 && tMin <= 1) || (tMax >= 0 && tMax <= 1)) {
                occluded = true;
              }
            }
          }

          if (!occluded) {
            tmpProjected.copy(tmpWorldPos).project(camera);
            const screenX = (tmpProjected.x * 0.5 + 0.5) * viewport.width;
            const screenY = (-tmpProjected.y * 0.5 + 0.5) * viewport.height;
            if (
              screenX >= 0 &&
              screenX <= viewport.width &&
              screenY >= 0 &&
              screenY <= viewport.height
            ) {
              overlayPayload.push({
                id: sat.details.NORAD_CAT_ID || `payload-${i}`,
                x: screenX,
                y: screenY,
                seed: Number(sat.details.NORAD_CAT_ID) || i + 1,
              });
            }
          }
        }
      }
    });

    meshRef.current.instanceMatrix.needsUpdate = true;

    if (onPayloadOverlayUpdate) {
      const elapsed = state.clock.getElapsedTime();
      if (elapsed - overlayUpdateRef.current > 0.05) {
        overlayUpdateRef.current = elapsed;
        onPayloadOverlayUpdate(overlayPayload);
      }
    }
  });

  const handleClick = (e) => {
    e.stopPropagation();
    if (onSelectionPing) {
      onSelectionPing({ x: e.clientX, y: e.clientY });
    }
    if (e.instanceId !== undefined && e.instanceId < filteredSatData.length) {
      onSelectSatellite(filteredSatData[e.instanceId]);
    }
  };

  if (filteredSatData.length === 0) return null;

  return (
    <>
      {/* Instanced satellite dots */}
      <instancedMesh
        ref={meshRef}
        args={[null, null, filteredSatData.length]}
        onClick={handleClick}
      >
        <sphereGeometry args={[0.005, 8, 8]} />
        <meshBasicMaterial color="#ffffff" toneMapped={false} />
      </instancedMesh>

    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. Selected Satellite — large glowing dot + info card above (like SS3)
// ─────────────────────────────────────────────────────────────────────────────
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
    <>
      <mesh ref={ringRef}>
        <ringGeometry args={[0.05, 0.068, 48]} />
        <meshBasicMaterial
          color="#f5c842"
          transparent
          opacity={0.65}
          toneMapped={false}
          side={THREE.DoubleSide}
        />
      </mesh>
    </>
  );
}

function SelectedSatelliteMarker({ sat }) {
  const markerRef = useRef();
  const [posData, setPosData] = useState(null);

  useFrame(() => {
    const data = getSatellitePosition(sat.satrec);
    if (data && markerRef.current) {
      markerRef.current.position.set(...data.position);
      setPosData(data);
    }
  });

  const altKm = posData ? Math.round(posData.height) : "—";

  return (
    <group ref={markerRef}>
      {/* Large solid dot (like the yellow satellite in SS3) */}
      <mesh>
        <sphereGeometry args={[0.022, 16, 16]} />
        <meshBasicMaterial color="#f5c842" toneMapped={false} />
      </mesh>

      {/* Outer halo glow */}
      <mesh>
        <sphereGeometry args={[0.038, 16, 16]} />
        <meshBasicMaterial
          color="#f5c842"
          transparent
          opacity={0.18}
          toneMapped={false}
        />
      </mesh>

      {/* Screen-space facing selection ring */}
      <SelectionHalo />

      {/* Info card floating above the satellite */}
      {posData && (
        <Html
          center
          distanceFactor={8}
          style={{
            pointerEvents: "none",
            transform: "translate(-50%, -260%)",
          }}
          zIndexRange={[20, 10]}
        >
          <div className="sat-target-card">
            <div className="sat-target-name">{sat.details.OBJECT_NAME}</div>
            <div className="sat-target-details">
              <span className="sat-target-alt">{altKm} km</span>
              <span className="sat-target-sep">—</span>
              <span className="sat-target-norad">
                NORAD {sat.details.NORAD_CAT_ID}
              </span>
            </div>
          </div>
        </Html>
      )}
    </group>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. Main Globe Export
// ─────────────────────────────────────────────────────────────────────────────
export default function Globe({ satTypes, onSelectionPing }) {
  const [selectedSat, setSelectedSat] = useState(null);
  const controlsRef = useRef();
  const [payloadOverlayMarkers, setPayloadOverlayMarkers] = useState([]);
  const markerSprite = useMemo(() => createPayloadMarkerSprite(), []);

  useEffect(() => {
    if (!selectedSat) return;
    if (!satTypes || !satTypes.includes(selectedSat.type)) {
      setSelectedSat(null);
      if (controlsRef.current) {
        controlsRef.current.target.set(0, 0, 0);
      }
    }
  }, [satTypes, selectedSat]);

  const handlePayloadOverlayUpdate = useCallback((markers) => {
    setPayloadOverlayMarkers(markers);
  }, []);

  const handleSelectSatellite = useCallback(
    (sat) => {
      if (
        selectedSat &&
        sat.details.NORAD_CAT_ID === selectedSat.details.NORAD_CAT_ID
      ) {
        setSelectedSat(null);
      } else {
        setSelectedSat(sat);
      }
    },
    [selectedSat]
  );

  const handleClearTarget = useCallback(() => {
    setSelectedSat(null);
    if (controlsRef.current) {
      controlsRef.current.target.set(0, 0, 0);
    }
  }, []);

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 0,
        background: "#050a10",
      }}
    >
      {/* Target Details HUD — surveillance panel */}
      {selectedSat && (
        <div className="target-hud-panel">
          <div className="target-hud-header">
            <span className="target-hud-rec">●</span>
            <span className="target-hud-title">TARGET LOCK</span>
          </div>

          <div className="target-hud-row">
            <span className="target-hud-label">DESIGNATION</span>
            <span className="target-hud-value">
              {selectedSat.details.OBJECT_NAME}
            </span>
          </div>
          <div className="target-hud-row">
            <span className="target-hud-label">TYPE</span>
            <span
              className="target-hud-value"
              style={{
                color:
                  selectedSat.type === "PAYLOAD"
                    ? "#6395EE"
                    : selectedSat.type === "DEBRIS"
                      ? "#DA2C43"
                      : "#00FF00",
              }}
            >
              {selectedSat.type}
            </span>
          </div>
          <div className="target-hud-row">
            <span className="target-hud-label">NORAD ID</span>
            <span className="target-hud-value">
              {selectedSat.details.NORAD_CAT_ID}
            </span>
          </div>
          <div className="target-hud-row">
            <span className="target-hud-label">COUNTRY</span>
            <span className="target-hud-value">
              {selectedSat.details.COUNTRY_CODE || "UNK"}
            </span>
          </div>
          <div className="target-hud-row">
            <span className="target-hud-label">RCS</span>
            <span className="target-hud-value">
              {selectedSat.details.RCS_SIZE || "UNKNOWN"}
            </span>
          </div>
          <div className="target-hud-row">
            <span className="target-hud-label">LAUNCH</span>
            <span className="target-hud-value">
              {selectedSat.details.LAUNCH_DATE || "—"}
            </span>
          </div>

          <button className="target-hud-clear" onClick={handleClearTarget}>
            ✕ RELEASE TARGET
          </button>
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
        {/* Stars */}
        <Stars
          radius={100}
          depth={50}
          count={5000}
          factor={4}
          saturation={0}
          fade
          speed={1}
        />

        {/* CRT-styled Earth */}
        <CRTEarth />

        {/* Satellite swarm */}
        <SatelliteSwarm
          onSelectSatellite={handleSelectSatellite}
          satTypes={satTypes}
          selectedSat={selectedSat}
          onPayloadOverlayUpdate={handlePayloadOverlayUpdate}
          onSelectionPing={onSelectionPing}
        />

        {/* Orbit trajectory for selected satellite */}
        {selectedSat && (
          <OrbitPath satrec={selectedSat.satrec} color="#ff4444" opacity={0.6} />
        )}

        {/* Surveillance camera tracker (disabled: keep Earth as main view) */}
        {false && (
          <CameraTracker selectedSat={selectedSat} controlsRef={controlsRef} />
        )}

        {/* Orbit controls */}
        <OrbitControls
          ref={controlsRef}
          enablePan={false}
          minDistance={1.2}
          maxDistance={10}
          autoRotate={false}
          autoRotateSpeed={0.05}
          zoomSpeed={0.3}
          rotateSpeed={0.4}
          enableDamping={true}
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
            }}
          />
        ))}
      </div>
    </div>
  );
}