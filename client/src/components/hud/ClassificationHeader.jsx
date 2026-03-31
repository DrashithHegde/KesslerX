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
        top: 100,
        left: 12,
        zIndex: 40,
        fontFamily: "'DM Mono', monospace",
        fontSize: "0.65rem",
        letterSpacing: "0.15em",
        color: "#d97f2a",
        textShadow: "0 0 8px rgba(217, 127, 42, 0.5)",
        pointerEvents: "none",
        lineHeight: 1.6,
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 6 }}>
        TOP SECRET // KESSLERX // NOFORN
      </div>
      <div style={{ fontSize: "0.55rem", opacity: 0.85 }}>
        SENTINEL-02 ORBITAL WATCH
      </div>
      <div style={{ fontSize: "0.55rem", opacity: 0.85, marginTop: 3 }}>
        LEO SCREENING GRID
      </div>

      <div
        ref={summaryRef}
        className="typewriter-text"
        style={{
          "--typewriter-width": summaryWidth ? `${summaryWidth}px` : undefined,
          marginTop: 4,
          fontSize: "0.45rem",
          opacity: 0.7,
          height: "1.2em",
          fontFamily: "'DM Mono', monospace",
        }}
      >
        {summaryLine}
      </div>
    </div>
  );
}
