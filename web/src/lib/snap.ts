import { itemBounds } from "./geometry";
import type { Item } from "./types";

export interface Guides {
  /** World x positions (inches) of vertical guide lines. */
  x: number[];
  /** World y positions (inches) of horizontal guide lines. */
  y: number[];
}

const EPS = 1e-6;

/** Best offset (inches) that aligns any of `moving` to any of `targets`, within `threshold`. */
function bestOffset(moving: number[], targets: number[], threshold: number): { offset: number; lines: number[] } | null {
  let best: { offset: number; lines: number[] } | null = null;
  for (const m of moving) {
    for (const t of targets) {
      const d = t - m;
      if (Math.abs(d) > threshold) continue;
      if (!best || Math.abs(d) < Math.abs(best.offset) - EPS) best = { offset: d, lines: [t] };
      else if (Math.abs(Math.abs(d) - Math.abs(best.offset)) <= EPS) best.lines.push(t);
    }
  }
  return best;
}

const edges = (a: number, b: number) => [a, (a + b) / 2, b];

/**
 * Snaps a group move so the group's edges/centers line up with other items'.
 * `moving` are the items at their drag-start positions; (dx, dy) is the raw cursor delta in inches.
 */
export function snapMove(moving: Item[], others: Item[], dx: number, dy: number, threshold: number) {
  const shifted = moving.map((i) => itemBounds({ ...i, x: i.x + dx, y: i.y + dy }));
  const group = shifted.reduce((a, b) => ({
    left: Math.min(a.left, b.left),
    top: Math.min(a.top, b.top),
    right: Math.max(a.right, b.right),
    bottom: Math.max(a.bottom, b.bottom),
  }));
  const otherBounds = others.map(itemBounds);

  const sx = bestOffset(
    edges(group.left, group.right),
    otherBounds.flatMap((o) => edges(o.left, o.right)),
    threshold,
  );
  const sy = bestOffset(
    edges(group.top, group.bottom),
    otherBounds.flatMap((o) => edges(o.top, o.bottom)),
    threshold,
  );

  // Several items can share an edge, so the same line can match more than once. Keep each line once.
  const unique = (lines: number[] | undefined) => [...new Set(lines ?? [])];
  const guides: Guides = { x: unique(sx?.lines), y: unique(sy?.lines) };
  return { dx: dx + (sx?.offset ?? 0), dy: dy + (sy?.offset ?? 0), guides };
}
