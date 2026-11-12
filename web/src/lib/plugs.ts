/**
 * Plugs on a pedal's edges: cable ends drawn sticking out where the pedal's jacks are. They're stored on the item, in
 * its own unrotated frame, so they move, rotate, flip, duplicate and save with it.
 */

export type PlugSide = "top" | "right" | "bottom" | "left";
export type PlugType = "sp400" | "angle" | "pancake" | "mini" | "barrel" | "din";

export interface Plug {
  id: string;
  side: PlugSide;
  /** Where along the side, in inches: from the left end for top and bottom, from the top for left and right. */
  at: number;
  type: PlugType;
  /** What the jack is, from JACK_LABELS in lib/jacks.ts (like "output.stereo.trs"). Missing means unlabeled. */
  jack?: string;
  /** The plug at the other end of this plug's cable (see lib/cables.ts). A cable is stored on one of its ends only. */
  link?: PlugLink;
}

/** A cable's far end, and its shape if someone moved its runs by hand. */
export interface PlugLink extends PlugEnd {
  legs?: ManualLegs;
  /** What the cable carries (see CABLE_KINDS in lib/cables.ts). Missing means mono audio. */
  kind?: CableKind;
  /** The cable's color (hex). Missing means the default gray. */
  color?: string;
  /** True once the two ends' plug types were set apart; until then changing one changes both. */
  split?: boolean;
}

export type CableKind = "mono" | "stereo" | "midi" | "exp" | "tap" | "switching" | "power" | "other";

/**
 * A hand-placed cable shape, from this plug to the other: the legs alternate horizontal and vertical starting with
 * `first`, and `at` holds where each leg between the two end legs sits (the y of a horizontal leg, the x of a vertical
 * one). The end legs line up with the plugs, so the shape holds when the pedals move.
 */
export interface ManualLegs {
  first: "h" | "v";
  at: number[];
}

/** One end of a cable: a plug on a pedal. */
export interface PlugEnd {
  item: string;
  plug: string;
}

/**
 * A plug type: drawn from above with its cable dropping under the board, so only the head shows
 * (`assets/plugs/*-down.svg`, Trav's top-down drawings of the plug guide's plugs).
 */
export interface PlugSpec {
  label: string;
  art: PlugArtSpec;
}

/** How a plug drawing sits: its size, where the body starts (the barrel's left of it goes into the jack), and the barrel's centerline. */
export interface PlugArtSpec {
  name: "rean-down" | "sp400-down" | "pancake-down" | "mini-down" | "barrel-down" | "din-down";
  w: number;
  h: number;
  /** Where the body starts along the barrel: the edge of the pedal. */
  x0: number;
  /** The barrel's centerline: where the jack is. */
  cy: number;
}

/** The drawings' scale: 0.2 mm per unit (a Rean's thin side is 73 units, about 14.5 mm). */
export const ART_INCH_PER_UNIT = 0.2 / 25.4;

export const PLUG_TYPES: Record<PlugType, PlugSpec> = {
  sp400: { label: "Slim right-angle (SP400)", art: { name: "sp400-down", w: 189, h: 75, x0: 143, cy: 37.5 } },
  angle: { label: "Right-angle ¼″ (Rean)", art: { name: "rean-down", w: 217, h: 57, x0: 145, cy: 28.5 } },
  pancake: { label: "Pancake", art: { name: "pancake-down", w: 200, h: 115, x0: 143, cy: 57.5 } },
  // Placeholders until Trav's drawings: a 3.5 mm right-angle, a DC right-angle, a right-angle 5-pin MIDI.
  mini: { label: "Right-angle 3.5 mm", art: { name: "mini-down", w: 125, h: 45, x0: 75, cy: 22.5 } },
  barrel: { label: "DC right-angle (2.1 mm)", art: { name: "barrel-down", w: 112, h: 50, x0: 50, cy: 25 } },
  din: { label: "MIDI 5-pin (DIN)", art: { name: "din-down", w: 170, h: 100, x0: 65, cy: 50 } },
};
export const PLUG_ORDER: PlugType[] = ["sp400", "angle", "pancake", "mini", "barrel", "din"];
/** What new plugs are until another type is picked. */
export const DEFAULT_PLUG: PlugType = "sp400";

/** A stored type that's no longer offered (the old straight, "dc" and "midi" plugs, Nov 2026) shows as the default plug. */
export const knownType = (t: string): PlugType => (t in PLUG_TYPES ? (t as PlugType) : DEFAULT_PLUG);

/** How much barrel is drawn into the jack, in inches. Plugs sit under the pedal, so it shows only where the photo lets it. */
export const BARREL_STUB = 0.25;

/**
 * A plug head's box in its own frame (pointing up out of the edge from (0, 0)): from `left` to `right` along the edge,
 * `out` from it.
 */
export function plugBox(type: PlugType) {
  const a = PLUG_TYPES[knownType(type)].art;
  const k = ART_INCH_PER_UNIT;
  return { left: -a.cy * k, right: (a.h - a.cy) * k, out: (a.w - a.x0) * k };
}

/** Rotation that turns a plug drawn pointing up (off the top edge) to point off `side`. */
export const SIDE_ANGLE: Record<PlugSide, number> = { top: 0, right: 90, bottom: 180, left: 270 };

/** How long a side is, in inches, for an item `w` × `h`. */
export const sideLength = (side: PlugSide, w: number, h: number) => (side === "top" || side === "bottom" ? w : h);

/** Snap to the nearest 1/16″ so plugs line up neatly. */
export const snapAt = (at: number) => Math.round(at * 16) / 16;

export const newPlugId = () => Math.random().toString(36).slice(2, 10);
