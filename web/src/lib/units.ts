import type { Units } from "../store/ui";

const MM_PER_INCH = 25.4;

export function formatSize(widthIn: number, heightIn: number, units: Units): string {
  if (units === "mm") {
    return `${Math.round(widthIn * MM_PER_INCH)} × ${Math.round(heightIn * MM_PER_INCH)} mm`;
  }
  return `${+widthIn.toFixed(2)}″ × ${+heightIn.toFixed(2)}″`;
}
