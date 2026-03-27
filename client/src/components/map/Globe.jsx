import { useRef, useState, useEffect } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Stars, Sphere } from "@react-three/drei";
import * as THREE from "three";
import * as satellite from "satellite.js";

// ── 1. The Holographic Earth ──────────────────────────────────────────
function Earth() {
  const earthRef = useRef();

  useFrame(() => {
    if (earthRef.current) {
      // SLOWED DOWN: Changed from 0.0005 to 0.0001
      earthRef.current.rotation.y += 0.0001; 
    }
  });

  return (
    <group ref={earthRef}>
      <Sphere args={[1, 64, 64]}>
        <meshBasicMaterial 
          color="#00e5ff" 
          wireframe={true} 
          transparent={true}
          opacity={0.15}
        />
      </Sphere>
      <Sphere args={[0.99, 32, 32]}>
        <meshBasicMaterial color="#050a10" />
      </Sphere>
    </group>
  );
}

// ── 2. The Satellite Swarm ────────────────────────────────────────────
function SatelliteSwarm({ onSelectSatellite }) {
  const meshRef = useRef();
  const [satData, setSatData] = useState([]);

  useEffect(() => {
    fetch("http://127.0.0.1:8000/api/satellites")
      .then((res) => res.json())
      .then((data) => {
        console.log(`📡 Space-Track Data Status: ${data.status} | Cached: ${data.cached}`);
        if (data.data) {
          const records = data.data.map((sat) => {
            let colorHex = "#888888"; 
            
            if (sat.OBJECT_TYPE === "PAYLOAD") {
              colorHex = "#6395EE"; // Cyan
            } else if (sat.OBJECT_TYPE === "DEBRIS") {
              colorHex = "#DA2C43"; // Red
            } else if (sat.OBJECT_TYPE === "ROCKET BODY") {
              colorHex = "#00FF00"; // Green
            }

            return {
              satrec: satellite.twoline2satrec(sat.TLE_LINE1, sat.TLE_LINE2),
              color: new THREE.Color(colorHex),
              type: sat.OBJECT_TYPE,
              // Keep the original Space-Track data so we can display it!
              details: sat 
            };
          });
          setSatData(records);
        }
      })
      .catch((err) => console.error("Failed to fetch satellites:", err));
  }, []);

  useEffect(() => {
    if (meshRef.current && satData.length > 0) {
      satData.forEach((sat, i) => {
        meshRef.current.setColorAt(i, sat.color);
      });
      meshRef.current.instanceColor.needsUpdate = true;
    }
  }, [satData]);

  useFrame(() => {
    if (!meshRef.current || satData.length === 0) return;

    const now = new Date();
    const gmst = satellite.gstime(now);
    const dummy = new THREE.Object3D();

    satData.forEach((sat, i) => {
      const positionAndVelocity = satellite.propagate(sat.satrec, now);
      const positionEci = positionAndVelocity.position;
      
      if (positionEci) {
        const positionGd = satellite.eciToGeodetic(positionEci, gmst);
        const r = 1 + (positionGd.height / 6371); 
        const lat = positionGd.latitude;
        const lon = positionGd.longitude;

        const x = r * Math.cos(lat) * Math.cos(lon);
        const z = r * Math.cos(lat) * Math.sin(lon);
        const y = r * Math.sin(lat);

        dummy.position.set(x, y, -z);
        dummy.updateMatrix();
        meshRef.current.setMatrixAt(i, dummy.matrix);
      }
    });

    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  // Handle Clicking on a satellite
  const handleClick = (e) => {
    e.stopPropagation(); // Prevent the click from passing through to the Earth
    if (e.instanceId !== undefined) {
      const clickedSat = satData[e.instanceId];
      onSelectSatellite(clickedSat);
    }
  };

  if (satData.length === 0) return null;

  return (
    <instancedMesh 
      ref={meshRef} 
      args={[null, null, satData.length]}
      onClick={handleClick}
      onPointerOver={(e) => {
        e.stopPropagation();
        document.body.style.cursor = 'crosshair'; // Change cursor when hovering over debris
      }}
      onPointerOut={() => {
        document.body.style.cursor = 'auto';
      }}
    >
      <sphereGeometry args={[0.005, 8, 8]} />
      <meshBasicMaterial color="#ffffff" toneMapped={false} />
    </instancedMesh>
  );
}

// ── 3. Main Scene Canvas & HUD Overlay ────────────────────────────────
export default function Globe({ filters }) {
    const [selectedSat, setSelectedSat] = useState(null);

  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 0, background: "#050a10" }}>
      
      {/* Target Details HUD */}
      {selectedSat && (
        <div style={{
          position: "absolute",
          top: "80px",
          right: "20px",
          width: "300px",
          background: "rgba(5, 10, 16, 0.85)",
          border: "1px solid #00e5ff",
          borderRadius: "4px",
          padding: "16px",
          color: "#fff",
          zIndex: 10,
          fontFamily: "monospace",
          backdropFilter: "blur(4px)"
        }}>
          <h3 style={{ color: "#00e5ff", margin: "0 0 12px 0", borderBottom: "1px solid #00e5ff44", paddingBottom: "8px" }}>
            TARGET ACQUIRED
          </h3>
          <p style={{ margin: "4px 0" }}><strong>NAME:</strong> {selectedSat.details.OBJECT_NAME}</p>
          <p style={{ margin: "4px 0" }}>
            <strong>TYPE:</strong> 
            <span style={{ 
              color: selectedSat.type === "PAYLOAD" ? "#6395EE" : selectedSat.type === "DEBRIS" ? "#DA2C43" : "#00FF00",
              marginLeft: "8px"
            }}>
              {selectedSat.type}
            </span>
          </p>
          <p style={{ margin: "4px 0" }}><strong>NORAD ID:</strong> {selectedSat.details.NORAD_CAT_ID}</p>
          <p style={{ margin: "4px 0" }}><strong>RCS SIZE:</strong> {selectedSat.details.RCS_SIZE || "UNKNOWN"}</p>
          
          <button 
            onClick={() => setSelectedSat(null)}
            style={{
              marginTop: "16px",
              width: "100%",
              padding: "8px",
              background: "transparent",
              border: "1px solid #ff3333",
              color: "#ff3333",
              cursor: "pointer"
            }}
          >
            CLEAR TARGET
          </button>
        </div>
      )}

      <Canvas camera={{ position: [0, 0, 3.5], fov: 45 }}>
        <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />
        <Earth />
        <SatelliteSwarm onSelectSatellite={setSelectedSat} />
        
        <OrbitControls 
          enablePan={false} 
          minDistance={1.2} 
          maxDistance={10} 
          autoRotate={true}
          autoRotateSpeed={0.05} // SLOWED DOWN: Changed from 0.5 to 0.05
        />
      </Canvas>
    </div>
  );
}