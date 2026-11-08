/**
 * Plugs on a pedal's edges: cable ends drawn sticking out where the pedal's jacks are. They're stored on the item, in
 * its own unrotated frame, so they move, rotate, flip, duplicate and save with it.
 */

export type PlugSide = "top" | "right" | "bottom" | "left";
export type PlugType = "straight" | "angle" | "pancake" | "dc" | "midi";

export interface Plug {
  id: string;
  side: PlugSide;
  /** Where along the side, in inches: from the left end for top and bottom, from the top for left and right. */
  at: number;
  type: PlugType;
  /** Angled and pancake plugs: the cable leaves to the other side (mirrored). */
  flip?: boolean;
}

export interface PlugSpec {
  label: string;
  /** Across the edge and out from it, in inches (the head, not the cable). */
  width: number;
  length: number;
  /** The cable leaves sideways (angled and pancake), so the plug can face either way. */
  sideways: boolean;
}

export const PLUG_TYPES: Record<PlugType, PlugSpec> = {
  straight: { label: "Straight ¼″", width: 0.45, length: 1.5, sideways: false },
  angle: { label: "Right-angle ¼″", width: 0.5, length: 0.8, sideways: true },
  pancake: { label: "Pancake", width: 0.55, length: 0.38, sideways: true },
  dc: { label: "DC Power", width: 0.3, length: 1.05, sideways: false },
  midi: { label: "MIDI", width: 0.62, length: 1.05, sideways: false },
};
export const PLUG_ORDER: PlugType[] = ["straight", "angle", "pancake", "dc", "midi"];

/** Rotation that turns a plug drawn pointing up (off the top edge) to point off `side`. */
export const SIDE_ANGLE: Record<PlugSide, number> = { top: 0, right: 90, bottom: 180, left: 270 };

/** How long a side is, in inches, for an item `w` × `h`. */
export const sideLength = (side: PlugSide, w: number, h: number) => (side === "top" || side === "bottom" ? w : h);

/** Snap to the nearest 1/16″ so plugs line up neatly. */
export const snapAt = (at: number) => Math.round(at * 16) / 16;

export const newPlugId = () => Math.random().toString(36).slice(2, 10);
