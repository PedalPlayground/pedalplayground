/** Black or white, whichever reads better on `hex` (WCAG relative luminance). */
export function readableOn(hex: string): "#111318" | "#ffffff" {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return "#ffffff";
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(m[1].slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? "#111318" : "#ffffff";
}

export const DEFAULT_PEDAL_COLOR = "#41c74d";

export const PEDAL_COLOR_PRESETS = ["#41c74d", "#e5484d", "#f5a524", "#3b82f6", "#8b5cf6", "#ec4899", "#14b8a6", "#d4d4d8", "#27272a"];

/** Mixes `hex` toward white (amt > 0) or black (amt < 0), by |amt| from 0 to 1. */
export function shade(hex: string, amt: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const target = amt > 0 ? 255 : 0;
  const a = Math.min(1, Math.abs(amt));
  return (
    "#" +
    [0, 2, 4]
      .map((i) => {
        const c = parseInt(m[1].slice(i, i + 2), 16);
        return Math.round(c + (target - c) * a)
          .toString(16)
          .padStart(2, "0");
      })
      .join("")
  );
}
