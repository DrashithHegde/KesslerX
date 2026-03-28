import { useEffect, useState } from "react";

export default function CursorReticle({ ping, duration = 280 }) {
    const [position, setPosition] = useState({ x: -100, y: -100 });
    const [visible, setVisible] = useState(false);
    const [isEnabled, setIsEnabled] = useState(true);
    const [pulseKey, setPulseKey] = useState(0);

    useEffect(() => {
        if (typeof window === "undefined" || !window.matchMedia) return;

        const query = window.matchMedia("(pointer: coarse)");
        const handleChange = (event) => setIsEnabled(!event.matches);

        setIsEnabled(!query.matches);
        if (query.addEventListener) {
            query.addEventListener("change", handleChange);
        } else if (query.addListener) {
            query.addListener(handleChange);
        }

        return () => {
            if (query.removeEventListener) {
                query.removeEventListener("change", handleChange);
            } else if (query.removeListener) {
                query.removeListener(handleChange);
            }
        };
    }, []);

    useEffect(() => {
        if (!isEnabled || !ping) return;

        setPosition({ x: ping.x, y: ping.y });
        setPulseKey(ping.id ?? Date.now());
        setVisible(true);

        const timeout = setTimeout(() => setVisible(false), duration);
        return () => clearTimeout(timeout);
    }, [ping, isEnabled, duration]);

    if (!isEnabled || !ping) return null;

    return (
        <div
            className={`cursor-reticle${visible ? " cursor-reticle--active" : ""}`}
            style={{ left: `${position.x}px`, top: `${position.y}px` }}
        >
            {visible &&
                ["primary", "secondary"].map((label, index) => (
                    <div
                        key={`${pulseKey}-${label}`}
                        className={`cursor-reticle__ring${index === 1 ? " cursor-reticle__ring--delay" : ""}`}
                    />
                ))}
        </div>
    );
}
