export default function TelemetryOverlay({
  analysis,
  datasetStats,
  activePair,
  activePairTimelineEvent,
  activeScenario,
}) {
  const altitude = analysis?.currentState?.altitudeKm;
  const speed = analysis?.currentState?.speedKps;
  const regime = analysis?.regime;
  const tca = activePairTimelineEvent?.timeline_minute
    ?? activePair?.timeline_minute
    ?? activePair?.sampled_tca_minutes
    ?? analysis?.closestApproach?.sampledTcaMinutes;
  const pairLabel = activePair ? `${activePair.target_name} VS ${activePair.candidate_name}` : null;
  const eventTone = activePair?.is_confirmed_collision
    ? "#ff5f57"
    : activePair?.event_class === "super_close_call"
      ? "#ff8c42"
      : activePair?.event_class === "close_approach"
        ? "#ffd166"
        : "#d97f2a";
  const scenarioLabel = activeScenario
    ? activeScenario.kind === "collision"
      ? `${activeScenario.collisionStarted ? "SCENARIO COLLISION LIVE" : "SCENARIO COLLISION READY"
      } | FRAG ${activeScenario.fragmentIds?.length ?? 0}`
      : `SCENARIO PROX | SYNTH ${activeScenario.compareName || "--"}`
    : null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: 30,
        right: 12,
        zIndex: 40,
        fontFamily: "'DM Mono', monospace",
        fontSize: "0.62rem",
        letterSpacing: "0.12em",
        color: "#d97f2a",
        textShadow: "0 0 8px rgba(217, 127, 42, 0.5)",
        pointerEvents: "none",
        lineHeight: 1.8,
        textAlign: "right",
      }}
    >
      <div
        style={{
          fontSize: "0.55rem",
        }}
      >
        TRACKED: {datasetStats.totalTracked} DEBRIS: {datasetStats.byType.DEBRIS}
      </div>
      <div
        style={{
          fontSize: "0.55rem",
        }}
      >
        {analysis
          ? `ALT ${altitude} KM  SPEED ${speed} KM/S`
          : "NO TARGET LOCK  |  STANDBY"}
      </div>
      <div
        style={{
          fontSize: "0.55rem",
        }}
      >
        {analysis
          ? `REGIME ${regime}  |  SAMPLED TCA ${tca} MIN`
          : "CONJUNCTION SCREENING ACTIVE"}
      </div>
      {activePair ? (
        <div
          style={{
            fontSize: "0.55rem",
            color: eventTone,
          }}
        >
          {activePair.event_label || activePair.risk_band}  |  {pairLabel}
        </div>
      ) : null}
    </div>
  );
}
