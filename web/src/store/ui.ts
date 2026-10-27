import { create } from "zustand";

export type Mode = "playground" | "signal" | "list";

/**
 * Signal Path and Equipment List are hidden for the Playground launch. Off hides the mode rail and keeps the app on
 * the Playground; their code and the data they edit stay in place, so turning this back on brings them back.
 */
export const SHOW_MODES = false;
export type Tool = "hand" | "select";
export type Units = "in" | "mm";
export type Theme = "system" | "light" | "dark";
/** Why the upgrade dialog opened; changes its headline. */
export type UpgradeReason = "menu" | "limit" | "save" | "avatar";

interface UiState {
  mode: Mode;
  tool: Tool;
  units: Units;
  theme: Theme;
  /** Dragged items snap to other items' edges and centers. */
  snapping: boolean;
  setSnapping: (on: boolean) => void;
  upgrade: UpgradeReason | null;
  /** The pedal search panel; the canvas closes it as soon as the user starts arranging. */
  /** Image key of the pedal used as the user's avatar. */
  avatar: string;
  setAvatar: (key: string) => void;
  searchOpen: boolean;
  setSearchOpen: (open: boolean) => void;
  /** The panel is picking a replacement for the selected product instead of adding a new one. */
  replacing: boolean;
  setReplacing: (replacing: boolean) => void;
  /** The panel is editing the selected custom pedal or pedalboard. */
  editing: boolean;
  setEditing: (editing: boolean) => void;
  setMode: (m: Mode) => void;
  setTool: (t: Tool) => void;
  setUnits: (u: Units) => void;
  setTheme: (t: Theme) => void;
  openUpgrade: (reason: UpgradeReason) => void;
  closeUpgrade: () => void;
  /** The first-visit tour of the editor. Opens on its own once; Settings can replay it. */
  tourOpen: boolean;
  startTour: () => void;
  endTour: () => void;
}

const savedUnits = (): Units => {
  try {
    return localStorage.getItem("pp:units") === "mm" ? "mm" : "in";
  } catch {
    return "in";
  }
};

const savedSnapping = (): boolean => {
  try {
    return localStorage.getItem("pp:snap") !== "off";
  } catch {
    return true;
  }
};

const TOUR_KEY = "pp:tour";

/** True once the tour has been finished or skipped on this device. */
export const tourSeen = (): boolean => {
  try {
    return localStorage.getItem(TOUR_KEY) === "done";
  } catch {
    return true; // without storage we couldn't remember a skip, so don't show it on every visit
  }
};

export const DEFAULT_AVATAR = "boss-ds1";

const savedAvatar = (): string => {
  try {
    return localStorage.getItem("pp:avatar") || DEFAULT_AVATAR;
  } catch {
    return DEFAULT_AVATAR;
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
  snapping: savedSnapping(),
  setSnapping: (snapping) => {
    try {
      localStorage.setItem("pp:snap", snapping ? "on" : "off");
    } catch {
      /* storage unavailable */
    }
    set({ snapping });
  },
  upgrade: null,
  avatar: savedAvatar(),
  setAvatar: (avatar) => {
    try {
      localStorage.setItem("pp:avatar", avatar);
    } catch {
      /* storage unavailable */
    }
    set({ avatar });
  },
  searchOpen: false,
  setSearchOpen: (searchOpen) => set({ searchOpen, replacing: false, editing: false }),
  replacing: false,
  setReplacing: (replacing) => set({ replacing, editing: false, searchOpen: replacing }),
  editing: false,
  setEditing: (editing) => set({ editing, replacing: false, searchOpen: editing }),
  setMode: (mode) => set({ mode: SHOW_MODES ? mode : "playground" }),
  setTool: (tool) => set({ tool }),
  setUnits: (units) => {
    try {
      localStorage.setItem("pp:units", units);
    } catch {
      /* storage unavailable */
    }
    set({ units });
  },
  openUpgrade: (upgrade) => set({ upgrade }),
  closeUpgrade: () => set({ upgrade: null }),
  tourOpen: false,
  startTour: () => set({ tourOpen: true, searchOpen: false, replacing: false, editing: false }),
  endTour: () => {
    try {
      localStorage.setItem(TOUR_KEY, "done");
    } catch {
      /* storage unavailable */
    }
    set({ tourOpen: false });
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
