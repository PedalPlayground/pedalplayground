import { Grid2x2, Grid3x3, Square } from "lucide-react";
import { useState } from "react";
import { tip } from "./Tooltip";

/** How tightly a card grid packs: fewer, bigger cards (large) to more, smaller ones (small). */
export type Density = "large" | "medium" | "small";

const OPTIONS: [Density, string, typeof Square][] = [
  ["large", "Large cards", Square],
  ["medium", "Medium cards", Grid2x2],
  ["small", "Small cards", Grid3x3],
];

/** The viewer's choice for one page's grid (`key`: "gallery", "gear"), kept in this browser. Medium when unset. */
export function useDensity(key: string): [Density, (d: Density) => void] {
  const storageKey = `pp:density:${key}`;
  const [density, setDensity] = useState<Density>(() => {
    try {
      const v = localStorage.getItem(storageKey);
      return v === "large" || v === "small" ? v : "medium";
    } catch {
      return "medium";
    }
  });
  const set = (d: Density) => {
    setDensity(d);
    try {
      localStorage.setItem(storageKey, d);
    } catch {
      // Private windows: the choice just lasts this visit.
    }
  };
  return [density, set];
}

/** Three icon buttons over a card grid (Explore, Gear), styled like the pages' sort control. */
export function DensitySwitch({ value, onChange }: { value: Density; onChange: (d: Density) => void }) {
  return (
    <div role="radiogroup" aria-label="Card size" className="flex shrink-0 rounded-control bg-ink/[0.06] p-0.5">
      {OPTIONS.map(([d, label, Icon]) => (
        <button
          key={d}
          type="button"
          role="radio"
          aria-checked={value === d}
          aria-label={label}
          {...tip(label)}
          onClick={() => onChange(d)}
          className={`grid h-7 w-8 place-items-center rounded-[3px] transition-colors ${value === d ? "bg-surface text-ink shadow-sm" : "text-ink-muted hover:text-ink"}`}
        >
          <Icon size={14} strokeWidth={2.25} />
        </button>
      ))}
    </div>
  );
}
