import { useState } from "react";
import { LabeledSelect } from "./LabeledSelect";

/** How tightly a card grid packs: fewer, bigger cards (large) to more, smaller ones (small). */
export type Density = "large" | "medium" | "small";

const OPTIONS = [
  ["large", "Large"],
  ["medium", "Medium"],
  ["small", "Small"],
] as const;

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

/** The "Card size" dropdown over a card grid (Explore, Gear), beside the "Sort by" one. */
export function DensitySwitch({ value, onChange }: { value: Density; onChange: (d: Density) => void }) {
  return <LabeledSelect label="Card size" value={value} options={OPTIONS} onChange={onChange} />;
}
