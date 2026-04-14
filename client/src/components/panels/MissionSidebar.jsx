import { useEffect, useMemo, useState } from "react";
import { formatTPlusMinutes } from "../../utils/orbitalAnalysis";

function alertColor(riskBand) {
  if (riskBand === "SEVERE") return "#ff5f57";
  if (riskBand === "HIGH") return "#ff8c42";
  if (riskBand === "ELEVATED") return "#ffd166";
  return "#00d1ff";
}

function alertEventLabel(alert) {
  if (alert?.is_confirmed_collision || alert?.event_class === "collision") return "Collision";
  if (alert?.event_class === "super_close_call") return "Super close call";
  if (alert?.event_class === "close_approach") return "Close approach";
  return "Tracked risk";
}

function alertAccent(alert) {
  if (alert?.risk_band === "SEVERE") {
    return {
      border: "1px solid rgba(255,95,110,0.3)",
      background: "rgba(38,10,14,0.56)",
      chip: "#ff5f57",
      detail: "rgba(255,180,180,0.58)",
    };
  }
  if (alert?.risk_band === "HIGH") {
    return {
      border: "1px solid rgba(255,140,66,0.22)",
      background: "rgba(33,18,8,0.5)",
      chip: "#ff8c42",
      detail: "rgba(255,196,150,0.52)",
    };
  }
  if (alert?.risk_band === "ELEVATED") {
    return {
      border: "1px solid rgba(255,209,102,0.18)",
      background: "rgba(32,26,10,0.48)",
      chip: "#ffd166",
      detail: "rgba(235,223,178,0.5)",
    };
  }
  return {
    border: "1px solid rgba(0,229,255,0.08)",
    background: "rgba(11,15,20,0.42)",
    chip: alertColor(alert?.risk_band),
    detail: "rgba(200,214,229,0.46)",
  };
}

