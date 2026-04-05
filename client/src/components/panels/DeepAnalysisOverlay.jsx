import { memo, useEffect, useState } from "react";
import { formatUtc, getObjectTypeColor } from "../../utils/orbitalAnalysis";
import TrendSparkline from "../ui/TrendSparkline";

function MetricCard({ label, value, accent = "var(--cyan)", tier = "secondary" }) {
  const isPrimary = tier === "primary";
  const isTertiary = tier === "tertiary";

  return (
    <div
      className="glass"
      style={{
        padding: isPrimary ? "12px 14px" : isTertiary ? "9px 11px" : "10px 12px",
        borderRadius: 9,
        border: isPrimary ? `1px solid ${accent}33` : "1px solid rgba(0,229,255,0.12)",
        boxShadow: isPrimary ? `0 0 18px ${accent}22` : "none",
      }}
    >
      <div
        style={{
          fontSize: isPrimary ? "0.5rem" : "0.52rem",
          color: "var(--text-dim)",
          letterSpacing: isPrimary ? "0.13em" : "0.12em",
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>
      <div
        style={{
          marginTop: 5,
          fontFamily: "'DM Mono', monospace",
          fontSize: isPrimary ? "1.56rem" : isTertiary ? "0.95rem" : "1.08rem",
          color: accent,
          fontWeight: isPrimary ? 700 : 600,
          lineHeight: isPrimary ? 1.1 : 1.2,
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

function SnapshotMetric({ label, value, accent = "rgba(255,255,255,0.9)" }) {
  return (
    <div
      style={{
        padding: "10px 12px",
        borderRadius: 8,
        background: "rgba(7, 16, 24, 0.82)",
        border: "1px solid rgba(0,229,255,0.14)",
      }}
    >
      <div
        style={{
          fontSize: "0.52rem",
          color: "var(--text-dim)",
          letterSpacing: "0.11em",
          textTransform: "uppercase",
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: "0.72rem",
          color: accent,
          letterSpacing: "0.04em",
          lineHeight: 1.35,
          fontFamily: "'DM Mono', monospace",
          wordBreak: "break-word",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function extractTimelineValue(point) {
  if (typeof point === "number") return point;
  if (point && typeof point.value === "number") return point.value;
  return null;
}

function resolveTimelinePeak(points = []) {
  if (!Array.isArray(points) || points.length === 0) return null;

  let maxValue = -Infinity;
  let peakIndex = -1;
  let peakLabel = null;

  points.forEach((point, index) => {
    const value = extractTimelineValue(point);
    if (value === null || value <= maxValue) return;
    maxValue = value;
    peakIndex = index;
    peakLabel =
      (typeof point === "object" && point && (point.label || point.timeLabel || point.time))
      || `T+${index * 5}M`;
  });

  if (peakIndex < 0) return null;
  return {
    value: Number(maxValue.toFixed(1)),
    label: String(peakLabel),
  };
}

function formatRuleAction(action) {
  const text = String(action || "").trim();
  if (!text) return text;

  if (text.startsWith("Immediate maneuver planning recommended")) {
    return "Prepare and validate an avoidance maneuver option before the predicted closest approach.";
  }
  if (text.startsWith("Open a collision review window now")) {
    return "Start collision review now and evaluate a pre-planned avoidance burn before TCA.";
  }
  if (text.startsWith("Keep the conjunction under active review")) {
    return "Maintain active conjunction screening until the encounter window closes.";
  }
  if (text.startsWith("Escalate operational urgency")) {
    return "Escalate operations priority immediately due to short time-to-closest-approach.";
  }
  if (text.startsWith("Increase propagation cadence")) {
    return "Increase propagation cadence until the conjunction window has safely passed.";
  }
  if (text.startsWith("Treat the surrounding shell as debris-rich")) {
    return "Avoid prolonged station-keeping in this altitude band due to debris-rich conditions.";
  }
  if (text.startsWith("Prefer conservative planning")) {
    return "Apply conservative maneuver thresholds because environmental complexity is elevated.";
  }
  if (text.startsWith("Adjust along-track timing")) {
    return "Adjust along-track timing to avoid high-uncertainty corridor crossings near encounter time.";
  }
  if (text.startsWith("Preserve payload mission value")) {
    return "Preserve payload mission margin by confirming maneuver authority, contact windows, and fuel reserves.";
  }

  return text;
}

function DeepAnalysisOverlay({ target, analysis, isOpen, onClose, simTimestamp }) {
  const [ragExplanation, setRagExplanation] = useState(null);
  const [isRagLoading, setIsRagLoading] = useState(false);
  const isLlmOfflineMessage = (text) => {
    const value = String(text || "");
    return (
      value.includes("LLM Explanation Engine offline") ||
      value.includes("Advanced AI diagnostics unavailable") ||
      value.includes("Please check API configuration")
    );
  };

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
          closest_distance_km: analysis.closestApproach ? analysis.closestApproach.minSeparationKm : null,
          tca_minutes: analysis.closestApproach ? analysis.closestApproach.sampledTcaMinutes : null,
          uncertainty_score: analysis.uncertaintyScore,
          risk_score: analysis.riskScore,
          risk_band: analysis.riskBand,
          regime: analysis.regime,
          debris_share: analysis.shellDebrisRatio,
          density_band: analysis.densityBand,
          tracked_debris: analysis.shellDebrisCount,
          objects_in_orbital_band: analysis.shellPopulation,
          anomaly_level: analysis.uncertaintyComponents?.anomalyScore,
        };
        const res = await fetch(`${apiBaseUrl}/analysis/explain`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (isMounted) {
          const resolved = (data.explanation || data.detail || "").trim();
          if (!resolved || isLlmOfflineMessage(resolved)) {
            setRagExplanation(null);
          } else {
            setRagExplanation(resolved);
          }
        }
      } catch (err) {
        if (isMounted) {
          setRagExplanation(null);
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
  const timelinePeak = resolveTimelinePeak(analysis.riskTimeline);
  const prioritizedActions = (analysis.mitigations || []).map((item, index) => ({
    id: `${index}-${item}`,
    priority: `Priority ${index + 1}`,
    text: formatRuleAction(item),
  }));

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 120,
        background: "rgba(4, 8, 12, 0.9)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        padding: "clamp(10px, 2vw, 22px)",
        overflowY: "auto",
      }}
    >
      <div
        className="glass"
        style={{
          width: "100%",
          minHeight: "calc(100vh - 44px)",
          borderRadius: 14,
          padding: "clamp(12px, 2vw, 22px)",
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

        <div style={{ marginBottom: 16, display: "grid", gap: 12 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 12,
            }}
          >
            <MetricCard label="Risk Score" value={`${analysis.riskScore}%`} accent={riskColor} tier="primary" />
            <MetricCard
              label="Closest Separation"
              value={closestApproach ? `${closestApproach.minSeparationKm} km` : "> 500 km"}
              accent="rgba(255,209,102,0.95)"
              tier="primary"
            />
            <MetricCard
              label="Time to Closest Approach"
              value={closestApproach ? `T+${closestApproach.sampledTcaMinutes} min` : "No close pass"}
              accent="rgba(255,209,102,0.95)"
              tier="primary"
            />
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
              gap: 12,
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
                gap: 12,
              }}
            >
              <MetricCard label="Orbital Regime" value={analysis.regime} accent="rgba(0,229,255,0.82)" tier="secondary" />
              <MetricCard label="Altitude" value={`${currentState.altitudeKm} km`} accent="rgba(255,255,255,0.88)" tier="secondary" />
              <MetricCard label="Velocity" value={`${currentState.speedKps ?? "--"} km/s`} accent="rgba(255,255,255,0.88)" tier="secondary" />
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                gap: 12,
              }}
            >
              <MetricCard label="Objects in Orbital Band" value={`${analysis.shellPopulation}`} accent="rgba(0,229,255,0.76)" tier="tertiary" />
              <MetricCard label="Environmental Complexity" value={`${analysis.uncertaintyScore}%`} accent="rgba(255,140,66,0.86)" tier="tertiary" />
            </div>
          </div>
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
                <span className="pulse" style={{ color: "rgba(0,229,255,0.7)" }}>Synthesizing AI operational brief...</span>
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
            <SectionLabel>Risk Timeline (Now to T+90M)</SectionLabel>
            <div
              style={{
                marginBottom: 8,
                fontSize: "0.56rem",
                color: "rgba(200,214,229,0.46)",
                letterSpacing: "0.05em",
                lineHeight: 1.45,
              }}
            >
              Risk trend over the screening window; peak values indicate highest conjunction urgency.
            </div>
            <div
              style={{
                height: 170,
                borderBottom: "1px solid rgba(0,229,255,0.16)",
                position: "relative",
                marginBottom: 8,
              }}
            >
              <div
                style={{
                  position: "absolute",
                  left: 8,
                  top: 8,
                  display: "grid",
                  gap: 4,
                  zIndex: 2,
                  fontSize: "0.44rem",
                  color: "rgba(200,214,229,0.36)",
                  letterSpacing: "0.08em",
                }}
              >
                <span>HIGH</span>
                <span>ELEVATED</span>
                <span>LOW</span>
              </div>
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
            <div
              style={{
                marginTop: 6,
                fontSize: "0.5rem",
                color: "rgba(255,209,102,0.75)",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              {timelinePeak ? `Peak risk ${timelinePeak.value}% at ${timelinePeak.label}` : "Peak risk annotation unavailable"}
            </div>

          </div>
        </div>

        <div className="glass" style={{ marginTop: 16, padding: 14, borderRadius: 10 }}>
          <SectionLabel>Closest Approach Details</SectionLabel>
          {closestApproach ? (
            <>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
                  gap: 12,
                }}
              >
                <SnapshotMetric
                  label="Minimum Separation"
                  value={`${closestApproach.minSeparationKm} km`}
                  accent="rgba(255,209,102,0.94)"
                />
                <SnapshotMetric
                  label="Pair Risk Score"
                  value={`${closestApproach.pairRiskScore ?? analysis.riskScore}% (${closestApproach.pairRiskBand ?? analysis.riskBand})`}
                  accent={closestApproach.pairRiskColor ?? analysis.riskColor}
                />
                <SnapshotMetric
                  label="Time to Closest Approach"
                  value={`T+${closestApproach.sampledTcaMinutes} min`}
                  accent="rgba(0,229,255,0.9)"
                />
              </div>

              <div
                style={{
                  margin: "12px 0",
                  borderTop: "1px solid rgba(0,229,255,0.12)",
                }}
              />

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
                  gap: 12,
                }}
              >
                <SnapshotMetric label="Object Name" value={closestApproach.objectName} />
                <SnapshotMetric label="Object Type" value={closestApproach.objectType} />
                <SnapshotMetric label="NORAD ID" value={closestApproach.noradId} />
                <SnapshotMetric
                  label="Current Separation"
                  value={`${closestApproach.currentSeparationKm} km`}
                  accent="rgba(255,255,255,0.95)"
                />
                <SnapshotMetric
                  label="Zone Crossing"
                  value={closestApproach.zoneCrossingDetected ? `Yes (${closestApproach.zoneCrossingCells ?? 0} cells)` : "No"}
                  accent={closestApproach.zoneCrossingDetected ? "rgba(255,140,66,0.95)" : "rgba(173,255,214,0.92)"}
                />
              </div>
            </>
          ) : (
            <div style={{ fontSize: "0.62rem", color: "var(--text-dim)", letterSpacing: "0.05em" }}>
              No close tracked approach was found inside the current screening window.
            </div>
          )}
        </div>

        <div className="glass" style={{ marginTop: 16, padding: 14, borderRadius: 10 }}>
          <SectionLabel>Recommended Actions (Rule-Based)</SectionLabel>
          {prioritizedActions.length ? (
            <ul style={{ listStyle: "none", display: "grid", gap: 10 }}>
              {prioritizedActions.map((item) => (
                <li
                  key={item.id}
                  style={{
                    border: "1px solid rgba(0,229,255,0.1)",
                    borderRadius: 8,
                    background: "rgba(11,15,20,0.52)",
                    padding: "9px 10px",
                  }}
                >
                  <div
                    style={{
                      fontSize: "0.48rem",
                      color: "rgba(255,209,102,0.9)",
                      letterSpacing: "0.16em",
                      textTransform: "uppercase",
                      marginBottom: 4,
                    }}
                  >
                    {item.priority}
                  </div>
                  <div
                    style={{
                      fontSize: "0.62rem",
                      color: "var(--text)",
                      lineHeight: 1.48,
                      letterSpacing: "0.04em",
                    }}
                  >
                    {item.text}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div style={{ fontSize: "0.62rem", color: "var(--text-dim)", letterSpacing: "0.05em" }}>
              No rule-based actions required at the current risk level.
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
