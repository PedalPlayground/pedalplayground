import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../index.css";
import { GearApp } from "./GearApp";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <GearApp />
  </StrictMode>,
);
