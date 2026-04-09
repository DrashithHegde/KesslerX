import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

const EARTH_RADIUS_KM = 6371;
const ZONE_BASE_RADIUS_KM = 150;
const ZONE_MAX_EXTRA_RADIUS_KM = 900;
const MAX_VISIBLE_ZONES = 12;

function clampScore(score) {
  const numeric = Number(score);
  return Number.isFinite(numeric) ? THREE.MathUtils.clamp(numeric, 0, 100) : 0;
}

function seededUnit(seed) {
  const value = Math.sin(seed) * 43758.5453123;
  return value - Math.floor(value);
}

function zoneSeed(zone, index) {
  const lat = Number(zone?.lat ?? 0);
  const lon = Number(zone?.lon ?? 0);
  const altitude = Number(zone?.avg_altitude ?? zone?.avg_altitude_km ?? 0);
  const score = clampScore(zone?.uncertainty_score);
  return lat * 12.9898 + lon * 78.233 + altitude * 0.013 + score * 0.37 + index * 19.19;
}

function latLonAltitudeToCartesian(latDeg, lonDeg, altitudeKm) {
  const lat = THREE.MathUtils.degToRad(Number(latDeg) || 0);
  const lon = THREE.MathUtils.degToRad(Number(lonDeg) || 0);
  const orbitalRadius = 1 + Math.max(0, Number(altitudeKm) || 0) / EARTH_RADIUS_KM;

  return [
    orbitalRadius * Math.cos(lat) * Math.cos(lon),
    orbitalRadius * Math.sin(lat),
    orbitalRadius * Math.cos(lat) * Math.sin(lon),
  ];
}

function zoneColor(score) {
  if (score <= 40) {
    return new THREE.Color("#d8e0e8");
  }
  if (score <= 70) {
    return new THREE.Color("#5fa79d");
  }
  return new THREE.Color("#c46a4b");
}

function blobOpacity(score) {
  return THREE.MathUtils.lerp(0.34, 0.56, clampScore(score) / 100);
}

function blobRadiusWorldUnits(score, zone) {
  const effectiveRadiusKm = Number(zone?.effective_radius_km);
  if (Number.isFinite(effectiveRadiusKm) && effectiveRadiusKm > 0) {
    return effectiveRadiusKm / EARTH_RADIUS_KM;
  }
  const radiusKm =
    ZONE_BASE_RADIUS_KM + (clampScore(score) / 100) * ZONE_MAX_EXTRA_RADIUS_KM;
  const densitySpreadBoost = Math.min(Number(zone?.total_objects ?? 0) / 90, 0.22);
  return (radiusKm / EARTH_RADIUS_KM) * (1 + densitySpreadBoost);
}

function buildZoneTransform(zone, index) {
  const score = clampScore(zone?.uncertainty_score);
  const altitudeKm = Number(zone?.avg_altitude ?? zone?.avg_altitude_km ?? 0) || 0;
  const seed = zoneSeed(zone, index);
  const baseScale = blobRadiusWorldUnits(score, zone);
  const sx = 1 + (seededUnit(seed + 1) * 0.4 - 0.2);
  const sy = 1 + (seededUnit(seed + 2) * 0.4 - 0.2);
  const sz = 1 + (seededUnit(seed + 3) * 0.4 - 0.2);

  return {
    key: `${zone?.lat ?? 0}-${zone?.lon ?? 0}-${altitudeKm}-${score}-${index}`,
    position: latLonAltitudeToCartesian(zone?.lat, zone?.lon, altitudeKm),
    scale: [baseScale * sx, baseScale * sy, baseScale * sz],
    color: zoneColor(score),
    opacity: blobOpacity(score),
    densityFactor: Math.min(Number(zone?.total_objects ?? 0) / 90, 1),
    seed,
  };
}

function shadeColor(color, amount) {
  return color.clone().lerp(new THREE.Color("#081018"), amount);
}

function createHazeTexture() {
  if (typeof document === "undefined") {
    return null;
  }

  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return null;
  }

  const gradient = ctx.createRadialGradient(128, 128, 10, 128, 128, 128);
  gradient.addColorStop(0, "rgba(255,255,255,0.82)");
  gradient.addColorStop(0.14, "rgba(255,255,255,0.42)");
  gradient.addColorStop(0.34, "rgba(255,255,255,0.18)");
  gradient.addColorStop(0.62, "rgba(255,255,255,0.06)");
  gradient.addColorStop(0.84, "rgba(255,255,255,0.015)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");

  ctx.clearRect(0, 0, 256, 256);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 256, 256);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function directionFromSeed(seed) {
  const x = seededUnit(seed + 11) * 2 - 1;
  const y = seededUnit(seed + 17) * 2 - 1;
  const z = seededUnit(seed + 23) * 2 - 1;
  return new THREE.Vector3(x, y, z).normalize();
}

