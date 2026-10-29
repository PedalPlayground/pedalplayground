import type { Units } from "../store/ui";

const MM_PER_INCH = 25.4;

export function formatSize(widthIn: number, heightIn: number, units: Units): string {
  if (units === "mm") {
    return `${Math.round(widthIn * MM_PER_INCH)} × ${Math.round(heightIn * MM_PER_INCH)} mm`;
  }
  return `${+widthIn.toFixed(2)}″ × ${+heightIn.toFixed(2)}″`;
}

/** One length, rounded for labels: 2.2″ or 56 mm. */
export function formatLength(inches: number, units: Units): string {
  return units === "mm" ? `${Math.round(inches * MM_PER_INCH)} mm` : `${+inches.toFixed(1)}″`;
}
