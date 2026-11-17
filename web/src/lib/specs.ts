/**
 * Pedal specs for the Equipment List. The same lists are checked by scripts/catalog/validate.mjs, so keep them in step.
 * PEDAL_TYPES is the built-in fallback: admins edit the live list in Admin > Types, and the app reads it with
 * usePedalTypes() (src/lib/pedalTypes.ts).
 */
export const PEDAL_TYPES = [
  "Boost",
  "Overdrive",
  "Distortion",
  "Fuzz",
  "Compressor",
  "EQ",
  "Modulation",
  "Delay",
  "Reverb",
  "Pitch",
  "Filter / Wah",
  "Looper",
  "Multi-Effect",
  "Amp / Preamp",
  "Tuner",
  "Volume / Expression",
  "Noise Gate",
  "Utility",
  "Other",
] as const;

export const VOLTAGES = ["9V DC", "12V DC", "18V DC", "24V DC", "9V AC", "12V AC", "5V USB"] as const;

/** "1,250 mA" */
export const formatMa = (ma: number) => `${ma.toLocaleString("en-US")} mA`;

/** A whole number of milliamps from what the user typed, or undefined when blank or invalid. */
export function parseMa(text: string): number | undefined {
  const n = Math.round(parseFloat(text.replace(/[,\s]|ma$/gi, "")));
  return Number.isFinite(n) && n > 0 ? n : undefined;
}
