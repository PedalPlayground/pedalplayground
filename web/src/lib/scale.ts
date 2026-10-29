import type { Units } from "../store/ui";
import { PX_PER_INCH } from "./geometry";

const MM_PER_INCH = 25.4;

/**
 * Dot grid spacings in inches, finest first: ½ in steps for inches, 1 cm steps for mm. Each is a whole
 * multiple of the one before, so the coarser dots always land on finer ones while they fade.
 */
const GRID_LEVELS: Record<Units, number[]> = {
  in: [0.5, 1, 2, 4, 8],
  mm: [10, 50, 100, 500].map((mm) => mm / MM_PER_INCH),
};

/** Below this spacing (screen px) a grid level is too dense to show; it's fully shown from GRID_FULL_PX up. */
const GRID_MIN_PX = 6;
const GRID_FULL_PX = 12;

export interface GridLayer {
  /** Spacing in screen px. */
  step: number;
  /** 0–1. */
  opacity: number;
}

/**
 * The dot grid layers for a zoom level. Zoomed in, it's the ½ in / 1 cm grid. Zooming out, those dots fade
 * away as they get crowded, leaving the next coarser grid, so the dots never turn into a gray wash.
 */
export function gridLayers(zoom: number, units: Units): GridLayer[] {
  const levels = GRID_LEVELS[units];
  const px = (inches: number) => inches * PX_PER_INCH * zoom;
  let i = levels.findIndex((l) => px(l) >= GRID_MIN_PX);
  if (i < 0) i = levels.length - 1;
  const fine = px(levels[i]);
  const t = Math.min(1, Math.max(0, (fine - GRID_MIN_PX) / (GRID_FULL_PX - GRID_MIN_PX)));
  const next = levels[i + 1];
  if (t >= 1 || next === undefined) return [{ step: fine, opacity: 1 }];
  return [
    { step: px(next), opacity: 1 },
    { step: fine, opacity: t },
  ];
}

/** Scale bar lengths to choose from, with their labels. */
const SCALE_STEPS: Record<Units, { inches: number; label: string }[]> = {
  in: [
    { inches: 0.25, label: "¼ in" },
    { inches: 0.5, label: "½ in" },
    { inches: 1, label: "1 in" },
    { inches: 2, label: "2 in" },
    { inches: 3, label: "3 in" },
    { inches: 6, label: "6 in" },
    { inches: 12, label: "12 in" },
  ],
  mm: [
    { mm: 5, label: "5 mm" },
    { mm: 10, label: "1 cm" },
    { mm: 20, label: "2 cm" },
    { mm: 50, label: "5 cm" },
    { mm: 100, label: "10 cm" },
    { mm: 200, label: "20 cm" },
    { mm: 300, label: "30 cm" },
  ].map(({ mm, label }) => ({ inches: mm / MM_PER_INCH, label })),
};

/** The longest the scale bar gets, in screen px. */
const SCALE_MAX_PX = 96;

/** The longest round length that fits in the scale bar at this zoom, and its width in screen px. */
export function scaleBar(zoom: number, units: Units): { label: string; px: number } {
  const steps = SCALE_STEPS[units];
  const ppi = PX_PER_INCH * zoom;
  const fit = steps.filter((s) => s.inches * ppi <= SCALE_MAX_PX);
  const pick = fit[fit.length - 1] ?? steps[0];
  return { label: pick.label, px: pick.inches * ppi };
}
