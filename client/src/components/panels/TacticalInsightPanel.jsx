import { useCallback, useEffect, useRef } from "react";
import { formatTPlusMinutes, getObjectTypeColor } from "../../utils/orbitalAnalysis";

function riskBandColor(riskBand) {
  if (riskBand === "SEVERE") return "#ff5f57";
  if (riskBand === "HIGH") return "#ff8c42";
  if (riskBand === "ELEVATED") return "#ffd166";
  return "#00d1ff";
}

function buildOneLineInsight({ riskBand, minSeparationKm, densityBand }) {
  const riskTone =
    riskBand === "SEVERE"
      ? "Severe"
      : riskBand === "HIGH"
        ? "High"
        : riskBand === "ELEVATED"
          ? "Moderate"
          : "Low";

  const proximity =
    minSeparationKm == null
      ? "limited close-pass telemetry"
      : minSeparationKm <= 300
        ? "multiple close approaches"
        : "moderate separation windows";

  return `WARNING: ${riskTone} conjunction risk due to ${proximity} in a ${(densityBand || "mixed-density").toLowerCase()} debris environment.`;
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
          fontSize: "0.62rem",
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
            fontSize: "0.56rem",
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
          fontSize: "0.54rem",
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
          fontSize: "0.82rem",
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
        fontSize: "0.64rem",
        letterSpacing: "0.06em",
      }}
    >
      <span
        style={{
          minWidth: 0,
          color: "rgba(200,214,229,0.34)",
          textTransform: "uppercase",
        }}
      >
        {label}
      </span>
      <span
        style={{
          minWidth: 0,
          color: accent || "rgba(255,255,255,0.82)",
          textAlign: "right",
          wordBreak: "break-word",
        }}
      >
        {value}
      </span>
    </div>
  );
}

