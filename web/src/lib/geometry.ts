import type { Item } from "./types";

/** Pixels per inch at zoom 1. Matches the legacy app's default scale. */
export const PX_PER_INCH = 32;

/** Axis-aligned bounds of an item in inches, accounting for 90/270 rotation about its center. */
export function itemBounds(i: Item) {
  const swap = i.rotation === 90 || i.rotation === 270;
  const w = swap ? i.height : i.width;
  const h = swap ? i.width : i.height;
  const cx = i.x + i.width / 2;
  const cy = i.y + i.height / 2;
  return { left: cx - w / 2, top: cy - h / 2, right: cx + w / 2, bottom: cy + h / 2 };
}

export function contentBounds(items: Item[]) {
  if (!items.length) return null;
  return items.map(itemBounds).reduce((a, b) => ({
    left: Math.min(a.left, b.left),
    top: Math.min(a.top, b.top),
    right: Math.max(a.right, b.right),
    bottom: Math.max(a.bottom, b.bottom),
  }));
}

export const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
