import { useEffect } from "react";
import "./landing.css";

const stats = [
    { value: 36500, suffix: "+", format: "comma", label: "Tracked objects" },
    { value: 130, suffix: "M+", format: "plain", label: "Untracked fragments" },
    { value: 12000, suffix: "+", format: "comma", label: "Close approaches / day" },
];

const solutionCards = [
    {
        title: "Object Tracking",
        body: "Tracks satellites, rocket bodies, debris, and unclassified objects across all orbital regimes in real time.",
    },
    {
        title: "Collision Screening",
        body: "Continuous conjunction detection with miss-distance, probability, and time-to-closest-approach analysis.",
    },
    {
        title: "Uncertainty Modeling",
        body: "Quantifies covariance and propagation uncertainty in orbital state vectors for accurate risk assessment.",
    },
    {
        title: "Simulation Engine",
        body: "Forward-propagates scenarios to model debris evolution, cascade risk, and orbital sustainability.",
    },
];

const featureCards = [
    {
        tone: "cyan",
        title: "Collision Risk Detection",
        body: "Real-time conjunction screening across all tracked objects with probabilistic risk scoring.",
        icon: (
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 3l7 3v5c0 4.5-3 8.2-7 10-4-1.8-7-5.5-7-10V6l7-3z" />
            </svg>
        ),
    },
    {
        tone: "amber",
        title: "Uncertainty Modeling",
        body: "Covariance-based propagation to quantify positional uncertainty in degraded tracking environments.",
        icon: (
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M3 12h4l2-4 4 8 2-4h6" />
            </svg>
        ),
    },
    {
        tone: "cyan",
        title: "Simulation Engine",
        body: "Monte Carlo orbital simulation to model debris evolution and cascade scenarios over time.",
        icon: (
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <rect x="6" y="6" width="12" height="12" rx="2" />
                <path d="M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3" />
            </svg>
        ),
    },
    {
        tone: "amber",
        title: "AI Deep Analysis",
        body: "RAG-powered intelligence layer for contextual insights, anomaly detection, and threat assessment.",
        icon: (
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="6" cy="8" r="2" />
                <circle cx="18" cy="7" r="2" />
                <circle cx="16" cy="18" r="2" />
                <circle cx="8" cy="17" r="2" />
                <path d="M7.6 9.4l2.6 3.2" />
                <path d="M16.5 8.4l-4 2.4" />
                <path d="M9.6 16.2l4.4-2.2" />
                <path d="M12 10.8v2.4" />
            </svg>
        ),
    },
];

const impactCards = [
    {
        title: "SAFER",
        subtitle: "Satellite Operations",
        body: "Reduced collision risk through predictive screening and early warning.",
    },
    {
        title: "PREVENT",
        subtitle: "Cascade Events",
        body: "Simulation-driven foresight to prevent large-scale orbital debris generation.",
    },
    {
        title: "DECIDE",
        subtitle: "With Confidence",
        body: "Actionable intelligence for space agencies, operators, and defense organizations.",
    },
];

