import { memo, useEffect, useState } from "react";
import { formatUtc, getObjectTypeColor } from "../../utils/orbitalAnalysis";
import TrendSparkline from "../ui/TrendSparkline";

function MetricCard({ label, value, accent = "var(--cyan)" }) {
  return (
    <div className="glass" style={{ padding: "10px 12px", borderRadius: 9 }}>
      <div
        style={{
          fontSize: "0.52rem",
          color: "var(--text-dim)",
          letterSpacing: "0.12em",
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>
      <div
        style={{
          marginTop: 5,
          fontFamily: "'DM Mono', monospace",
          fontSize: "1.1rem",
          color: accent,
          fontWeight: 600,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function SectionLabel({ children }) {
  return (
    <div
      style={{
        fontSize: "0.58rem",
        letterSpacing: "0.2em",
        color: "var(--text-dim)",
        textTransform: "uppercase",
        marginBottom: 12,
      }}
    >
      {children}
    </div>
  );
}

function ListBlock({ title, items }) {
  return (
    <div
      style={{
        marginTop: 14,
        paddingTop: 10,
        borderTop: "1px solid rgba(0,229,255,0.12)",
      }}
    >
      <SectionLabel>{title}</SectionLabel>
      <ul style={{ listStyle: "none", display: "grid", gap: 8 }}>
        {items.map((text) => (
          <li
            key={text}
            style={{
              fontSize: "0.62rem",
              color: "var(--text)",
              letterSpacing: "0.04em",
              lineHeight: 1.5,
              paddingLeft: 12,
              position: "relative",
            }}
          >
            <span
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                color: "rgba(0,229,255,0.72)",
              }}
            >
              *
            </span>
            {text}
          </li>
        ))}
      </ul>
    </div>
  );
}

function StatRow({ label, value }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 10,
      }}
    >
      <span>{label}</span>
      <span style={{ color: "rgba(255,255,255,0.86)" }}>{value}</span>
    </div>
  );
}

function DeepAnalysisOverlay({ target, analysis, isOpen, onClose, simTimestamp }) {
  const [ragExplanation, setRagExplanation] = useState(null);
  const [isRagLoading, setIsRagLoading] = useState(false);

  useEffect(() => {
    if (!isOpen || !target || !analysis) {
      setRagExplanation(null);
      return;
    }

    const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || "/api").replace(/\/$/, "");
    let isMounted = true;
    
    const fetchExplanation = async () => {
      setIsRagLoading(true);
      try {
        const payload = {
          norad_id: target.details.NORAD_CAT_ID,
          object_name: target.details.OBJECT_NAME,
          min_separation_km: analysis.closestApproach ? analysis.closestApproach.minSeparationKm : null,
          uncertainty_score: analysis.uncertaintyScore,
          risk_band: analysis.riskBand,
          regime: analysis.regime,
        };
        const res = await fetch(`${apiBaseUrl}/analysis/explain`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (isMounted) {
            setRagExplanation(data.explanation || data.detail || "RAG explanation returned empty.");
        }
      } catch (err) {
        if (isMounted) {
            setRagExplanation("Failed to connect to KesslerX AI backend: " + err.message);
        }
      } finally {
        if (isMounted) {
            setIsRagLoading(false);
        }
      }
    };

    fetchExplanation();
    return () => { isMounted = false; };
  }, [isOpen, target, analysis]);

  if (!isOpen || !target || !analysis) return null;

  const typeColor = getObjectTypeColor(target.type);
  const riskColor = analysis.riskColor;
  const closestApproach = analysis.closestApproach;
  const currentState = analysis.currentState;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 120,
        background: "rgba(4, 8, 12, 0.9)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        padding: "22px",
        overflowY: "auto",
      }}
    >
      <div
        className="glass"
        style={{
          width: "100%",
          minHeight: "calc(100vh - 44px)",
          borderRadius: 14,
          padding: "20px 22px",
          border: "1px solid rgba(0,229,255,0.16)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 20,
            marginBottom: 16,
          }}
        >
          <div>
            <div
              style={{
                fontSize: "0.62rem",
                letterSpacing: "0.2em",
                color: "rgba(0,229,255,0.55)",
                textTransform: "uppercase",
                marginBottom: 8,
              }}
            >
              Deep Analysis
            </div>
            <div
              style={{
                fontFamily: "'Syne', sans-serif",
                fontSize: "1.35rem",
                fontWeight: 700,
                color: "rgba(255,255,255,0.94)",
                letterSpacing: "0.04em",
                lineHeight: 1.35,
              }}
            >
              {target.details.OBJECT_NAME}
            </div>
            <div
              style={{
                marginTop: 7,
                fontSize: "0.64rem",
                color: "var(--text-dim)",
                letterSpacing: "0.11em",
              }}
            >
              NORAD {target.details.NORAD_CAT_ID} | TYPE{" "}
              <span style={{ color: typeColor }}>{target.type}</span> | SCREENED RISK{" "}
              <span style={{ color: riskColor }}>{analysis.riskBand}</span>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "1px solid rgba(0,229,255,0.24)",
              color: "rgba(0,229,255,0.88)",
              borderRadius: 8,
              padding: "9px 14px",
              fontSize: "0.62rem",
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              cursor: "pointer",
            }}
          >
            Close
          </button>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 12,
            marginBottom: 16,
          }}
        >
          <MetricCard label="Screened Risk Score" value={`${analysis.riskScore}%`} accent={riskColor} />
          <MetricCard label="Orbital Regime" value={analysis.regime} accent="rgba(0,229,255,0.82)" />
          <MetricCard label="Altitude" value={`${currentState.altitudeKm} km`} accent="rgba(255,255,255,0.86)" />
          <MetricCard label="Velocity" value={`${currentState.speedKps ?? "--"} km/s`} accent="rgba(255,255,255,0.86)" />
          <MetricCard
            label="Sampled TCA"
            value={closestApproach ? `T+${closestApproach.sampledTcaMinutes} min` : "No close pass"}
            accent="rgba(255,209,102,0.9)"
          />
          <MetricCard
            label="Closest Separation"
            value={closestApproach ? `${closestApproach.minSeparationKm} km` : "> 500 km"}
            accent="rgba(255,209,102,0.9)"
          />
          <MetricCard
            label="Tracked Shell Density"
            value={`${analysis.shellPopulation} objects`}
            accent="rgba(0,229,255,0.82)"
          />
          <MetricCard
            label="Debris Environment Uncertainty"
            value={`${analysis.uncertaintyScore}%`}
            accent="rgba(255,140,66,0.9)"
          />
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: 16,
            alignItems: "start",
          }}
        >
          <div className="glass" style={{ padding: 14, borderRadius: 10 }}>
            <SectionLabel>AI Operational Brief</SectionLabel>
            <div
              style={{
                fontSize: "0.66rem",
                color: "var(--text)",
                lineHeight: 1.6,
                letterSpacing: "0.04em",
                whiteSpace: "pre-wrap",
              }}
            >
              {isRagLoading ? (
                  <span className="pulse" style={{ color: "rgba(0,229,255,0.7)" }}>Synthesizing RAG mitigation strategy...</span>
              ) : ragExplanation ? (
                  ragExplanation
              ) : (
                  analysis.summary
              )}
            </div>

            <div
              style={{
                display: "grid",
                gap: 8,
                marginTop: 14,
                fontSize: "0.6rem",
                color: "var(--text-dim)",
                letterSpacing: "0.08em",
              }}
            >
              <StatRow label="Sampled At" value={formatUtc(analysis.sampledAt)} />
              <StatRow label="Simulated Time" value={simTimestamp ? formatUtc(simTimestamp) : "--"} />
              <StatRow label="Latitude" value={`${currentState.latitudeDeg} deg`} />
              <StatRow label="Longitude" value={`${currentState.longitudeDeg} deg`} />
              <StatRow label="Launch Age" value={analysis.launchAgeYears ? `${analysis.launchAgeYears} yr` : "--"} />
              <StatRow label="Shell Debris Count" value={analysis.shellDebrisCount} />
              <StatRow
                label="Closest Object"
                value={closestApproach ? closestApproach.objectName : "No close candidate"}
              />
            </div>
          </div>

          <div className="glass" style={{ padding: 14, borderRadius: 10 }}>
            <SectionLabel>Screening Timeline</SectionLabel>
            <div
              style={{
                height: 170,
                borderBottom: "1px solid rgba(0,229,255,0.16)",
                position: "relative",
                marginBottom: 8,
              }}
            >
              <TrendSparkline data={analysis.riskTimeline} color={riskColor} />
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: "0.52rem",
                color: "rgba(200,214,229,0.33)",
                letterSpacing: "0.1em",
              }}
            >
              <span>NOW</span>
              <span>SCREENED RISK PROFILE</span>
              <span>T+90M</span>
            </div>

          </div>
        </div>

        <div className="glass" style={{ marginTop: 16, padding: 14, borderRadius: 10 }}>
          <SectionLabel>Rule-Based Mitigation</SectionLabel>
          {analysis.mitigations?.length ? (
            <ul style={{ listStyle: "none", display: "grid", gap: 8 }}>
              {analysis.mitigations.map((item) => (
                <li
                  key={item}
                  style={{
                    fontSize: "0.62rem",
                    color: "var(--text)",
                    lineHeight: 1.5,
                    letterSpacing: "0.04em",
                    paddingLeft: 12,
                    position: "relative",
                  }}
                >
                  <span
                    style={{
                      position: "absolute",
                      left: 0,
                      top: 0,
                      color: "rgba(255,209,102,0.82)",
                    }}
                  >
                    *
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          ) : (
            <div style={{ fontSize: "0.62rem", color: "var(--text-dim)", letterSpacing: "0.05em" }}>
              No rule-based mitigations generated for the current screening state.
            </div>
          )}
        </div>

        <div className="glass" style={{ marginTop: 16, padding: 14, borderRadius: 10 }}>
          <SectionLabel>Closest Approach Snapshot</SectionLabel>
          {closestApproach ? (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: 10,
                fontSize: "0.62rem",
                color: "var(--text)",
                letterSpacing: "0.05em",
              }}
            >
              <StatRow label="Object" value={closestApproach.objectName} />
              <StatRow label="Type" value={closestApproach.objectType} />
              <StatRow label="NORAD" value={closestApproach.noradId} />
              <StatRow label="Current Separation" value={`${closestApproach.currentSeparationKm} km`} />
              <StatRow label="Min Separation" value={`${closestApproach.minSeparationKm} km`} />
              <StatRow label="Sampled TCA" value={`T+${closestApproach.sampledTcaMinutes} min`} />
              <StatRow label="Pair Risk" value={`${closestApproach.pairRiskScore ?? analysis.riskScore}%`} />
            </div>
          ) : (
            <div style={{ fontSize: "0.62rem", color: "var(--text-dim)", letterSpacing: "0.05em" }}>
              No close tracked approach was found inside the current screening window.
            </div>
          )}


        </div>
      </div>
    </div>
  );
}

function areEqual(prevProps, nextProps) {
  return (
    prevProps.isOpen === nextProps.isOpen &&
    prevProps.target === nextProps.target &&
    prevProps.analysis === nextProps.analysis &&
    prevProps.simTimestamp === nextProps.simTimestamp
  );
}

export default memo(DeepAnalysisOverlay, areEqual);
