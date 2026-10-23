import { create } from "zustand";

export type Mode = "playground" | "signal" | "list";
export type Tool = "hand" | "select";
export type Units = "in" | "mm";

interface UiState {
  mode: Mode;
  tool: Tool;
  units: Units;
  setMode: (m: Mode) => void;
  setTool: (t: Tool) => void;
  setUnits: (u: Units) => void;
}

const savedUnits = (): Units => {
  try {
    return localStorage.getItem("pp:units") === "mm" ? "mm" : "in";
  } catch {
    return "in";
  }
};

export const useUi = create<UiState>((set) => ({
  mode: "playground",
  tool: "select",
  units: savedUnits(),
  setMode: (mode) => set({ mode }),
  setTool: (tool) => set({ tool }),
  setUnits: (units) => {
    try {
      localStorage.setItem("pp:units", units);
    } catch {
      /* storage unavailable */
    }
    set({ units });
  },
}));
