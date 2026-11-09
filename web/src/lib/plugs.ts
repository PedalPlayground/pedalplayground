/**
 * Plugs on a pedal's edges: cable ends drawn sticking out where the pedal's jacks are. They're stored on the item, in
 * its own unrotated frame, so they move, rotate, flip, duplicate and save with it.
 */

export type PlugSide = "top" | "right" | "bottom" | "left";
export type PlugType = "straight" | "angle" | "sp400" | "pancake";

export interface Plug {
  id: string;
  side: PlugSide;
  /** Where along the side, in inches: from the left end for top and bottom, from the top for left and right. */
  at: number;
  type: PlugType;
  /** Right-angle plugs: the cable leaves to the other side (mirrored). */
  flip?: boolean;
  /** Right-angle plugs: turned so the cable points straight down into the board (seen from above, only the cap shows). */
  down?: boolean;
}

export interface PlugSpec {
  label: string;
  /** Across the edge and out from it, in inches (the head, not the cable). Drawn plugs work theirs out from the art. */
  width: number;
  length: number;
  /** The cable leaves sideways (right-angle plugs), so the plug can face either way. */
  sideways: boolean;
  /** A drawing from `assets/plugs` (shared with Space Between's plug guide), top-down with the barrel pointing left. */
  art?: PlugArtSpec;
  /** The same plug turned cable-down, seen from above (no cable showing): `assets/plugs/*-down.svg`. */
  downArt?: PlugArtSpec;
}

/** How a plug drawing sits: its size, where the body starts (the barrel's left of it goes into the jack), and the barrel's centerline. */
export interface PlugArtSpec {
  name: "rean" | "sp400" | "pancake" | "rean-down" | "sp400-down" | "pancake-down";
  w: number;
  h: number;
  /** Where the body starts along the barrel: the edge of the pedal. */
  x0: number;
  /** The barrel's centerline: where the jack is. */
  cy: number;
}

/** The drawings' scale: 0.2 mm per unit (a Rean's thin side is 73 units, about 14.5 mm). */
export const ART_INCH_PER_UNIT = 0.2 / 25.4;

const art = (a: PlugArtSpec, down: PlugArtSpec) => ({ art: a, downArt: down, width: a.h * ART_INCH_PER_UNIT, length: (a.w - a.x0) * ART_INCH_PER_UNIT, sideways: true });

export const PLUG_TYPES: Record<PlugType, PlugSpec> = {
  straight: { label: "Straight ¼″", width: 0.45, length: 1.5, sideways: false },
  angle: { label: "Right-angle ¼″ (Rean)", ...art({ name: "rean", w: 217, h: 212, x0: 144, cy: 27.5 }, { name: "rean-down", w: 217, h: 57, x0: 145, cy: 28.5 }) },
  sp400: { label: "Slim right-angle (SP400)", ...art({ name: "sp400", w: 189, h: 133, x0: 144, cy: 37.5 }, { name: "sp400-down", w: 189, h: 75, x0: 143, cy: 37.5 }) },
  pancake: { label: "Pancake", ...art({ name: "pancake", w: 203, h: 201, x0: 143.6, cy: 59.5 }, { name: "pancake-down", w: 200, h: 115, x0: 143, cy: 57.5 }) },
};
export const PLUG_ORDER: PlugType[] = ["straight", "angle", "sp400", "pancake"];

/** A stored type that's no longer offered (DC and MIDI plugs, Nov 2026) shows as a straight plug. */
export const knownType = (t: string): PlugType => (t in PLUG_TYPES ? (t as PlugType) : "straight");

/** How much barrel is drawn into the jack, in inches. Plugs sit under the pedal, so it shows only where the photo lets it. */
export const BARREL_STUB = 0.25;
/** A ¼″ barrel's thickness, in inches. */
export const BARREL = 27 * (0.2 / 25.4);

/**
 * A plug head's box in its own frame (pointing up out of the edge from (0, 0)): from `left` to `right` along the edge,
 * `out` from it. Right-angle drawings sit off to the cable's side, mirrored when flipped.
 */
export function plugBox(type: PlugType, flip?: boolean, down?: boolean) {
  const spec = PLUG_TYPES[knownType(type)];
  if (!spec.art) return { left: -spec.width / 2, right: spec.width / 2, out: spec.length };
  const k = ART_INCH_PER_UNIT;
  const a = down && spec.downArt ? spec.downArt : spec.art;
  const out = (a.w - a.x0) * k;
  const [l, r] = [-a.cy * k, (a.h - a.cy) * k];
  if (down) return { left: l, right: r, out };
  return flip ? { left: -r, right: -l, out } : { left: l, right: r, out };
}

/** Rotation that turns a plug drawn pointing up (off the top edge) to point off `side`. */
export const SIDE_ANGLE: Record<PlugSide, number> = { top: 0, right: 90, bottom: 180, left: 270 };

/** How long a side is, in inches, for an item `w` × `h`. */
export const sideLength = (side: PlugSide, w: number, h: number) => (side === "top" || side === "bottom" ? w : h);

/** Snap to the nearest 1/16″ so plugs line up neatly. */
export const snapAt = (at: number) => Math.round(at * 16) / 16;

export const newPlugId = () => Math.random().toString(36).slice(2, 10);
