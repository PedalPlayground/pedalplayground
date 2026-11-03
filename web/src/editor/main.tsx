import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../index.css";
import { EditorApp } from "./EditorApp";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <EditorApp />
  </StrictMode>,
);
