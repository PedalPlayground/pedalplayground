import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../index.css";
import { startAnalytics } from "../lib/analytics";
import { BoardsApp } from "./BoardsApp";

startAnalytics();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BoardsApp />
  </StrictMode>,
);
