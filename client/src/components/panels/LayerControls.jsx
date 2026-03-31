function LayerChip({ config, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: "100%",
        textAlign: "left",
        padding: "8px 10px",
        display: "grid",
        gridTemplateColumns: "30px minmax(0, 1fr) 8px",
        alignItems: "center",
        columnGap: 10,
        background: active ? "rgba(0,229,255,0.1)" : "rgba(11,15,20,0.72)",
        border: active
          ? "1px solid rgba(0,229,255,0.42)"
          : "1px solid rgba(0,229,255,0.12)",
        borderRadius: 6,
        color: active ? "rgba(0,229,255,0.9)" : "rgba(200,214,229,0.55)",
        fontFamily: "'DM Mono', monospace",
        cursor: "pointer",
        boxShadow: active
          ? "0 0 14px rgba(0,229,255,0.14), inset 0 0 8px rgba(0,229,255,0.05)"
          : "none",
        transition: "all 0.22s ease",
      }}
    >
      <span
        style={{
          fontSize: "0.54rem",
          width: 30,
          alignSelf: "stretch",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          borderRight: "1px solid rgba(0,229,255,0.12)",
          color: active ? "rgba(0,229,255,0.85)" : "rgba(200,214,229,0.45)",
        }}
      >
        {config.shortLabel}
      </span>
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: "0.62rem",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          {config.label}
        </div>
        <div
          style={{
            fontSize: "0.5rem",
            color: "var(--text-faint)",
            letterSpacing: "0.04em",
            marginTop: 2,
            lineHeight: 1.35,
          }}
        >
          {config.desc}
        </div>
      </div>
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: "#00e5ff",
          boxShadow: "0 0 7px #00e5ff",
          opacity: active ? 1 : 0,
          transition: "opacity 0.22s ease",
        }}
      />
    </button>
  );
}

export default function LayerControls({
  satTypes,
  onToggleSatType,
  satTypeConfig,
  datasetStats,
  topOffset = 208,
}) {
  const activeCount = satTypeConfig.filter((cfg) => satTypes[cfg.id]).length;

  return (
    <div
      className="slide-in-left"
      style={{
        position: "fixed",
        top: topOffset,
        left: 20,
        zIndex: 30,
        width: 252,
        maxHeight: `calc(100vh - ${topOffset + 92}px)`,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        animationDelay: "0.1s",
        justifyContent: "flex-start",
      }}
    >
      <div
        className="glass"
        style={{
          padding: "10px",
          maxHeight: "100%",
          overflowY: "auto",
        }}
      >
        <div
          style={{
            padding: "0 4px 8px",
            borderBottom: "1px solid rgba(0,229,255,0.08)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
          }}
        >
          <span
            style={{
              fontSize: "0.55rem",
              letterSpacing: "0.22em",
              color: "var(--text-dim)",
              textTransform: "uppercase",
            }}
          >
            Object Filters
          </span>
          <span
            style={{
              fontSize: "0.46rem",
              letterSpacing: "0.18em",
              color: "rgba(0,229,255,0.55)",
              textTransform: "uppercase",
              whiteSpace: "nowrap",
            }}
          >
            {activeCount}/{satTypeConfig.length} active
          </span>
        </div>

        <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
          {satTypeConfig.map((cfg) => (
            <LayerChip
              key={cfg.id}
              config={cfg}
              active={!!satTypes[cfg.id]}
              onClick={() => onToggleSatType(cfg.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
