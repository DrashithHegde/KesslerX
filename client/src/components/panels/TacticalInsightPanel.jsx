import { getObjectTypeColor } from "../../utils/orbitalAnalysis";

function riskBandColor(riskBand) {
  if (riskBand === "SEVERE") return "#ff5f57";
  if (riskBand === "HIGH") return "#ff8c42";
  if (riskBand === "ELEVATED") return "#ffd166";
  return "#00d1ff";
}

function SectionLabel({ children, status, statusColor = "rgba(0,229,255,0.6)" }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 11,
        marginBottom: 11,
      }}
    >
      <span
        style={{
          fontSize: "0.54rem",
          letterSpacing: "0.2em",
          color: "var(--text-dim)",
          textTransform: "uppercase",
        }}
      >
        {children}
      </span>
      {status ? (
        <span
          style={{
            fontSize: "0.48rem",
            letterSpacing: "0.16em",
            color: statusColor,
            textTransform: "uppercase",
            whiteSpace: "nowrap",
          }}
        >
          {status}
        </span>
      ) : null}
    </div>
  );
}

function StatGridCard({ label, value, accent = "rgba(255,255,255,0.86)" }) {
  return (
    <div
      style={{
        borderRadius: 8,
        border: "1px solid rgba(0,229,255,0.1)",
        background: "rgba(11,15,20,0.52)",
        padding: "10px 11px",
      }}
    >
      <div
        style={{
          fontSize: "0.46rem",
          letterSpacing: "0.16em",
          color: "rgba(200,214,229,0.34)",
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>
      <div
        style={{
          marginTop: 5,
          fontSize: "0.72rem",
          letterSpacing: "0.06em",
          color: accent,
          fontWeight: 600,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function DetailRow({ label, value, accent }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 14,
        padding: "5px 0",
        fontSize: "0.56rem",
        letterSpacing: "0.06em",
      }}
    >
      <span
        style={{
          color: "rgba(200,214,229,0.34)",
          textTransform: "uppercase",
        }}
      >
        {label}
      </span>
      <span
        style={{
          color: accent || "rgba(255,255,255,0.82)",
          textAlign: "right",
        }}
      >
        {value}
      </span>
    </div>
  );
}

function NearbyObjectRow({ item, active, onClick }) {
  return (
    <button
      type="button"
      onClick={() => onClick?.(item.noradId)}
      style={{
        width: "100%",
        textAlign: "left",
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) auto",
        gap: 12,
        padding: "9px 0",
        borderTop: "1px solid rgba(0,229,255,0.08)",
        background: "transparent",
        color: "inherit",
        border: 0,
        boxShadow: "none",
        cursor: "pointer",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: "0.56rem",
            letterSpacing: "0.05em",
            color: active ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.8)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {item.objectName}
        </div>
        <div
          style={{
            marginTop: 3,
            fontSize: "0.46rem",
            letterSpacing: "0.08em",
            color: active ? "rgba(255,209,102,0.92)" : getObjectTypeColor(item.objectType),
            textTransform: "uppercase",
          }}
        >
          {active ? `Highlighted | ${item.objectType}` : item.objectType}
        </div>
      </div>
      <div
        style={{
          textAlign: "right",
          whiteSpace: "nowrap",
        }}
      >
        <div
          style={{
            fontSize: "0.56rem",
            color: active ? "rgba(255,209,102,0.92)" : "rgba(0,229,255,0.82)",
          }}
        >
          {item.minSeparationKm ?? item.currentSeparationKm} km
        </div>
        <div
          style={{
            marginTop: 3,
            fontSize: "0.45rem",
            color: "rgba(200,214,229,0.3)",
            letterSpacing: "0.06em",
          }}
        >
          {item.sampledTcaMinutes !== undefined && item.sampledTcaMinutes !== null
            ? `T+${item.sampledTcaMinutes}m | dAlt ${item.altitudeDeltaKm} km`
            : `dAlt ${item.altitudeDeltaKm} km`}
        </div>
      </div>
    </button>
  );
}

export default function TacticalInsightPanel({
  target,
  analysis,
  activePair,
  comparedNoradId,
  onCompareObject,
  onOpenAnalysis,
  onClearTarget,
}) {
  const effectiveRiskScore = activePair?.risk_score ?? analysis?.riskScore;
  const effectiveRiskBand = activePair?.risk_band ?? analysis?.riskBand;
  const effectiveRiskColor = activePair?.risk_color ?? (
    activePair?.risk_band
      ? riskBandColor(activePair.risk_band)
      : analysis?.riskColor
  );
  const effectiveTca = activePair?.sampled_tca_minutes ?? analysis?.closestApproach?.sampledTcaMinutes;
  const effectiveClosestPass = activePair?.min_separation_km ?? analysis?.closestApproach?.minSeparationKm;
  const screenedObjects = analysis?.nearbyObjects || [];
  const hasActivePairCounterpart = activePair
    ? screenedObjects.some((item) => item.noradId === activePair.candidate_norad_id)
    : true;
  const visibleScreenedObjects = activePair && !hasActivePairCounterpart
    ? [
        {
          objectName: activePair.candidate_name,
          objectType: activePair.candidate_type,
          noradId: activePair.candidate_norad_id,
          currentSeparationKm: activePair.current_separation_km,
          minSeparationKm: activePair.min_separation_km,
          sampledTcaMinutes: activePair.sampled_tca_minutes,
          pairRiskScore: activePair.risk_score,
          pairRiskBand: activePair.risk_band,
          pairRiskColor: activePair.risk_color ?? riskBandColor(activePair.risk_band),
          altitudeDeltaKm: "--",
        },
        ...screenedObjects,
      ]
    : screenedObjects;

  return (
    <div
      className="slide-in-right"
      style={{
        position: "fixed",
        top: 184,
        bottom: 148,
        right: 20,
        zIndex: 28,
        width: 298,
        display: "flex",
        flexDirection: "column",
        animationDelay: "0.08s",
      }}
    >
      <div
        className="glass"
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
          padding: "11px",
          overflow: "hidden",
          border: "1px solid rgba(0,229,255,0.13)",
          background:
            "linear-gradient(180deg, rgba(11,15,20,0.84), rgba(8,12,18,0.92))",
        }}
      >
        {target && analysis ? (
          <>
            <div
              style={{
                flex: 1,
                minHeight: 0,
                overflowY: "auto",
                paddingRight: 2,
              }}
            >
              <SectionLabel status={effectiveRiskBand} statusColor={effectiveRiskColor}>
                Tactical Insight
              </SectionLabel>

              <div
                style={{
                  borderRadius: 8,
                  border: "1px solid rgba(0,229,255,0.1)",
                  background: "rgba(11,15,20,0.52)",
                  padding: "11px 12px",
                }}
              >
                <div
                  style={{
                    fontSize: "0.5rem",
                    letterSpacing: "0.16em",
                    color: "rgba(0,229,255,0.58)",
                    textTransform: "uppercase",
                  }}
                >
                  Selected Object
                </div>
                <div
                  style={{
                    marginTop: 7,
                    fontSize: "0.84rem",
                    lineHeight: 1.35,
                    letterSpacing: "0.04em",
                    color: "rgba(255,255,255,0.92)",
                    fontWeight: 600,
                  }}
                >
                  {target.details.OBJECT_NAME}
                </div>

                <div style={{ marginTop: 8 }}>
                  <DetailRow
                    label="Type"
                    value={target.type}
                    accent={getObjectTypeColor(target.type)}
                  />
                  <DetailRow label="NORAD" value={target.details.NORAD_CAT_ID} />
                  <DetailRow label="Altitude" value={`${analysis.currentState.altitudeKm} km`} />
                  <DetailRow label="Velocity" value={`${analysis.currentState.speedKps ?? "--"} km/s`} />
                  <DetailRow label="Regime" value={analysis.regime} accent="rgba(0,229,255,0.82)" />
                </div>
              </div>

              <div style={{ marginTop: 12 }}>
                <SectionLabel status={`${effectiveRiskScore}%`} statusColor={effectiveRiskColor}>
                  Risk Snapshot
                </SectionLabel>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                    gap: 9,
                  }}
                >
                  <StatGridCard
                    label="Risk Score"
                    value={`${effectiveRiskScore}%`}
                    accent={effectiveRiskColor}
                  />
                  <StatGridCard
                    label="Sampled TCA"
                    value={effectiveTca !== undefined && effectiveTca !== null ? `T+${effectiveTca} min` : "Clear"}
                    accent="rgba(255,209,102,0.9)"
                  />
                  <StatGridCard
                    label="Closest Pass"
                    value={effectiveClosestPass !== undefined && effectiveClosestPass !== null ? `${effectiveClosestPass} km` : "> 500 km"}
                    accent="rgba(255,209,102,0.9)"
                  />
                  <StatGridCard
                    label="Tracked Shell"
                    value={`${analysis.shellPopulation} objs`}
                    accent="rgba(0,229,255,0.82)"
                  />
                </div>
              </div>

              <div
                style={{ marginTop: 12 }}
              >
                <SectionLabel
                  status={comparedNoradId ? "COMPARE ACTIVE" : analysis.densityBand}
                  statusColor={comparedNoradId ? "rgba(255,209,102,0.9)" : "rgba(0,229,255,0.7)"}
                >
                  Screened Objects
                </SectionLabel>
                <div
                  style={{
                    borderRadius: 8,
                    border: "1px solid rgba(0,229,255,0.1)",
                    background: "rgba(11,15,20,0.52)",
                    padding: "0 12px",
                  }}
                >
                  {visibleScreenedObjects.length > 0 ? (
                    visibleScreenedObjects.map((item) => (
                      <NearbyObjectRow
                        key={`${item.noradId}-${item.objectName}`}
                        item={item}
                        active={comparedNoradId === item.noradId}
                        onClick={onCompareObject}
                      />
                    ))
                  ) : (
                    <div
                      style={{
                        padding: "10px 0",
                        fontSize: "0.56rem",
                        color: "rgba(200,214,229,0.34)",
                      }}
                    >
                      No screened conjunction candidates in the current window.
                    </div>
                  )}
                </div>
              </div>

              <div
                style={{ marginTop: 12 }}
              >
                <SectionLabel
                  status={`${analysis.uncertaintyScore}%`}
                  statusColor="rgba(255,140,66,0.88)"
                >
                  Debris Environment Uncertainty
                </SectionLabel>
                <div
                  style={{
                    borderRadius: 8,
                    border: "1px solid rgba(0,229,255,0.1)",
                    background: "rgba(11,15,20,0.52)",
                    padding: "11px 12px",
                  }}
                >
                  <DetailRow
                    label="Environment Score"
                    value={`${analysis.uncertaintyScore}%`}
                    accent="rgba(255,140,66,0.88)"
                  />
                  <DetailRow
                    label="Anomaly Signal"
                    value={`${analysis.uncertaintyComponents?.anomalyScore ?? 0}%`}
                  />
                  <DetailRow
                    label="Altitude Band"
                    value={`${analysis.uncertaintyComponents?.altitudeBandScore ?? 0}%`}
                  />
                  <DetailRow
                    label="Region Density"
                    value={analysis.densityBand}
                    accent="rgba(0,229,255,0.82)"
                  />
                  <DetailRow
                    label="Tracked Debris"
                    value={`${analysis.shellDebrisCount} objects`}
                  />
                  <DetailRow
                    label="Debris Share"
                    value={`${analysis.shellDebrisRatio}%`}
                  />
                </div>
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gap: 8,
                marginTop: 10,
                paddingTop: 10,
                borderTop: "1px solid rgba(0,229,255,0.08)",
                flexShrink: 0,
              }}
            >
              <button
                type="button"
                onClick={onOpenAnalysis}
                style={{
                  width: "100%",
                  padding: "9px 12px",
                  borderRadius: 6,
                  border: "1px solid rgba(0,229,255,0.3)",
                  background: "rgba(0,229,255,0.08)",
                  color: "rgba(0,229,255,0.9)",
                  boxShadow: "0 0 14px rgba(0,229,255,0.12)",
                  fontFamily: "'DM Mono', monospace",
                  fontSize: "0.56rem",
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  cursor: "pointer",
                }}
              >
                View Deep Analysis
              </button>
              <button
                type="button"
                onClick={onClearTarget}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  borderRadius: 6,
                  border: "1px solid rgba(255,90,90,0.2)",
                  background: "rgba(11,15,20,0.52)",
                  color: "rgba(255,120,120,0.72)",
                  fontFamily: "'DM Mono', monospace",
                  fontSize: "0.54rem",
                  letterSpacing: "0.16em",
                  textTransform: "uppercase",
                  cursor: "pointer",
                }}
              >
                Release Target
              </button>
            </div>
          </>
        ) : (
          <>
            <SectionLabel status="Standby">
              Tactical Insight
            </SectionLabel>
            <div
              style={{
                borderRadius: 8,
                border: "1px solid rgba(0,229,255,0.1)",
                background: "rgba(11,15,20,0.52)",
                padding: "12px 11px",
              }}
            >
              <div
                style={{
                  fontSize: "0.66rem",
                  color: "rgba(255,255,255,0.82)",
                  letterSpacing: "0.06em",
                }}
              >
                Awaiting target lock
              </div>
              <div
                style={{
                  marginTop: 7,
                  fontSize: "0.54rem",
                  lineHeight: 1.55,
                  letterSpacing: "0.04em",
                  color: "rgba(200,214,229,0.36)",
                }}
              >
                Select a tracked object to inspect risk score, closest screened approach,
                nearby traffic, compare objects, and debris uncertainty cues.
              </div>

              {activePair ? (
                <div style={{ marginTop: 12 }}>
                  <SectionLabel status="Pair Locked" statusColor="rgba(0,229,255,0.74)">
                    Active Pair
                  </SectionLabel>
                  <div
                    style={{
                      borderRadius: 8,
                      border: "1px solid rgba(0,229,255,0.1)",
                      background: "rgba(11,15,20,0.52)",
                      padding: "11px 12px",
                    }}
                  >
                    <DetailRow label="Target" value={activePair.target_name} />
                    <DetailRow label="Counterpart" value={activePair.candidate_name} accent={getObjectTypeColor(activePair.candidate_type)} />
                    <DetailRow label="Pair Risk" value={`${activePair.risk_score}%`} accent={effectiveRiskColor} />
                    <DetailRow label="Pair TCA" value={`T+${activePair.sampled_tca_minutes} min`} />
                  </div>
                </div>
              ) : null}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
