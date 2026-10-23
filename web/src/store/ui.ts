import { create } from "zustand";

export type Mode = "playground" | "signal" | "list";
export type Tool = "hand" | "select";
export type Units = "in" | "mm";
export type Theme = "system" | "light" | "dark";

interface UiState {
  mode: Mode;
  tool: Tool;
  units: Units;
  theme: Theme;
  setMode: (m: Mode) => void;
  setTool: (t: Tool) => void;
  setUnits: (u: Units) => void;
  setTheme: (t: Theme) => void;
}

const savedUnits = (): Units => {
  try {
    return localStorage.getItem("pp:units") === "mm" ? "mm" : "in";
  } catch {
    return "in";
  }
};

const savedTheme = (): Theme => {
  try {
    const t = localStorage.getItem("pp:theme");
    return t === "light" || t === "dark" ? t : "system";
  } catch {
    return "system";
  }
};

/** Applies the theme to <html>; "system" removes the override so the OS preference wins. */
export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
}

export const useUi = create<UiState>((set) => ({
  mode: "playground",
  tool: "select",
  units: savedUnits(),
  theme: savedTheme(),
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
  setTheme: (theme) => {
    try {
      localStorage.setItem("pp:theme", theme);
    } catch {
      /* storage unavailable */
    }
    applyTheme(theme);
    set({ theme });
  },
}));
