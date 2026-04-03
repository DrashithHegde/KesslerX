import { useMemo, useState } from "react";

function alertColor(riskBand) {
  if (riskBand === "SEVERE") return "#ff5f57";
  if (riskBand === "HIGH") return "#ff8c42";
  if (riskBand === "ELEVATED") return "#ffd166";
  return "#00d1ff";
}

function LayerChip({ config, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: "100%",
        textAlign: "left",
        padding: "8px 10px",
        display: "grid",
        gridTemplateColumns: "28px minmax(0, 1fr) 8px",
        alignItems: "center",
        columnGap: 10,
        background: active ? "rgba(0,229,255,0.08)" : "rgba(11,15,20,0.48)",
        border: active
          ? "1px solid rgba(0,229,255,0.32)"
          : "1px solid rgba(0,229,255,0.08)",
        borderRadius: 8,
        color: active ? "rgba(0,229,255,0.88)" : "rgba(200,214,229,0.68)",
      }}
    >
      <span
        style={{
          fontSize: "0.52rem",
          color: active ? "rgba(0,229,255,0.82)" : "rgba(200,214,229,0.42)",
          borderRight: "1px solid rgba(0,229,255,0.08)",
          paddingRight: 8,
        }}
      >
        {config.shortLabel}
      </span>
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: "0.56rem",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          {config.label}
        </div>
        <div
          style={{
            marginTop: 2,
            fontSize: "0.48rem",
            lineHeight: 1.35,
            color: "rgba(200,214,229,0.42)",
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
          opacity: active ? 1 : 0.2,
          boxShadow: active ? "0 0 8px #00e5ff" : "none",
        }}
      />
    </button>
  );
}

function TabButton({ active, label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: 1,
        padding: "8px 10px",
        borderRadius: 8,
        border: active ? "1px solid rgba(0,229,255,0.28)" : "1px solid transparent",
        background: active ? "rgba(0,229,255,0.08)" : "transparent",
        color: active ? "rgba(0,229,255,0.88)" : "rgba(200,214,229,0.44)",
        fontSize: "0.5rem",
        letterSpacing: "0.18em",
        textTransform: "uppercase",
      }}
    >
      {label}
    </button>
  );
}

function SectionTitle({ children, right }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 8,
        marginBottom: 10,
      }}
    >
      <span
        style={{
          fontSize: "0.5rem",
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: "rgba(200,214,229,0.42)",
        }}
      >
        {children}
      </span>
      {right ? (
        <span
          style={{
            fontSize: "0.46rem",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "rgba(0,229,255,0.58)",
          }}
        >
          {right}
        </span>
      ) : null}
    </div>
  );
}