function NearbyObjectRow({ item, active, onClick, rank = 1 }) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onClick?.(item.noradId);
      }}
      style={{
        width: "100%",
        textAlign: "left",
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) 96px",
        gap: 10,
        alignItems: "start",
        padding: "10px 0",
        borderTop: rank > 1 ? "1px solid rgba(0,229,255,0.08)" : "none",
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
            fontSize: "0.64rem",
            letterSpacing: "0.05em",
            color: active ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.8)",
            lineHeight: 1.35,
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
            wordBreak: "break-word",
          }}
        >
          {rank}. {item.objectName}
        </div>
        <div
          style={{
            marginTop: 3,
            fontSize: "0.54rem",
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
          fontFamily: "'DM Mono', monospace",
        }}
      >
        <div
          style={{
            fontSize: "0.64rem",
            color: active ? "rgba(255,209,102,0.92)" : "rgba(0,229,255,0.82)",
          }}
        >
          {item.minSeparationKm ?? item.currentSeparationKm} km
        </div>
        <div
          style={{
            marginTop: 3,
            fontSize: "0.52rem",
            color: "rgba(200,214,229,0.3)",
            letterSpacing: "0.06em",
            lineHeight: 1.25,
          }}
        >
          {item.sampledTcaMinutes !== undefined && item.sampledTcaMinutes !== null
            ? `${formatTPlusMinutes(item.sampledTcaMinutes, true)} | dAlt ${item.altitudeDeltaKm} km`
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
  activePairTimelineEvent,
  comparedNoradId,
  simRunning = false,
  onCompareObject,
  onOpenAnalysis,
  onClearTarget,
  onShowWarning,
  onClearWarning,
}) {
  const effectiveRiskScore = activePair?.risk_score ?? analysis?.riskScore;
  const collisionConfirmed = Boolean(activePair?.is_confirmed_collision);
  const effectiveRiskBand = activePair?.risk_band ?? analysis?.riskBand;
  const effectiveRiskColor = activePair?.risk_color ?? (
    activePair?.risk_band
      ? riskBandColor(activePair.risk_band)
      : analysis?.riskColor
  );
  const effectiveTca = activePairTimelineEvent?.timeline_minute
    ?? activePair?.timeline_minute
    ?? activePair?.sampled_tca_minutes
    ?? analysis?.closestApproach?.sampledTcaMinutes;
  const effectiveClosestPass = activePair?.min_separation_km ?? analysis?.closestApproach?.minSeparationKm;
  const riskScoreValue = Number(effectiveRiskScore || 0);
  const closestPassValue = Number(effectiveClosestPass);
  const tcaValue = Number(effectiveTca);
  const hasClosestPass = Number.isFinite(closestPassValue);
  const hasTca = Number.isFinite(tcaValue);

  // Gate top warning popup to only critical selections, not every object click.
  const isRealDanger =
    effectiveRiskBand === "SEVERE" ||
    (effectiveRiskBand === "HIGH" && (
      (hasClosestPass && closestPassValue <= 300) ||
      (hasTca && tcaValue <= 60)
    )) ||
    riskScoreValue >= 80 ||
    (hasClosestPass && closestPassValue <= 150 && riskScoreValue >= 55);
  const oneLineInsight = buildOneLineInsight({
    riskBand: effectiveRiskBand,
    minSeparationKm: effectiveClosestPass,
    densityBand: analysis?.densityBand,
  });
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
        sampledTcaMinutes: activePairTimelineEvent?.timeline_minute ?? activePair.sampled_tca_minutes,
        pairRiskScore: activePair.risk_score,
        pairRiskBand: activePair.risk_band,
        pairRiskColor: activePair.risk_color ?? riskBandColor(activePair.risk_band),
        altitudeDeltaKm: "--",
      },
      ...screenedObjects,
    ]
    : screenedObjects;
  const topThreats = visibleScreenedObjects.slice(0, 4);
  const warningFingerprintRef = useRef(null);
  const clearWarningTimerRef = useRef(null);
  const lastTargetNoradRef = useRef(null);
  const targetNoradId = target?.details?.NORAD_CAT_ID ?? null;

  const cancelScheduledWarningClear = useCallback(() => {
    if (clearWarningTimerRef.current) {
      clearTimeout(clearWarningTimerRef.current);
      clearWarningTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (lastTargetNoradRef.current === null) {
      lastTargetNoradRef.current = targetNoradId;
      return;
    }

    if (lastTargetNoradRef.current !== targetNoradId) {
      cancelScheduledWarningClear();
      warningFingerprintRef.current = null;
      onClearWarning?.();
    }

    lastTargetNoradRef.current = targetNoradId;
  }, [targetNoradId, onClearWarning, cancelScheduledWarningClear]);

  useEffect(() => {
    cancelScheduledWarningClear();

    if (simRunning) {
      warningFingerprintRef.current = null;
      onClearWarning?.();
      return;
    }
    if (!target || !analysis) {
      warningFingerprintRef.current = null;
      // During rapid target swaps, analysis can be briefly null; avoid instant flicker.
      clearWarningTimerRef.current = setTimeout(() => {
        onClearWarning?.();
        clearWarningTimerRef.current = null;
      }, 450);
      return;
    }
    if (!onShowWarning) {
      return;
    }
    if (!isRealDanger) {
      warningFingerprintRef.current = null;
      onClearWarning?.();
      return;
    }
    const fingerprint = [
      target.details?.NORAD_CAT_ID || "na",
      activePair?.candidate_norad_id || "none",
      effectiveRiskBand || "unknown",
      Number.isFinite(effectiveRiskScore) ? Math.round(effectiveRiskScore) : "na",
      Number.isFinite(effectiveClosestPass) ? Math.round(effectiveClosestPass) : "na",
      Number.isFinite(effectiveTca) ? Math.round(effectiveTca) : "na",
      analysis.densityBand || "mixed",
    ].join("-");
    if (warningFingerprintRef.current === fingerprint) {
      return;
    }
    warningFingerprintRef.current = fingerprint;
    onShowWarning(oneLineInsight);
  }, [
    target,
    analysis,
    simRunning,
    effectiveRiskScore,
    effectiveClosestPass,
    effectiveTca,
    effectiveRiskBand,
    activePair,
    isRealDanger,
    oneLineInsight,
    onShowWarning,
    onClearWarning,
    cancelScheduledWarningClear,
  ]);

  useEffect(() => {
    return () => cancelScheduledWarningClear();
  }, [cancelScheduledWarningClear]);

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
        minWidth: 0,
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
          minWidth: 0,
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
                minWidth: 0,
                overflowY: "auto",
                overflowX: "hidden",
                paddingRight: 2,
              }}
            >
              <SectionLabel status={effectiveRiskBand} statusColor={effectiveRiskColor}>
                Tactical Insight
              </SectionLabel>

              <div
                style={{
                  marginTop: 0,
                  borderRadius: 8,
                  border: "1px solid rgba(0,229,255,0.1)",
                  background: "rgba(11,15,20,0.52)",
                  padding: "11px 12px",
                }}
              >
                <div
                  style={{
                    fontSize: "0.58rem",
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
                    fontSize: "0.96rem",
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
                    {collisionConfirmed ? "Collision Risk" : "Conjunction Risk"}
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
                    label="Event Time"
                    value={effectiveTca !== undefined && effectiveTca !== null ? formatTPlusMinutes(effectiveTca) : "Clear"}
                    accent="rgba(255,209,102,0.9)"
                  />
                  <StatGridCard
                    label="Closest Pass"
                    value={effectiveClosestPass !== undefined && effectiveClosestPass !== null ? `${effectiveClosestPass} km` : "> 500 km"}
                    accent="rgba(255,209,102,0.9)"
                  />
                  <StatGridCard
                    label="Objects in Orbital Band"
                    value={`${analysis.shellPopulation} objs`}
                    accent="rgba(0,229,255,0.82)"
                  />
                </div>
              </div>

              <div
                style={{ marginTop: 12 }}
              >
                <SectionLabel
                  status={comparedNoradId ? "THREAT PAIR ACTIVE" : analysis.densityBand}
                  statusColor={comparedNoradId ? "rgba(255,209,102,0.9)" : "rgba(0,229,255,0.7)"}
                >
                  Top Threats
                </SectionLabel>
                <div
                  style={{
                    borderRadius: 8,
                    border: "1px solid rgba(0,229,255,0.1)",
                    background: "rgba(11,15,20,0.52)",
                    padding: "2px 12px",
                  }}
                >
                  {topThreats.length > 0 ? (
                    topThreats.map((item, index) => (
                      <NearbyObjectRow
                        key={`${item.noradId}-${item.objectName}`}
                        item={item}
                        active={String(comparedNoradId ?? "") === String(item.noradId)}
                        onClick={onCompareObject}
                        rank={index + 1}
                      />
                    ))
                  ) : (
                    <div
                      style={{
                        padding: "10px 0",
                        fontSize: "0.64rem",
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
                  Environment
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
                    label="Environmental Complexity"
                    value={`${analysis.uncertaintyScore}%`}
                    accent="rgba(255,140,66,0.88)"
                  />
                  <DetailRow
                    label="Anomaly Level"
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
                  <DetailRow
                    label="Objects in Orbital Band"
                    value={`${analysis.shellPopulation} objects`}
                  />
                </div>
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gap: 8,
                marginTop: 10,
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
                  fontSize: "0.64rem",
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
                  fontSize: "0.62rem",
                  letterSpacing: "0.16em",
                  textTransform: "uppercase",
                  cursor: "pointer",
                }}
              >
                Unselect 
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
                  fontSize: "0.76rem",
                  color: "rgba(255,255,255,0.82)",
                  letterSpacing: "0.06em",
                }}
              >
                Awaiting target lock
              </div>
              <div
                style={{
                  marginTop: 7,
                  fontSize: "0.62rem",
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
                    <DetailRow
                      label="Pair TCA"
                      value={formatTPlusMinutes(activePairTimelineEvent?.timeline_minute ?? activePair.sampled_tca_minutes)}
                    />
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
