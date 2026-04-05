// ─────────────────────────────────────────────────────────────────────────────
// Toast
// Centered, timed notification bar that slides in/out from the top
// ─────────────────────────────────────────────────────────────────────────────

export default function Toast({ message, phase, variant = "info", top = 82 }) {
  if (!message) return null;

  const isWarning = variant === "warning";
  const theme = isWarning
    ? {
      background: "rgba(210,24,24,0.24)",
      border: "1px solid rgba(255,96,96,0.72)",
      color: "rgba(255,238,238,0.99)",
      boxShadow: "0 0 16px rgba(255,64,64,0.28)",
    }
    : {
      background: "rgba(0,229,255,0.08)",
      border: "1px solid rgba(0,229,255,0.22)",
      color: "rgba(0,229,255,0.82)",
      boxShadow: "0 0 14px rgba(0,229,255,0.08)",
    };

  return (
    <div
      className={phase === "in" ? "toast-in" : "toast-out"}
      style={{
        position: "fixed",
        top,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 60,
        background: theme.background,
        border: theme.border,
        borderRadius: 4,
        padding: isWarning ? "7px 12px" : "6px 18px",
        fontFamily: "'DM Mono', monospace",
        fontSize: "0.58rem",
        letterSpacing: "0.14em",
        color: theme.color,
        width: isWarning ? "min(440px, calc(100vw - 36px))" : "auto",
        maxWidth: isWarning ? "calc(100vw - 36px)" : "none",
        whiteSpace: isWarning ? "normal" : "nowrap",
        textAlign: isWarning ? "center" : "left",
        lineHeight: isWarning ? 1.4 : 1.2,
        backdropFilter: "blur(14px)",
        boxShadow: theme.boxShadow,
        pointerEvents: "none",
      }}
    >
      {message}
    </div>
  );
}
