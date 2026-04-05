import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { LandingPage } from "./landing";

const root = document.getElementById("root");
const pathname = window.location.pathname;
const isLandingAlias = pathname === "/landing" || pathname.startsWith("/landing/");
const isAppRoute = pathname === "/app" || pathname.startsWith("/app/");

if (isLandingAlias) {
  window.location.replace("/");
}

if (root && !isLandingAlias) {
  createRoot(root).render(
    <StrictMode>
      {isAppRoute ? <App /> : <LandingPage />}
    </StrictMode>
  );
}
