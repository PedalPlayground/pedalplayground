import { create } from "zustand";
import { track } from "../lib/analytics";

export type Mode = "playground" | "signal" | "list";

/**
 * Signal Path and Equipment List are hidden for the Playground launch. Off hides the mode rail and keeps the app on
 * the Playground; their code and the data they edit stay in place, so turning this back on brings them back.
 */
export const SHOW_MODES = false;
export type Tool = "hand" | "select";
export type Units = "in" | "mm";
export type Theme = "system" | "light" | "dark";
/** Which dark look to use when dark mode is on: the regular dark grays, or true black for OLED screens. */
export type DarkStyle = "dark" | "oled";
/** Why the upgrade dialog opened; changes its headline. */
export type UpgradeReason = "menu" | "limit" | "save" | "avatar" | "copy";

/** A shared playground open from a link: shown view-only until the viewer makes a copy. */
export interface SharedView {
  id: string;
  slug: string;
  name: string;
  ownerId: string;
  /** The owner's username, when they have one. */
  ownerName: string | null;
}

interface UiState {
  mode: Mode;
  /** Set while a shared playground is open view-only. Edits, saving and autosave are off until it's copied or left. */
  viewing: SharedView | null;
  /** A drag of gear is under way, so floating helpers (the little menu under the selection) stay out of the way. */
  dragging: boolean;
  setViewing: (v: SharedView | null) => void;
  tool: Tool;
  units: Units;
  theme: Theme;
  darkStyle: DarkStyle;
  setDarkStyle: (d: DarkStyle) => void;
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
  /** The Terms, Disclaimer and Privacy window. */
  legalOpen: boolean;
  openLegal: () => void;
  closeLegal: () => void;
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

const savedDarkStyle = (): DarkStyle => {
  try {
    return localStorage.getItem("pp:dark") === "oled" ? "oled" : "dark";
  } catch {
    return "dark";
  }
};

/** Applies the dark style to <html> (index.html also does this before first paint). */
export function applyDarkStyle(d: DarkStyle) {
  const root = document.documentElement;
  if (d === "oled") root.setAttribute("data-dark", "oled");
  else root.removeAttribute("data-dark");
}

/** Applies the theme to <html>; "system" removes the override so the OS preference wins. */
export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
}

export const useUi = create<UiState>((set) => ({
  mode: "playground",
  viewing: null,
  dragging: false,
  setViewing: (viewing) => set({ viewing, searchOpen: false, replacing: false, editing: false }),
  tool: "select",
  units: savedUnits(),
  theme: savedTheme(),
  darkStyle: savedDarkStyle(),
  setDarkStyle: (darkStyle) => {
    try {
      localStorage.setItem("pp:dark", darkStyle);
    } catch {
      /* storage unavailable */
    }
    applyDarkStyle(darkStyle);
    set({ darkStyle });
  },
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
  legalOpen: false,
  openLegal: () => set({ legalOpen: true }),
  closeLegal: () => set({ legalOpen: false }),
  openUpgrade: (upgrade) => {
    track("upgrade_opened", { reason: upgrade });
    set({ upgrade });
  },
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
