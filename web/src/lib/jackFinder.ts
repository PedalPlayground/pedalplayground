import { snapAt, type Plug, type PlugSide } from "./plugs";

/** A spot on an edge where the photo sticks out past the enclosure: probably a jack. */
export interface JackHint {
  side: PlugSide;
  /** Along the side, in inches (from the left for top and bottom, from the top for left and right). */
  at: number;
}

/** The scan's width in pixels: small, so it's quick. */
const SCAN = 240;
/** A pixel counts as part of the pedal from this alpha up. */
const SOLID = 128;
/** How far past the enclosure a bump must reach, and how wide it may be, in inches, to look like a jack. */
const MIN_OUT = 0.05;
const MIN_WIDE = 0.2;
const MAX_WIDE = 1.0;

const cache = new Map<string, Promise<JackHint[]>>();

/**
 * Guesses where a pedal's jacks are from its cutout photo (transparent background, cropped to the pedal, jacks
 * included). Along each edge it finds the enclosure's line (the most common depth where the photo turns solid) and
 * reports short runs that stick out past it. The front edge is skipped: jacks are almost never there, and footswitch
 * lips (like Boss's) would read as one. Photos without a cutout, or that can't be read, give none.
 */
export function findJacks(url: string, wIn: number, hIn: number): Promise<JackHint[]> {
  const key = `${url}|${wIn}|${hIn}`;
  let found = cache.get(key);
  if (!found) {
    found = scan(url, wIn, hIn).catch(() => []);
    cache.set(key, found);
  }
  return found;
}

async function scan(url: string, wIn: number, hIn: number): Promise<JackHint[]> {
  // onload, not decode(): decode() can wait indefinitely while the page isn't being painted.
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.crossOrigin = "anonymous";
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = url;
  });
  const w = SCAN;
  const h = Math.max(1, Math.round((SCAN * img.naturalHeight) / img.naturalWidth));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return [];
  ctx.drawImage(img, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h).data;
  const solid = (x: number, y: number) => data[(y * w + x) * 4 + 3] >= SOLID;

  // No transparency at the corners means the background isn't cut out: nothing to read.
  if (solid(0, 0) && solid(w - 1, 0) && solid(0, h - 1) && solid(w - 1, h - 1)) return [];

  const pxPerInX = w / wIn;
  const pxPerInY = h / hIn;
  const out: JackHint[] = [];

  /** One edge: depth of the first solid pixel along each line in from the edge, then the runs that beat the body. */
  const edge = (side: PlugSide, lines: number, depthOf: (i: number) => number, pxPerInAlong: number, pxPerInOut: number, lengthIn: number) => {
    const depth = Array.from({ length: lines }, (_, i) => depthOf(i));
    const seen = depth.filter((d) => d >= 0).sort((a, b) => a - b);
    if (seen.length < lines * 0.3) return;
    const body = seen[Math.floor(seen.length / 2)];
    const sticks = depth.map((d) => d >= 0 && body - d >= MIN_OUT * pxPerInOut);
    for (let i = 0; i < lines; ) {
      if (!sticks[i]) {
        i++;
        continue;
      }
      let j = i;
      while (j < lines && sticks[j]) j++;
      const wide = (j - i) / pxPerInAlong;
      if (wide >= MIN_WIDE && wide <= MAX_WIDE) {
        const at = Math.round((((i + j) / 2) / pxPerInAlong) * 16) / 16;
        out.push({ side, at: Math.min(Math.max(at, 0), lengthIn) });
      }
      i = j;
    }
  };
  const fromTop = (x: number) => {
    for (let y = 0; y < h; y++) if (solid(x, y)) return y;
    return -1;
  };
  const fromLeft = (y: number) => {
    for (let x = 0; x < w; x++) if (solid(x, y)) return x;
    return -1;
  };
  const fromRight = (y: number) => {
    for (let x = w - 1; x >= 0; x--) if (solid(x, y)) return w - 1 - x;
    return -1;
  };
  edge("top", w, fromTop, pxPerInX, pxPerInY, wIn);
  edge("left", h, fromLeft, pxPerInY, pxPerInX, hIn);
  edge("right", h, fromRight, pxPerInY, pxPerInX, hIn);
  return out;
}

/** The guessed jacks that don't have a plug on them yet. */
export const openHints = (hints: JackHint[], plugs: Plug[]) =>
  hints.filter((h) => !plugs.some((p) => p.side === h.side && Math.abs(p.at - h.at) < 0.4));

/**
 * The found jacks, plus a + at the middle of every side in `sides` that has none (all four by default, when nothing
 * was found or there's no photo).
 */
export const withMiddles = (found: JackHint[], w: number, h: number, sides: readonly PlugSide[] = ["top", "right", "bottom", "left"]): JackHint[] => [
  ...found,
  ...sides
    .filter((side) => !found.some((f) => f.side === side))
    .map((side) => ({ side, at: snapAt((side === "top" || side === "bottom" ? w : h) / 2) })),
];
