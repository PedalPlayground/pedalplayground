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
}

export const PEDAL_TEMPLATES: PedalTemplateInfo[] = [
  { id: "compact", name: "Compact", hint: "Boss-style, with a big treadle", width: 2.875, height: 5.125 },
  { id: "hammond", name: "Hammond", hint: "Small enclosure, knobs and one footswitch", width: 2.6, height: 4.8 },
  { id: "wide", name: "Wide Hammond", hint: "Two footswitches, knobs and toggles", width: 4.7, height: 3.7 },
  { id: "modeler", name: "Modeler", hint: "Screen, knobs and a row of footswitches", width: 12, height: 6.5 },
  { id: "switcher", name: "Switcher", hint: "Footswitches only: loopers and amp switches", width: 6, height: 2.5 },
  { id: "classic", name: "Classic", hint: "The original custom pedal look", width: 2.75, height: 4.25 },
];

export const DEFAULT_PEDAL_TEMPLATE: PedalTemplate = "compact";

export const templateInfo = (id: PedalTemplate | undefined) => PEDAL_TEMPLATES.find((t) => t.id === (id ?? "classic"))!;
