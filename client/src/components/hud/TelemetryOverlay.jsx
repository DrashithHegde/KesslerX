export default function TelemetryOverlay({ analysis, datasetStats, activePair, activeScenario }) {
  const altitude = analysis?.currentState?.altitudeKm;
  const speed = analysis?.currentState?.speedKps;
  const regime = analysis?.regime;
  const tca = activePair?.sampled_tca_minutes ?? analysis?.closestApproach?.sampledTcaMinutes;
  const pairLabel = activePair ? `${activePair.target_name} VS ${activePair.candidate_name}` : null;
  const scenarioLabel = activeScenario
    ? activeScenario.kind === "collision"
      ? `${
          activeScenario.collisionStarted ? "SCENARIO COLLISION LIVE" : "SCENARIO COLLISION READY"
        } | FRAG ${activeScenario.fragmentIds?.length ?? 0}`
      : `SCENARIO PROX | SYNTH ${activeScenario.compareName || "--"}`
    : null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: 90,
        right: 22,
        zIndex: 40,
        fontFamily: "'DM Mono', monospace",
        fontSize: "0.5rem",
        letterSpacing: "0.08em",
        pointerEvents: "none",
        textAlign: "right",
        padding: "8px 10px",
        borderRadius: 12,
        border: "1px solid rgba(0,229,255,0.08)",
        background: "rgba(11,15,20,0.5)",
        color: "rgba(200,214,229,0.5)",
      }}
      >
      {analysis
        ? `${scenarioLabel ? `${scenarioLabel} | ` : ""}${pairLabel ? `${pairLabel} | ` : ""}ALT ${altitude} km | SPD ${speed} km/s | ${regime} | TCA ${tca}m`
        : `TRACKED ${datasetStats.totalTracked} | DEBRIS ${datasetStats.byType.DEBRIS}`}
    </div>
  );
}
