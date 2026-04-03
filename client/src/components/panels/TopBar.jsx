export default function TopBar({
  recTime,
  datasetStats,
  selectedTarget,
  analysisSnapshot,
  activePair,
  activeScenario,
  simOffsetHours = 0,
}) {
  const selectedLabel = selectedTarget?.details?.OBJECT_NAME || "NO TARGET LOCK";
  const riskLabel = activePair?.risk_band || analysisSnapshot?.riskBand || "STANDBY";
  const riskColor = activePair?.risk_color
    || (activePair?.risk_band
      ? activePair.risk_band === "SEVERE"
        ? "#ff5f57"
        : activePair.risk_band === "HIGH"
          ? "#ff8c42"
          : activePair.risk_band === "ELEVATED"
            ? "#ffd166"
            : "#00d1ff"
      : analysisSnapshot?.riskColor || "rgba(0,229,255,0.55)");
  const riskChip = activePair ? `Risk ${activePair.risk_score}% ${riskLabel}` : `Risk ${riskLabel}`;
  const datasetLabel =
    datasetStats.status === "error"
      ? "DATA LINK DEGRADED"
      : datasetStats.cached
        ? "TRACKED OBJECT CACHE"
        : "LIVE TRACKED FEED";

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 30,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        padding: "16px 22px 0",
        pointerEvents: "none",
      }}
    >
      <div className="slide-in-left-flat-top" style={{ pointerEvents: "all" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <div>
            <div
              style={{
                fontFamily: "'Syne', sans-serif",
                fontSize: "1rem",
                fontWeight: 700,
                letterSpacing: "0.08em",
                color: "rgba(255,255,255,0.88)",
                textShadow: "0 0 20px rgba(0,229,255,0.35)",
                lineHeight: 1,
              }}
            >
              KesslerX
            </div>
            <div
              style={{
                fontSize: "0.46rem",
                letterSpacing: "0.14em",
                color: "rgba(0,229,255,0.5)",
                textTransform: "uppercase",
                marginTop: 2,
              }}
            >
              Orbital Risk Intelligence
            </div>
          </div>
        </div>

        <div
          style={{
            marginTop: 6,
            fontSize: "0.48rem",
            letterSpacing: "0.12em",
            color: "rgba(200,214,229,0.36)",
          }}
        >
          Space-Track live screening
        </div>
      </div>

      <div
        className="slide-in-right"
        style={{
          textAlign: "right",
          pointerEvents: "none",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-end",
          gap: 8,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: 6,
            fontSize: "0.62rem",
            color: "rgba(255,59,59,0.85)",
            letterSpacing: "0.1em",
          }}
        >
          <div
            className="rec-blink"
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "#ff3b3b",
              boxShadow: "0 0 8px #ff3b3b",
            }}
          />
          <span style={{ fontFamily: "'DM Mono', monospace" }}>
            REC {recTime}
          </span>
        </div>

        <div
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            justifyContent: "flex-end",
            maxWidth: 520,
          }}
        >
          {[
            `${String(datasetStats.source || "spacetrack").toUpperCase()}`,
            `Tracked ${datasetStats.totalTracked}`,
            `Offset +${simOffsetHours.toFixed(2)}h`,
            activeScenario
              ? `${
                  activeScenario.kind === "collision"
                    ? activeScenario.collisionStarted
                      ? "Collision live"
                      : "Collision armed"
                    : "Scenario prox"
                } ${activeScenario.injectedCount ?? 1}`
              : null,
            riskChip,
            selectedTarget ? selectedLabel : "No target",
          ].filter(Boolean).map((chip) => (
            <span
              key={chip}
              style={{
                padding: "6px 10px",
                borderRadius: 999,
                border: "1px solid rgba(0,229,255,0.12)",
                background: "rgba(11,15,20,0.56)",
                fontSize: "0.48rem",
                letterSpacing: "0.1em",
                color: chip === riskChip ? riskColor : "rgba(200,214,229,0.62)",
                fontFamily: "'DM Mono', monospace",
              }}
            >
              {chip}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
