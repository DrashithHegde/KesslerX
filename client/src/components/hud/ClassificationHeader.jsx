import { useEffect, useRef, useState } from "react";

export default function ClassificationHeader({ onBoundsChange }) {
  const headerRef = useRef(null);
  const summaryRef = useRef(null);
  const summaryLine = "SUMMARY ORBITAL INTEL STREAM // ACTIVE";
  const [summaryWidth, setSummaryWidth] = useState(null);

  useEffect(() => {
    if (!onBoundsChange || !headerRef.current) return undefined;

    const updateBounds = () => {
      if (!headerRef.current) return;
      const rect = headerRef.current.getBoundingClientRect();
      const nextSummaryWidth = summaryRef.current
        ? Math.ceil(summaryRef.current.scrollWidth) + 4
        : null;

      setSummaryWidth((currentWidth) =>
        currentWidth === nextSummaryWidth ? currentWidth : nextSummaryWidth
      );

      onBoundsChange({
        top: rect.top,
        bottom: rect.bottom,
        height: rect.height,
      });
    };

    updateBounds();

    let resizeObserver;
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(updateBounds);
      resizeObserver.observe(headerRef.current);
    }

    window.addEventListener("resize", updateBounds);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", updateBounds);
    };
  }, [onBoundsChange]);

  return (
    <div
      ref={headerRef}
      style={{
        position: "fixed",
        top: 56,
        left: 22,
        zIndex: 40,
        fontFamily: "'DM Mono', monospace",
        fontSize: "0.5rem",
        letterSpacing: "0.12em",
        color: "rgba(200,214,229,0.56)",
        pointerEvents: "none",
        lineHeight: 1.5,
        padding: "6px 10px",
        borderRadius: 999,
        border: "1px solid rgba(0,229,255,0.08)",
        background: "rgba(11,15,20,0.5)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ color: "rgba(0,229,255,0.7)", textTransform: "uppercase" }}>
          Sentinel-02
        </span>
        <span style={{ color: "rgba(200,214,229,0.28)" }}>|</span>
        <div
          ref={summaryRef}
          className="typewriter-text"
          style={{
            "--typewriter-width": summaryWidth ? `${summaryWidth}px` : undefined,
            fontSize: "0.44rem",
            opacity: 0.7,
            height: "1.2em",
            fontFamily: "'DM Mono', monospace",
          }}
        >
          {summaryLine}
        </div>
      </div>
    </div>
  );
}
