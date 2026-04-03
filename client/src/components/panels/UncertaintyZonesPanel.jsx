function zoneColor(score) {
  if (score >= 80) return "#ff5f57";
  if (score >= 60) return "#ff8c42";
  if (score >= 40) return "#ffd166";
  return "#00d1ff";
}

function zoneLabel(score) {
  if (score >= 80) return "Severe";
  if (score >= 60) return "High";
  if (score >= 40) return "Elevated";
  return "Low";
}

function ZoneRow({ zone }) {
  const color = zoneColor(zone.uncertainty_score);

  return (
    <div
      style={{
        padding: "9px 10px",
        borderRadius: 8,
        border: "1px solid rgba(0,229,255,0.08)",
        background: "rgba(11,15,20,0.48)",
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
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            minWidth: 0,
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: color,
              boxShadow: `0 0 10px ${color}`,
              flexShrink: 0,
            }}
          />
          <span
            style={{
              fontSize: "0.58rem",
              color: "rgba(255,255,255,0.86)",
              letterSpacing: "0.04em",
            }}
          >
            {zone.regime} shell
          </span>
        </div>
        <span
          style={{
            fontSize: "0.48rem",
            color,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            whiteSpace: "nowrap",
          }}
        >
          {zoneLabel(zone.uncertainty_score)}
        </span>
      </div>

      <div
        style={{
          marginTop: 6,
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          fontSize: "0.48rem",
          color: "rgba(200,214,229,0.42)",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
        }}
      >
        <span>{zone.shell_start_km}-{zone.shell_end_km} km</span>
        <span>{zone.total_objects} tracked</span>
      </div>

      <div
        style={{
          marginTop: 5,
          fontSize: "0.5rem",
          lineHeight: 1.5,
          color: "rgba(200,214,229,0.56)",
          letterSpacing: "0.03em",
        }}
      >
        {zone.debris_ratio}% debris share, {zone.density_band.toLowerCase()} traffic density.
      </div>
    </div>
  );
}

export default function UncertaintyZonesPanel({ zones = [], simulatedAt }) {
  return (
    <div
      className="slide-in-left"
      style={{
        position: "fixed",
        left: 20,
        bottom: 396,
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
            Uncertainty Zones
          </span>
          <span
            style={{
              fontSize: "0.44rem",
              letterSpacing: "0.14em",
              color: "rgba(0,229,255,0.55)",
              textTransform: "uppercase",
            }}
          >
            {simulatedAt ? "Explained" : "Standby"}
          </span>
        </div>

        <div
          style={{
            padding: "10px 11px",
            borderRadius: 8,
            background: "rgba(11,15,20,0.42)",
            border: "1px solid rgba(0,229,255,0.08)",
            fontSize: "0.55rem",
            lineHeight: 1.65,
            color: "rgba(200,214,229,0.62)",
            letterSpacing: "0.03em",
          }}
        >
          These rings show altitude bands where the local orbital environment is more crowded and debris-heavy.
          Brighter bands mean higher uncertainty, not a confirmed collision.
        </div>

        <div
          style={{
            marginTop: 10,
            display: "grid",
            gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
            gap: 6,
          }}
        >
          {[22, 48, 67, 88].map((score) => (
            <div
              key={score}
              style={{
                padding: "7px 6px",
                borderRadius: 8,
                textAlign: "center",
                border: "1px solid rgba(0,229,255,0.08)",
                background: "rgba(11,15,20,0.44)",
              }}
            >
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: zoneColor(score),
                  boxShadow: `0 0 8px ${zoneColor(score)}`,
                  margin: "0 auto 5px",
                }}
              />
              <div
                style={{
                  fontSize: "0.44rem",
                  color: "rgba(200,214,229,0.56)",
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                }}
              >
                {zoneLabel(score)}
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: "grid", gap: 8, marginTop: 10, maxHeight: 186, overflowY: "auto" }}>
          {zones.length > 0 ? (
            zones.slice(0, 3).map((zone) => (
              <ZoneRow
                key={`${zone.shell_start_km}-${zone.shell_end_km}`}
                zone={zone}
              />
            ))
          ) : (
            <div
              style={{
                padding: "10px 4px 4px",
                fontSize: "0.54rem",
                lineHeight: 1.6,
                color: "rgba(200,214,229,0.38)",
              }}
            >
              No uncertainty bands are available yet for the current catalog snapshot.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
