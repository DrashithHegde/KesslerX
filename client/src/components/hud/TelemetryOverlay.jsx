export default function TelemetryOverlay({ analysis, datasetStats, activePair, activeScenario }) {
  const altitude = analysis?.currentState?.altitudeKm;
  const speed = analysis?.currentState?.speedKps;
  const regime = analysis?.regime;
  const tca = activePair?.sampled_tca_minutes ?? analysis?.closestApproach?.sampledTcaMinutes;
  const pairLabel = activePair ? `${activePair.target_name} VS ${activePair.candidate_name}` : null;
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
    </div>
  );
}