function LayerChip({ config, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: "100%",
        textAlign: "left",
        padding: "9px 10px",
        minHeight: 50,
        display: "grid",
        gridTemplateColumns: "30px minmax(0, 1fr) 8px",
        alignItems: "center",
        columnGap: 10,
        background: active ? "rgba(0,229,255,0.08)" : "rgba(11,15,20,0.48)",
        border: active
          ? "1px solid rgba(0,229,255,0.3)"
          : "1px solid rgba(0,229,255,0.1)",
        borderRadius: 8,
        color: active ? "rgba(0,229,255,0.9)" : "rgba(200,214,229,0.72)",
      }}
    >
      <span
        style={{
          fontSize: "0.58rem",
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
            fontSize: "0.64rem",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          {config.label}
        </div>
        <div
          style={{
            marginTop: 2,
            fontSize: "0.54rem",
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
        padding: "7px 10px",
        borderRadius: 8,
        border: active ? "1px solid rgba(0,229,255,0.28)" : "1px solid transparent",
        background: active ? "rgba(0,229,255,0.08)" : "transparent",
        color: active ? "rgba(0,229,255,0.9)" : "rgba(200,214,229,0.46)",
        fontSize: "0.58rem",
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
          fontSize: "0.56rem",
          letterSpacing: "0.17em",
          textTransform: "uppercase",
          color: "rgba(200,214,229,0.5)",
        }}
      >
        {children}
      </span>
      {right ? (
        <span
          style={{
            fontSize: "0.52rem",
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
      id: "uncertaintyZones",
      shortLabel: "UNC",
      label: "Uncertainty Zones",
      desc: "Density shells for fragment-rich orbital bands",
    },
    {
      id: "futurePaths",
      shortLabel: "FUT",
      label: "Future Paths",
      desc: "Predicted orbital trajectory ahead of current position",
    },
  ];

  return (
    <div style={{ display: "grid", gap: 12 }}>
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

function AlertsView({ alerts, activeAlertKey, previewAlertKey, onSelectAlert }) {
  const tierCounts = alerts.reduce(
    (counts, alert) => {
      const band = alert?.risk_band || "LOW";
      counts[band] = (counts[band] || 0) + 1;
      return counts;
    },
    { SEVERE: 0, HIGH: 0, ELEVATED: 0, LOW: 0 }
  );

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
          gap: 6,
          marginBottom: 2,
        }}
      >
        {[
          { key: "SEVERE", color: "#ff5f57" },
          { key: "HIGH", color: "#ff8c42" },
          { key: "ELEVATED", color: "#ffd166" },
          { key: "LOW", color: "#00d1ff" },
        ].map((tier) => (
          <div
            key={tier.key}
            style={{
              borderRadius: 8,
              border: "1px solid rgba(0,229,255,0.08)",
              background: "rgba(11,15,20,0.38)",
              padding: "8px 6px",
              textAlign: "center",
            }}
          >
            <div
              style={{
                fontSize: "0.48rem",
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: tier.color,
              }}
            >
              {tier.key}
            </div>
            <div
              style={{
                marginTop: 4,
                fontSize: "0.66rem",
                color: "rgba(255,255,255,0.86)",
              }}
            >
              {tierCounts[tier.key] || 0}
            </div>
          </div>
        ))}
      </div>

      {alerts.length > 0 ? (
        alerts.map((alert) => (
          (() => {
            const alertKey = `${alert.target_norad_id}-${alert.candidate_norad_id}`;
            const isPairActive = activeAlertKey === alertKey;
            const isPreviewActive = previewAlertKey === alertKey && !isPairActive;
            const accent = alertAccent(alert);
            return (
              <button
                key={alertKey}
                type="button"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  onSelectAlert?.(alert, { activate: false });
                }}
                style={{
                  width: "100%",
                  textAlign: "left",
                  padding: "10px 11px",
                  borderRadius: 8,
                  border: isPairActive || isPreviewActive
                    ? "1px solid rgba(0,229,255,0.28)"
                    : accent.border,
                  background: isPairActive || isPreviewActive
                    ? "rgba(0,229,255,0.08)"
                    : accent.background,
                  color: "rgba(255,255,255,0.84)",
                  boxShadow: isPairActive || isPreviewActive
                    ? "0 0 0 1px rgba(0,229,255,0.1) inset"
                    : "none",
                  cursor: "pointer",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                  <span
                    style={{
                      fontSize: "0.54rem",
                      letterSpacing: "0.14em",
                      color: accent.chip,
                      textTransform: "uppercase",
                    }}
                  >
                    {alert.risk_band || "LOW"}
                  </span>
                  <span style={{ fontSize: "0.54rem", color: "rgba(200,214,229,0.46)" }}>
                    {alert.risk_score}%
                  </span>
                </div>
                <div style={{ marginTop: 6, fontSize: "0.68rem", lineHeight: 1.45 }}>
                  {alert.target_name}
                </div>
                <div style={{ marginTop: 3, fontSize: "0.56rem", color: accent.detail }}>
                  vs {alert.candidate_name}
                </div>
                <div
                  style={{
                    marginTop: 7,
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                    fontSize: "0.52rem",
                    color: "rgba(200,214,229,0.36)",
                    textTransform: "uppercase",
                  }}
                >
                  <span>{alertEventLabel(alert)}</span>
                  <span>{alert.min_separation_km} km</span>
                  <span>{formatTPlusMinutes(alert.sampled_tca_minutes, true)}</span>
                </div>
                {isPairActive ? (
                  <div
                    style={{
                      marginTop: 7,
                      fontSize: "0.5rem",
                      letterSpacing: "0.12em",
                      textTransform: "uppercase",
                      color: "rgba(0,229,255,0.62)",
                    }}
                  >
                    Threat pair active
                  </div>
                ) : null}
                {isPreviewActive ? (
                  <div
                    style={{
                      marginTop: 7,
                      fontSize: "0.5rem",
                      letterSpacing: "0.12em",
                      textTransform: "uppercase",
                      color: "rgba(0,229,255,0.62)",
                    }}
                  >
                    Target selected | click again for threat pair
                  </div>
                ) : null}
              </button>
            );
          })()
        ))
      ) : (
        <div style={{ fontSize: "0.62rem", color: "rgba(200,214,229,0.38)", lineHeight: 1.6 }}>
          No conjunction alerts survived the current screening window.
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
  previewAlertKey,
  onSelectAlert,
}) {
  const [activeTab, setActiveTab] = useState("filters");
  const tabMeta = useMemo(
    () => ({
      filters: { label: "Filters" },
      alerts: { label: `Alerts ${alerts.length ? `(${alerts.length})` : ""}`.trim() },
    }),
    [alerts.length]
  );

  useEffect(() => {
    if (alerts.length > 0 && activeTab === "filters") {
      setActiveTab("alerts");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alerts.length]);

  return (
    <div
      className="slide-in-left"
      style={{
        position: "fixed",
        top: 184,
        bottom: 148,
        left: 20,
        zIndex: 28,
        width: 300,
      }}
    >
      <div
        className="glass"
        style={{
          padding: "11px",
          border: "1px solid rgba(0,229,255,0.12)",
          background: "linear-gradient(180deg, rgba(11,15,20,0.86), rgba(8,12,18,0.92))",
          height: "100%",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ marginBottom: 10 }}>
          <div
            style={{
              fontSize: "0.56rem",
              letterSpacing: "0.2em",
              color: "rgba(0,229,255,0.64)",
              textTransform: "uppercase",
            }}
          >
            Orbital Watch
          </div>
          <div
            style={{
              marginTop: 4,
              fontSize: "0.58rem",
              lineHeight: 1.45,
              color: "rgba(200,214,229,0.5)",
              letterSpacing: "0.04em",
            }}
          >
            Filter tracked objects and monitor conjunction alerts.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            gap: 6,
            padding: 4,
            borderRadius: 9,
            background: "rgba(11,15,20,0.5)",
            border: "1px solid rgba(0,229,255,0.08)",
            marginBottom: 10,
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

        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", paddingRight: 2 }}>
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
            <AlertsView
              alerts={alerts}
              activeAlertKey={activeAlertKey}
              previewAlertKey={previewAlertKey}
              onSelectAlert={onSelectAlert}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
