import type { CSSProperties } from "react";

/** How a custom pedalboard looks. Boards saved before these options have none and draw with the defaults. */
export interface BoardStyle {
  /** A frame around the deck (aluminum channel or tolex-covered sides). */
  border: boolean;
  /** Frame thickness in inches. */
  borderWidth: number;
  top: BoardTop;
  finish: BorderFinish;
}

export type BoardTop = "abs" | "velcro" | "wood";
export type BorderFinish = "aluminum" | "black-metal" | "tolex-black" | "tolex-brown" | "tolex-cream" | "tolex-red";

/** The original custom board: half-inch aluminum around a dark deck. */
export const DEFAULT_BOARD: BoardStyle = { border: true, borderWidth: 0.5, top: "abs", finish: "aluminum" };

export const boardStyle = (b: Partial<BoardStyle> | undefined): BoardStyle => ({ ...DEFAULT_BOARD, ...b });

/** Border thickness slider stops, in inches and in millimeters. */
export const BORDER_STEPS_IN = [0.25, 0.375, 0.5, 0.625, 0.75, 1, 1.25, 1.5];
export const BORDER_STEPS_MM = [5, 8, 10, 12, 15, 20, 25, 30, 40];

export const BOARD_TOPS: { id: BoardTop; name: string }[] = [
  { id: "abs", name: "Black ABS" },
  { id: "velcro", name: "Velcro" },
  { id: "wood", name: "Wood Grain" },
];

export const BORDER_FINISHES: { id: BorderFinish; name: string; base: string }[] = [
  { id: "aluminum", name: "Aluminum", base: "#d6d8dc" },
  { id: "black-metal", name: "Black Metal", base: "#34363b" },
  { id: "tolex-black", name: "Black Tolex", base: "#1c1c1e" },
  { id: "tolex-brown", name: "Brown Tolex", base: "#5a3a26" },
  { id: "tolex-cream", name: "Cream Tolex", base: "#e8dcc2" },
  { id: "tolex-red", name: "Red Tolex", base: "#8e2a2a" },
];

/** CSS background for the deck. Patterns are in canvas px, so they scale with zoom like the board does. */
export function topBackground(top: BoardTop): CSSProperties {
  switch (top) {
    case "velcro":
      // Fine loop fabric: a tight dot weave over dark gray.
      return {
        backgroundColor: "#2b2c30",
        backgroundImage:
          "radial-gradient(rgb(255 255 255 / 0.09) 0.7px, transparent 0.9px), radial-gradient(rgb(0 0 0 / 0.35) 0.7px, transparent 0.9px)",
        backgroundSize: "3px 3px, 3px 3px",
        backgroundPosition: "0 0, 1.5px 1.5px",
      };
    case "wood":
      // Warm planks with running grain.
      return {
        backgroundColor: "#8a5a35",
        backgroundImage:
          "repeating-linear-gradient(90deg, rgb(0 0 0 / 0.18) 0 1px, transparent 1px 7px, rgb(255 255 255 / 0.05) 7px 9px, transparent 9px 15px), repeating-linear-gradient(0deg, transparent 0 46px, rgb(0 0 0 / 0.28) 46px 48px), linear-gradient(90deg, #9b663d, #7c4f2d 40%, #95623a 70%, #83552f)",
      };
    default:
      // Black ABS: matte, with a faint sheen.
      return { backgroundColor: "#1f2023", backgroundImage: "linear-gradient(160deg, rgb(255 255 255 / 0.05), transparent 45%)" };
  }
}

/** CSS background for the frame: brushed metal, or tolex's pebbled vinyl. */
export function finishBackground(finish: BorderFinish): CSSProperties {
  const f = BORDER_FINISHES.find((x) => x.id === finish) ?? BORDER_FINISHES[0];
  if (finish === "aluminum" || finish === "black-metal") {
    return {
      backgroundColor: f.base,
      backgroundImage: "repeating-linear-gradient(90deg, rgb(255 255 255 / 0.08) 0 1px, transparent 1px 3px), linear-gradient(180deg, rgb(255 255 255 / 0.18), rgb(0 0 0 / 0.12))",
    };
  }
  return {
    backgroundColor: f.base,
    backgroundImage: "radial-gradient(rgb(0 0 0 / 0.28) 0.8px, transparent 1px), radial-gradient(rgb(255 255 255 / 0.1) 0.6px, transparent 0.8px)",
    backgroundSize: "3px 3px, 4px 4px",
    backgroundPosition: "0 0, 2px 1px",
  };
}

/** Flat colors for the small canvas-drawn thumbnails. */
export const TOP_FLAT: Record<BoardTop, string> = { abs: "#1f2023", velcro: "#2b2c30", wood: "#8a5a35" };
export const finishFlat = (finish: BorderFinish) => (BORDER_FINISHES.find((x) => x.id === finish) ?? BORDER_FINISHES[0]).base;
