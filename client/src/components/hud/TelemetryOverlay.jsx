export default function TelemetryOverlay({ analysis, datasetStats }) {
  const altitude = analysis?.currentState?.altitudeKm;
  const speed = analysis?.currentState?.speedKps;
  const regime = analysis?.regime;
  const tca = analysis?.closestApproach?.sampledTcaMinutes;

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
          animation: "glowPulse 3s ease-in-out infinite",
        }}
      >
        TRACKED: {datasetStats.totalTracked} DEBRIS: {datasetStats.byType.DEBRIS}
      </div>
      <div
        style={{
          fontSize: "0.55rem",
          animation: "fadeFlicker 2.5s ease-in-out infinite",
        }}
      >
        {analysis
          ? `ALT ${altitude} KM  SPEED ${speed} KM/S`
          : "NO TARGET LOCK  |  STANDBY"}
      </div>
      <div
        style={{
          fontSize: "0.55rem",
          animation: "fadeFlicker 2.7s ease-in-out infinite",
        }}
      >
        {analysis
          ? `REGIME ${regime}  |  SAMPLED TCA ${tca} MIN`
          : "CONJUNCTION SCREENING ACTIVE"}
      </div>
    </div>
  );
}