function buildLobes(transform) {
  const primaryDirection = directionFromSeed(transform.seed);
  let secondaryDirection = directionFromSeed(transform.seed + 9.3)
    .cross(primaryDirection)
    .normalize();
  if (!Number.isFinite(secondaryDirection.lengthSq()) || secondaryDirection.lengthSq() < 0.0001) {
    secondaryDirection = new THREE.Vector3(0, 1, 0).cross(primaryDirection).normalize();
  }
  if (!Number.isFinite(secondaryDirection.lengthSq()) || secondaryDirection.lengthSq() < 0.0001) {
    secondaryDirection = new THREE.Vector3(1, 0, 0);
  }
  const baseColor = transform.color;
  const deepColor = shadeColor(baseColor, 0.12);
  const deeperColor = shadeColor(baseColor, 0.22);
  const cloudPuffs = [];

  const pushPuff = (key, offset, scale, color, opacity) => {
    cloudPuffs.push({ key, offset, scale, color, opacity });
  };

  pushPuff("core", [0, 0, 0], 0.92, baseColor, transform.opacity * 0.62);
  pushPuff("core-halo", [0, 0, 0], 1.35, baseColor, transform.opacity * 0.3);

  const puffCount = 8 + Math.round(transform.densityFactor * 4);

  for (let index = 0; index < puffCount; index += 1) {
    const dirA = directionFromSeed(transform.seed + index * 5.7);
    const dirB = directionFromSeed(transform.seed + index * 8.3);
    const offset = dirA
      .clone()
      .multiplyScalar(0.3 + seededUnit(transform.seed + index * 3.1) * (0.45 + transform.densityFactor * 0.18))
      .add(dirB.multiplyScalar(0.04 + seededUnit(transform.seed + index * 2.4) * 0.12))
      .toArray();
    const scale = 1.05 + seededUnit(transform.seed + index * 4.2) * (1.35 + transform.densityFactor * 0.4);
    const colorMix = index % 2 === 0 ? baseColor : deepColor;
    const opacity = transform.opacity * (0.12 + Math.max(0, puffCount - 1 - index) * 0.028);
    pushPuff(`cloud-${index}`, offset, scale, colorMix, opacity);
  }

  pushPuff(
    "spread-a",
    primaryDirection.clone().multiplyScalar(0.4).toArray(),
    2.6,
    deepColor,
    transform.opacity * 0.12
  );
  pushPuff(
    "spread-b",
    secondaryDirection.clone().multiplyScalar(-0.45).toArray(),
    3.0,
    deeperColor,
    transform.opacity * 0.1
  );
  pushPuff(
    "spread-c",
    primaryDirection
      .clone()
      .multiplyScalar(-0.28)
      .add(secondaryDirection.clone().multiplyScalar(0.32))
      .toArray(),
    3.25,
    deeperColor,
    transform.opacity * 0.085
  );

  return cloudPuffs;
}

function UncertaintyZoneBlob({ texture, transform }) {
  const groupRef = useRef();
  const lobes = useMemo(() => buildLobes(transform), [transform]);

  useFrame((state) => {
    if (!groupRef.current) return;
    const t = state.clock.getElapsedTime();
    const pulse = 1 + Math.sin(t * (0.32 + seededUnit(transform.seed + 5) * 0.22) + transform.seed) * 0.035;
    groupRef.current.scale.set(
      transform.scale[0] * pulse,
      transform.scale[1] * (1 + (pulse - 1) * 0.9),
      transform.scale[2] * pulse
    );
    groupRef.current.rotation.y = t * (0.03 + seededUnit(transform.seed + 7) * 0.025) + transform.seed * 0.01;
    groupRef.current.rotation.z = Math.sin(t * 0.22 + transform.seed) * 0.08;
  });

  return (
    <group
      ref={groupRef}
      position={transform.position}
      scale={transform.scale}
      renderOrder={4}
      frustumCulled={false}
    >
      {lobes.map((layer) => (
        <sprite
          key={`${transform.key}-${layer.key}`}
          position={layer.offset}
          scale={[layer.scale, layer.scale, 1]}
          renderOrder={4}
          frustumCulled={false}
        >
          <spriteMaterial
            map={texture || null}
            color={layer.color}
            transparent
            opacity={layer.opacity}
            depthTest
            depthWrite={false}
            blending={THREE.NormalBlending}
            toneMapped={false}
          />
        </sprite>
      ))}
    </group>
  );
}

export default function UncertaintyZones({ zones = [] }) {
  const hazeTexture = useMemo(() => createHazeTexture(), []);

  useEffect(() => () => hazeTexture?.dispose(), [hazeTexture]);

  const visibleZones = useMemo(
    () =>
      [...zones]
        .sort(
          (left, right) =>
            clampScore(right?.uncertainty_score) - clampScore(left?.uncertainty_score)
        )
        .slice(0, MAX_VISIBLE_ZONES)
        .map((zone, index) => buildZoneTransform(zone, index)),
    [zones]
  );

  if (!visibleZones.length) return null;

  return (
    <group>
      {visibleZones.map((transform) => (
        <UncertaintyZoneBlob
          key={transform.key}
          texture={hazeTexture}
          transform={transform}
        />
      ))}
    </group>
  );
}
