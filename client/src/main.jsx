import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

const root = document.getElementById("root");
const pathname = window.location.pathname;
const isLandingAlias = pathname === "/landing" || pathname.startsWith("/landing/");
const isAppRoute = pathname === "/app" || pathname.startsWith("/app/");

document.documentElement.classList.toggle("kx-app-route", isAppRoute);
document.documentElement.classList.toggle("kx-landing-route", !isAppRoute);
document.body.classList.toggle("kx-app-route", isAppRoute);
document.body.classList.toggle("kx-landing-route", !isAppRoute);

if (isLandingAlias) {
  window.location.replace("/");
}

async function bootstrap() {
  if (!root || isLandingAlias) return;

  const Component = isAppRoute
    ? (await import("./App")).default
    : (await import("./landing")).LandingPage;

  createRoot(root).render(
    <StrictMode>
      <Component />
    </StrictMode>
  );
}

bootstrap();
