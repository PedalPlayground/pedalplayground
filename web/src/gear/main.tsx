import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../index.css";
import { startAnalytics } from "../lib/analytics";
import { GearApp } from "./GearApp";

startAnalytics();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <GearApp />
  </StrictMode>,
);
