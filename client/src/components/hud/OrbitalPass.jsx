import { formatUtc } from "../../utils/orbitalAnalysis";

export default function OrbitalPass({ analysis, simTimestamp }) {
  const now = simTimestamp ? new Date(simTimestamp) : new Date();
  const dateStr = now.toISOString().split("T")[0];
  const timeStr = now.toISOString().split("T")[1].slice(0, 8);

  return (
    <div
      style={{
        position: "fixed",
        top: 100,
        right: 12,
        zIndex: 20,
        fontFamily: "'DM Mono', monospace",
        fontSize: "0.65rem",
        letterSpacing: "0.15em",
        color: "#d97f2a",
        textShadow: "0 0 8px rgba(217, 127, 42, 0.5)",
        pointerEvents: "none",
        lineHeight: 1.6,
        textAlign: "right",
      }}
    >
      <div style={{ fontSize: "0.55rem", marginBottom: 6 }}>
        SCAN {dateStr} {timeStr}Z
      </div>
      <div style={{ fontSize: "0.55rem", marginBottom: 3 }}>
        SCREEN WINDOW: 90MIN PASS: ACTIVE-526
      </div>
      <div style={{ fontSize: "0.55rem" }}>
        {analysis ? `LAST BRIEF ${formatUtc(analysis.sampledAt)}` : "TRACKED OBJECT FEED NOMINAL"}
      </div>
    </div>
  );
}
