/** WCAG relative luminance of a hex color, from 0 (black) to 1 (white). Unparseable colors count as black. */
export function luminance(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return 0;
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(m[1].slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Black or white, whichever reads better on `hex`. */
export function readableOn(hex: string): "#111318" | "#ffffff" {
  return luminance(hex) > 0.4 ? "#111318" : "#ffffff";
}

export const DEFAULT_PEDAL_COLOR = "#41c74d";

/** Swatches in the Custom form: bright, current boutique-pedal finishes, plus one deep neutral. */
export const PEDAL_COLOR_PRESETS: { name: string; hex: string }[] = [
  { name: "Mint", hex: "#7fd8b4" },
  { name: "Sky", hex: "#6cb8f0" },
  { name: "Lavender", hex: "#a993f0" },
  { name: "Peach", hex: "#ffa98a" },
  { name: "Coral", hex: "#ff6b5e" },
  { name: "Mustard", hex: "#f2c14e" },
  { name: "Ink", hex: "#2b3445" },
];

/** The color a new custom pedal starts with. */
export const NEW_PEDAL_COLOR = PEDAL_COLOR_PRESETS[0].hex;

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
