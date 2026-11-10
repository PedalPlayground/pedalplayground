import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../index.css";
import { startAnalytics } from "../lib/analytics";
import { GalleryApp } from "./GalleryApp";

startAnalytics();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <GalleryApp />
  </StrictMode>,
);