export default function LandingPage({ videoSrc = "/videos/earthsatellite.mp4" }) {
    const formatNumber = (value, format) => {
        if (format === "comma") {
            return value.toLocaleString("en-US");
        }
        return `${value}`;
    };

    useEffect(() => {
        const elements = Array.from(document.querySelectorAll("[data-reveal]"));
        const statValues = Array.from(document.querySelectorAll(".kx-stat-value"));
        let statsAnimated = false;

        const animateValue = (element) => {
            const target = Number(element.dataset.target || "0");
            const suffix = element.dataset.suffix || "";
            const format = element.dataset.format || "plain";
            const duration = 1800;
            let startTime = null;

            element.textContent = `0${suffix}`;

            const step = (timestamp) => {
                if (!startTime) {
                    startTime = timestamp;
                }

                const progress = Math.min((timestamp - startTime) / duration, 1);
                const value = Math.round(progress * target);
                element.textContent = `${formatNumber(value, format)}${suffix}`;

                if (progress < 1) {
                    requestAnimationFrame(step);
                }
            };

            requestAnimationFrame(step);
        };

        const startStats = () => {
            if (statsAnimated || statValues.length === 0) {
                return;
            }

            statsAnimated = true;
            statValues.forEach((element) => animateValue(element));
        };

        if (!("IntersectionObserver" in window) || elements.length === 0) {
            elements.forEach((element) => element.classList.add("is-visible"));
            startStats();
            return undefined;
        }

        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        entry.target.classList.add("is-visible");
                        if (entry.target.classList.contains("kx-stats")) {
                            startStats();
                        }
                        observer.unobserve(entry.target);
                    }
                });
            },
            { threshold: 0.2, rootMargin: "0px 0px -10% 0px" }
        );

        elements.forEach((element) => observer.observe(element));

        return () => observer.disconnect();
    }, []);

    return (
        <div className="kx-root">
            <div className="kx-scanlines" aria-hidden="true" />
            <div className="kx-glow kx-glow-right" aria-hidden="true" />
            <div className="kx-glow kx-glow-left" aria-hidden="true" />

            <header className="kx-header">
                <div className="kx-brand">
                    <span className="kx-brand-text">KESSLERX</span>
                </div>
            </header>

            <main className="kx-stage">
                <section className="kx-hero" id="hero">
                    <div className="kx-video" aria-hidden="true">
                        <video autoPlay muted loop playsInline preload="metadata">
                            <source src={videoSrc} type="video/mp4" />
                        </video>
                        <div className="kx-video-overlay" />
                        <div className="kx-vignette" />
                    </div>

                    <div className="kx-container">
                        <div className="kx-hero-content">
                            <div className="kx-subtitle" data-reveal>
                                <span className="kx-subline" />
                                <span>ORBITAL RISK INTELLIGENCE</span>
                                <span className="kx-subline" />
                            </div>

                            <h1 className="kx-hero-title" data-reveal>
                                Defend the <span>Exosphere.</span>
                            </h1>

                            <p className="kx-hero-copy" data-reveal>
                                KesslerX is an orbital risk intelligence system designed to address the growing
                                threat of space debris and satellite congestion, which is driving the risk of the
                                Kessler syndrome.
                            </p>

                            <div className="kx-hero-actions" data-reveal>
                                <a className="kx-btn kx-btn-primary" href="/app/">
                                    LAUNCH SURVEILLANCE
                                </a>
                            </div>
                        </div>
                    </div>

                </section>

                <div className="kx-scroll-stage">

                    <section className="kx-section" id="problem">
                        <div className="kx-container">
                            <div className="kx-tag kx-tag-amber kx-tag-center" data-reveal>
                                <span className="kx-tag-slash">//</span> THE PROBLEM
                            </div>

                            <h2 className="kx-heading" data-reveal>
                                Low Earth Orbit is reaching <span className="alert">critical density.</span>
                            </h2>

                            <p className="kx-body" data-reveal>
                                Over 36,000 tracked objects orbit Earth, alongside an estimated 130 million fragments
                                too small to catalog. Every launch adds to a congestion problem with no coordinated
                                solution.
                            </p>

                            <p className="kx-body kx-body-secondary" data-reveal>
                                A single collision can generate thousands of new debris fragments—each one a potential
                                trigger for cascading failures across entire orbital regimes. This is the
                                <span className="alert"> Kessler syndrome</span>: a chain reaction that could render
                                critical orbits unusable for decades.
                            </p>

                            <div className="kx-stats" data-reveal>
                                {stats.map((stat) => (
                                    <div key={stat.label} className="kx-stat">
                                        <div
                                            className="kx-stat-value"
                                            data-target={stat.value}
                                            data-format={stat.format}
                                            data-suffix={stat.suffix}
                                        >
                                            {`${formatNumber(stat.value, stat.format)}${stat.suffix}`}
                                        </div>
                                        <div className="kx-stat-label">{stat.label}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </section>

                    <section className="kx-section" id="solution">
                        <div className="kx-container">
                            <div className="kx-tag kx-tag-center" data-reveal>
                                <span className="kx-tag-slash">//</span> THE SOLUTION
                            </div>

                            <h2 className="kx-heading" data-reveal>
                                Full-spectrum orbital <span className="accent">awareness</span>.
                            </h2>

                            <p className="kx-body" data-reveal>
                                KesslerX fuses satellite tracking, debris cataloging, and uncertainty modeling into
                                a single intelligence layer. It screens conjunction risks, simulates future orbital
                                states, and surfaces actionable insights before collisions occur.
                            </p>

                            <div className="kx-grid kx-grid-2 kx-solution-grid" data-reveal>
                                {solutionCards.map((card) => (
                                    <div key={card.title} className="kx-card">
                                        <div className="kx-card-title">{card.title}</div>
                                        <p className="kx-card-text">{card.body}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </section>

                    <section className="kx-section kx-capabilities" id="features">
                        <div className="kx-container">
                            <div className="kx-capabilities-tag" data-reveal>
                                <span className="kx-tag-slash">//</span> CAPABILITIES
                            </div>

                            <h2 className="kx-capabilities-title" data-reveal>
                                Built for <span>operational clarity.</span>
                            </h2>

                            <div className="kx-capabilities-grid" data-reveal>
                                {featureCards.map((card) => (
                                    <div key={card.title} className={`kx-mission-card kx-mission-card--${card.tone}`}>
                                        <div className={`kx-mission-icon kx-mission-icon--${card.tone}`}>
                                            {card.icon}
                                        </div>
                                        <div className="kx-mission-title">{card.title}</div>
                                        <p className="kx-mission-body">{card.body}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </section>

                    <section className="kx-section kx-impact" id="impact">
                        <div className="kx-container">
                            <div className="kx-impact-tag" data-reveal>
                                <span className="kx-tag-slash">//</span> MISSION IMPACT
                            </div>

                            <h2 className="kx-impact-title" data-reveal>
                                Why this <span>matters.</span>
                            </h2>

                            <div className="kx-impact-grid" data-reveal>
                                {impactCards.map((item) => (
                                    <div key={item.title} className="kx-impact-card">
                                        <div className="kx-impact-heading">{item.title}</div>
                                        <div className="kx-impact-subtitle">{item.subtitle}</div>
                                        <p className="kx-impact-text">{item.body}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </section>

                    <section className="kx-cta" id="cta">
                        <div className="kx-cta-box" data-reveal>
                            <div className="kx-cta-tag">SATELLITE SURVEILLANCE</div>
                            <h2 className="kx-cta-title">
                                Activate <span className="amber">satellite</span> <span>surveillance.</span>
                            </h2>
                            <p className="kx-cta-copy">
                                Launch a live orbital watch layer that tracks conjunctions, debris fields, and
                                emerging risk windows in real time.
                            </p>
                            <a className="kx-btn kx-btn-primary kx-btn-cta" href="/app/">
                                LAUNCH SURVEILLANCE
                            </a>
                        </div>
                    </section>
                </div>
            </main>
        </div>
    );
}
