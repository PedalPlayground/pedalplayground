import type { Kind } from "./catalog";
import { formatLength } from "./units";
import type { Units } from "../store/ui";

export type SizeClass = "small" | "medium" | "large" | "xl";

export const SIZE_CLASSES: { id: SizeClass; label: string }[] = [
  { id: "small", label: "Small" },
  { id: "medium", label: "Medium" },
  { id: "large", label: "Large" },
  { id: "xl", label: "XL" },
];

/**
 * Where each size class starts, by width in inches. Picked from the catalog: pedals run from minis (Mooer, ~1.7″)
 * through standard boxes (MXR, Boss, ~2.4–2.9″) and big boxes (Strymon, 1590BB, ~4″) to multi-effects;
 * boards from Nano-sized up past 33″.
 */
const BREAKS: Record<Kind, [number, number, number]> = {
  pedal: [2.2, 3.3, 5.5],
  pedalboard: [18, 25, 33],
};

export function sizeClass(kind: Kind, widthIn: number): SizeClass {
  const [a, b, c] = BREAKS[kind];
  return widthIn < a ? "small" : widthIn < b ? "medium" : widthIn < c ? "large" : "xl";
}

/** "under 2.2″ wide", "2.2–3.3″ wide", "5.5″+ wide", in the user's units. */
export function sizeRange(kind: Kind, size: SizeClass, units: Units): string {
  const [a, b, c] = BREAKS[kind].map((n) => formatLength(n, units));
  const strip = (s: string) => s.replace(/″| mm/, "");
  switch (size) {
    case "small":
      return `under ${a} wide`;
    case "medium":
      return `${strip(a)}–${b} wide`;
    case "large":
      return `${strip(b)}–${c} wide`;
    case "xl":
      return `${c}+ wide`;
  }
}

/** The width range for the size menu. With pedals and pedalboards together, shows both: "2.2–3.3″ · 18–25″". */
export function sizeRangeShort(size: SizeClass, kind: Kind | null, units: Units): string {
  const one = (k: Kind) => sizeRange(k, size, units).replace(/ wide$/, "");
  return kind ? `${one(kind)} wide` : `${one("pedal")} · ${one("pedalboard")}`;
}
