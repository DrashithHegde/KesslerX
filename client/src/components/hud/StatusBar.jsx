export default function StatusBar({ recTime, datasetStats, selectedTarget, alertCount = 0 }) {
  const byType = datasetStats.byType || {};

  return (
    <div
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        height: 22,
        zIndex: 50,
        background: "rgba(4,7,11,0.78)",
        borderTop: "1px solid rgba(0,229,255,0.07)",
        backdropFilter: "blur(10px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 18px",
        fontFamily: "'DM Mono', monospace",
        fontSize: "0.52rem",
        letterSpacing: "0.12em",
        color: "rgba(200,214,229,0.32)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
        <div
          className="status-pulse"
          style={{
            width: 5,
            height: 5,
            borderRadius: "50%",
            background: "#1dd1a1",
            boxShadow: "0 0 6px #1dd1a1",
            flexShrink: 0,
          }}
        />
        SYSTEM NOMINAL // CONJUNCTION SCREENING ACTIVE
      </div>

      <div>
        {selectedTarget
          ? `TARGET: ${selectedTarget.details.OBJECT_NAME.toUpperCase()}`
          : "GLOBAL TRACKED OBJECT OVERVIEW"}
      </div>

      <div>
        SRC {String(datasetStats.source || "spacetrack").toUpperCase()} | ALERTS {alertCount} | TRACKED {datasetStats.totalTracked} | PAYLOAD {byType.PAYLOAD || 0} | DEBRIS {byType.DEBRIS || 0} | R/B {byType["ROCKET BODY"] || 0} | OTHER {byType.OTHER || 0} | {recTime}
      </div>
    </div>
  );
}
