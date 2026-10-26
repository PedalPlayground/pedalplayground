/**
 * Looks a custom pedal can take. Each one is drawn in code (see PedalArt) so it lays itself out at any size:
 * knobs and footswitches stay round while their spacing, and sometimes their count, follow the pedal's size.
 */
export type PedalTemplate = "classic" | "compact" | "hammond" | "wide" | "modeler" | "switcher";

export interface PedalTemplateInfo {
  id: PedalTemplate;
  name: string;
  /** Tooltip on the picker tile. */
  hint: string;
  /** A typical size in inches, suggested when the template is picked. */
  width: number;
  height: number;
  /** Where its jacks usually go. */
  jacks: Jacks | null;
}

export const PEDAL_TEMPLATES: PedalTemplateInfo[] = [
  { id: "compact", name: "Compact", hint: "Boss-style, with a big treadle", width: 2.875, height: 5.125, jacks: "side" },
  { id: "hammond", name: "Hammond", hint: "Small enclosure, knobs and one footswitch", width: 2.6, height: 4.8, jacks: "top" },
  { id: "wide", name: "Wide Hammond", hint: "Two footswitches, knobs and toggles", width: 4.7, height: 3.7, jacks: "top" },
  { id: "modeler", name: "Modeler", hint: "Screen, knobs and a row of footswitches", width: 12, height: 6.5, jacks: "top" },
  { id: "switcher", name: "Switcher", hint: "Footswitches only: loopers and amp switches", width: 6, height: 2.5, jacks: "top" },
  { id: "classic", name: "Classic", hint: "The original custom pedal look", width: 2.75, height: 4.25, jacks: "side" },
];

export const DEFAULT_PEDAL_TEMPLATE: PedalTemplate = "compact";

export const templateInfo = (id: PedalTemplate | undefined) => PEDAL_TEMPLATES.find((t) => t.id === (id ?? "classic"))!;

/** Which edges of a custom pedal have 1/4" jacks sticking out. Missing means none. */
export type Jacks = "top" | "side" | "both";

/**
 * How far a 1/4" jack sticks out past the enclosure, in inches: the hex nut and threaded bushing of a typical
 * Switchcraft or Lumberg jack, as on JHS pedals. Each edge with jacks adds this to the pedal's footprint.
 */
export const JACK_DEPTH = 0.25;
/** Length of a jack's nut along the edge, in inches. */
export const JACK_LENGTH = 0.5;

export const hasTopJacks = (j: Jacks | null | undefined) => j === "top" || j === "both";
export const hasSideJacks = (j: Jacks | null | undefined) => j === "side" || j === "both";

/** The footprint, in inches, of an enclosure `w` × `h` with the given jacks. Side jacks stick out of both sides. */
export function withJacks(w: number, h: number, j: Jacks | null | undefined) {
  return { width: w + (hasSideJacks(j) ? JACK_DEPTH * 2 : 0), height: h + (hasTopJacks(j) ? JACK_DEPTH : 0) };
}

/** The enclosure size, in inches, inside a footprint `w` × `h` with the given jacks. */
export function withoutJacks(w: number, h: number, j: Jacks | null | undefined) {
  return { width: w - (hasSideJacks(j) ? JACK_DEPTH * 2 : 0), height: h - (hasTopJacks(j) ? JACK_DEPTH : 0) };
}