function SummaryCard({ label, value, tone = "rgba(255,255,255,0.86)" }) {
  return (
    <div
      style={{
        padding: "10px 11px",
        borderRadius: 8,
        border: "1px solid rgba(0,229,255,0.08)",
        background: "rgba(11,15,20,0.42)",
      }}
    >
      <div
        style={{
          fontSize: "0.44rem",
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "rgba(200,214,229,0.34)",
        }}
      >
        {label}
      </div>
      <div
        style={{
          marginTop: 6,
          fontSize: "0.72rem",
          color: tone,
          fontWeight: 600,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function FiltersView({
  satTypes,
  onToggleSatType,
  satTypeConfig,
  datasetStats,
  layerVisibility,
  onToggleLayer,
}) {
  const layerConfigs = [
    {
      id: "riskAlerts",
      shortLabel: "ALR",
      label: "Alert Queue",
      desc: "Highest-risk conjunctions",
    },
    {
      id: "orbitalPaths",
      shortLabel: "ORB",
      label: "Orbit Paths",
      desc: "Selected object trajectory",
    },
  ];

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          gap: 8,
        }}
      >
        <SummaryCard label="Tracked" value={datasetStats.totalTracked} />
        <SummaryCard label="Debris" value={datasetStats.byType?.DEBRIS || 0} tone="rgba(255,140,66,0.9)" />
      </div>

      <div>
        <SectionTitle right={`${satTypeConfig.filter((cfg) => satTypes[cfg.id]).length}/${satTypeConfig.length}`}>
          Object Types
        </SectionTitle>
        <div style={{ display: "grid", gap: 6 }}>
          {satTypeConfig.map((cfg) => (
            <LayerChip
              key={cfg.id}
              config={cfg}
              active={Boolean(satTypes[cfg.id])}
              onClick={() => onToggleSatType(cfg.id)}
            />
          ))}
        </div>
      </div>

      <div>
        <SectionTitle right={String(datasetStats.source || "spacetrack").toUpperCase()}>
          Display Layers
        </SectionTitle>
        <div style={{ display: "grid", gap: 6 }}>
          {layerConfigs.map((cfg) => (
            <LayerChip
              key={cfg.id}
              config={cfg}
              active={Boolean(layerVisibility[cfg.id])}
              onClick={() => onToggleLayer?.(cfg.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function AlertsView({ alerts, activeAlertKey, onSelectAlert }) {
  return (
    <div style={{ display: "grid", gap: 8 }}>
      {alerts.length > 0 ? (
        alerts.map((alert) => (
          (() => {
            const alertKey = `${alert.target_norad_id}-${alert.candidate_norad_id}`;
            const isActive = activeAlertKey === alertKey;
            return (
          <button
            key={alertKey}
            type="button"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => onSelectAlert?.(alert)}
            style={{
              width: "100%",
              textAlign: "left",
              padding: "10px 11px",
              borderRadius: 8,
              border: isActive
                ? "1px solid rgba(0,229,255,0.28)"
                : "1px solid rgba(0,229,255,0.08)",
              background: isActive ? "rgba(0,229,255,0.08)" : "rgba(11,15,20,0.42)",
              color: "rgba(255,255,255,0.84)",
              boxShadow: isActive ? "0 0 0 1px rgba(0,229,255,0.1) inset" : "none",
              cursor: "pointer",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
              <span
                style={{
                  fontSize: "0.48rem",
                  letterSpacing: "0.14em",
                  color: alertColor(alert.risk_band),
                  textTransform: "uppercase",
                }}
              >
                {alert.risk_band}
              </span>
              <span style={{ fontSize: "0.48rem", color: "rgba(200,214,229,0.46)" }}>
                {alert.risk_score}%
              </span>
            </div>
            <div style={{ marginTop: 6, fontSize: "0.58rem", lineHeight: 1.45 }}>
              {alert.target_name}
            </div>
            <div style={{ marginTop: 3, fontSize: "0.48rem", color: "rgba(200,214,229,0.46)" }}>
              vs {alert.candidate_name}
            </div>
            <div
              style={{
                marginTop: 7,
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                fontSize: "0.46rem",
                color: "rgba(200,214,229,0.36)",
                textTransform: "uppercase",
              }}
            >
              <span>{alert.min_separation_km} km</span>
              <span>T+{alert.sampled_tca_minutes}m</span>
            </div>
            {isActive ? (
              <div
                style={{
                  marginTop: 7,
                  fontSize: "0.44rem",
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: "rgba(0,229,255,0.62)",
                }}
              >
                Active pair on globe
              </div>
            ) : null}
          </button>
            );
          })()
        ))
      ) : (
        <div style={{ fontSize: "0.54rem", color: "rgba(200,214,229,0.38)", lineHeight: 1.6 }}>
          No elevated conjunction alerts in the current screening window.
        </div>
      )}
    </div>
  );
}

export default function MissionSidebar({
  satTypes,
  onToggleSatType,
  satTypeConfig,
  datasetStats,
  layerVisibility,
  onToggleLayer,
  alerts,
  activeAlertKey,
  onSelectAlert,
}) {
  const [activeTab, setActiveTab] = useState("filters");
  const tabMeta = useMemo(
    () => ({
      filters: { label: "Filters" },
      alerts: { label: "Alerts" },
    }),
    []
  );

  return (
    <div
      className="slide-in-left"
      style={{
        position: "fixed",
        top: 96,
        left: 20,
        zIndex: 28,
        width: 320,
      }}
    >
      <div
        className="glass"
        style={{
          padding: "12px",
          border: "1px solid rgba(0,229,255,0.12)",
          background: "linear-gradient(180deg, rgba(11,15,20,0.88), rgba(8,12,18,0.94))",
        }}
      >
        <div style={{ marginBottom: 12 }}>
          <div
            style={{
              fontSize: "0.5rem",
              letterSpacing: "0.18em",
              color: "rgba(0,229,255,0.58)",
              textTransform: "uppercase",
            }}
          >
            Mission Sidebar
          </div>
          <div
            style={{
              marginTop: 6,
              fontSize: "0.58rem",
              lineHeight: 1.5,
              color: "rgba(200,214,229,0.5)",
            }}
          >
            One place for object filters and live alerts.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            gap: 6,
            padding: 4,
            borderRadius: 10,
            background: "rgba(11,15,20,0.5)",
            border: "1px solid rgba(0,229,255,0.08)",
            marginBottom: 12,
          }}
        >
          {Object.entries(tabMeta).map(([id, meta]) => (
            <TabButton
              key={id}
              active={activeTab === id}
              label={meta.label}
              onClick={() => setActiveTab(id)}
            />
          ))}
        </div>

        <div style={{ maxHeight: "calc(100vh - 250px)", overflowY: "auto", paddingRight: 2 }}>
          {activeTab === "filters" ? (
            <FiltersView
              satTypes={satTypes}
              onToggleSatType={onToggleSatType}
              satTypeConfig={satTypeConfig}
              datasetStats={datasetStats}
              layerVisibility={layerVisibility}
              onToggleLayer={onToggleLayer}
            />
          ) : null}
          {activeTab === "alerts" ? (
            <AlertsView alerts={alerts} activeAlertKey={activeAlertKey} onSelectAlert={onSelectAlert} />
          ) : null}
        </div>
      </div>
    </div>
  );
}
