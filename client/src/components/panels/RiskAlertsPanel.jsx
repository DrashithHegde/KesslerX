function alertColor(riskBand) {
  if (riskBand === "SEVERE") return "#ff5f57";
  if (riskBand === "HIGH") return "#ff8c42";
  if (riskBand === "ELEVATED") return "#ffd166";
  return "#00d1ff";
}

export default function RiskAlertsPanel({ alerts = [], simulatedAt, onSelectAlert }) {
  return (
    <div
      className="slide-in-left"
      style={{
        position: "fixed",
        left: 20,
        bottom: 148,
        zIndex: 28,
        width: 318,
      }}
    >
      <div
        className="glass"
        style={{
          padding: "11px 12px",
          border: "1px solid rgba(0,229,255,0.13)",
          background:
            "linear-gradient(180deg, rgba(11,15,20,0.84), rgba(8,12,18,0.92))",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            marginBottom: 10,
          }}
        >
          <span
            style={{
              fontSize: "0.56rem",
              letterSpacing: "0.22em",
              color: "rgba(200,214,229,0.42)",
              textTransform: "uppercase",
            }}
          >
            Risk Alerts
          </span>
          <span
            style={{
              fontSize: "0.44rem",
              letterSpacing: "0.14em",
              color: "rgba(0,229,255,0.55)",
              textTransform: "uppercase",
            }}
          >
            {simulatedAt ? "Sim-linked" : "Standby"}
          </span>
        </div>

        <div style={{ display: "grid", gap: 8, maxHeight: 232, overflowY: "auto" }}>
          {alerts.length > 0 ? (
            alerts.map((alert) => (
              <button
                key={`${alert.target_norad_id}-${alert.candidate_norad_id}`}
                type="button"
                onClick={() => onSelectAlert?.(alert.target_norad_id)}
                style={{
                  width: "100%",
                  textAlign: "left",
                  padding: "10px 11px",
                  borderRadius: 8,
                  border: "1px solid rgba(0,229,255,0.1)",
                  background: "rgba(11,15,20,0.56)",
                  color: "rgba(255,255,255,0.84)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 10,
                  }}
                >
                  <span
                    style={{
                      fontSize: "0.48rem",
                      letterSpacing: "0.16em",
                      color: alertColor(alert.risk_band),
                      textTransform: "uppercase",
                    }}
                  >
                    {alert.risk_band}
                  </span>
                  <span
                    style={{
                      fontSize: "0.5rem",
                      letterSpacing: "0.1em",
                      color: "rgba(200,214,229,0.52)",
                    }}
                  >
                    Risk {alert.risk_score}%
                  </span>
                </div>

                <div
                  style={{
                    marginTop: 7,
                    fontSize: "0.62rem",
                    lineHeight: 1.5,
                    letterSpacing: "0.04em",
                  }}
                >
                  {alert.target_name}
                </div>

                <div
                  style={{
                    marginTop: 4,
                    fontSize: "0.5rem",
                    lineHeight: 1.45,
                    color: "rgba(200,214,229,0.46)",
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                  }}
                >
                  vs {alert.candidate_name}
                </div>

                <div
                  style={{
                    marginTop: 8,
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                    fontSize: "0.48rem",
                    color: "rgba(200,214,229,0.36)",
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                  }}
                >
                  <span>Min sep {alert.min_separation_km} km</span>
                  <span>T+{alert.sampled_tca_minutes}m</span>
                </div>
              </button>
            ))
          ) : (
            <div
              style={{
                padding: "12px 4px 4px",
                fontSize: "0.56rem",
                lineHeight: 1.6,
                color: "rgba(200,214,229,0.38)",
                letterSpacing: "0.04em",
              }}
            >
              No elevated conjunction alerts are active in the current screening window.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
