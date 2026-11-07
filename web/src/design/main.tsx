import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../index.css";
import { DesignApp } from "./DesignApp";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <DesignApp />
  </StrictMode>,
);
