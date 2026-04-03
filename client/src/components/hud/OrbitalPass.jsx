export default function OrbitalPass({ analysis, simTimestamp }) {
  const now = simTimestamp ? new Date(simTimestamp) : new Date();
  const timeStr = now.toISOString().split("T")[1].slice(0, 8);

  return (
    <div
      style={{
        position: "fixed",
        top: 88,
        right: 22,
        zIndex: 20,
        fontFamily: "'DM Mono', monospace",
        fontSize: "0.5rem",
        letterSpacing: "0.12em",
        color: "rgba(200,214,229,0.4)",
        pointerEvents: "none",
        textAlign: "right",
        padding: "6px 10px",
        borderRadius: 999,
        border: "1px solid rgba(0,229,255,0.08)",
        background: "rgba(11,15,20,0.5)",
      }}
    >
      {analysis ? `Screen window 90m • brief ${timeStr}Z` : "Tracked feed nominal"}
    </div>
  );
}
