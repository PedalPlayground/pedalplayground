/**
 * Checks the editor page runs on a submitted or added item, so a wrong size, a blurry photo or a duplicate
 * stands out before it's approved. Pure, apart from imageStats, which reads pixels in the browser.
 */
import type { CatalogItem } from "./types";

export interface Fields {
  kind: "pedal" | "pedalboard";
  brand: string;
  name: string;
  /** Inches */
  width: number;
  /** Inches */
  height: number;
  ma?: number;
  voltage?: string;
  type?: string;
}

export interface ImageStats {
  width: number;
  height: number;
  /** True when some pixels are see-through, i.e. the background has been cut out. */
  hasAlpha: boolean;
}

export interface Check {
  ok: boolean;
  text: string;
}

/** Below this many pixels per inch a photo looks soft at the canvas's zoomed-in sizes. */
export const MIN_PPI = 60;
/** How far the photo's shape may drift from the entered size before it's flagged (5%). */
export const SHAPE_TOLERANCE = 0.05;

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");

/** Live catalog entries that look like the same item: same brand, and one name contains the other. */
export function possibleDuplicates(fields: Pick<Fields, "brand" | "name">, items: CatalogItem[], skipImage?: string): CatalogItem[] {
  const brand = norm(fields.brand);
  const name = norm(fields.name);
  if (!brand || !name) return [];
  return items.filter((i) => {
    if (skipImage && i.image === skipImage) return false;
    if (norm(i.brand) !== brand) return false;
    const other = norm(i.name);
    return other === name || (name.length >= 3 && other.includes(name)) || (other.length >= 3 && name.includes(other));
  });
}

/** Up to `n` items from the same brand, closest in size first, to show beside the new one at the same scale. */
export function sameBrand(items: CatalogItem[], fields: Pick<Fields, "brand" | "width" | "height">, n = 3, skipImage?: string): CatalogItem[] {
  const brand = norm(fields.brand);
  if (!brand) return [];
  const area = fields.width * fields.height;
  return items
    .filter((i) => norm(i.brand) === brand && i.image !== skipImage)
    .sort((a, b) => Math.abs(a.width * a.height - area) - Math.abs(b.width * b.height - area))
    .slice(0, n);
}

export function runChecks(fields: Fields, stats: ImageStats | null, items: CatalogItem[], skipImage?: string): Check[] {
  const out: Check[] = [];
  if (stats) {
    const ppi = Math.max(stats.width, stats.height) / Math.max(fields.width, fields.height);
    out.push(
      ppi >= MIN_PPI
        ? { ok: true, text: `Resolution: ${Math.round(ppi)} px per inch` }
        : { ok: false, text: `Low resolution: ${Math.round(ppi)} px per inch (aim for ${MIN_PPI}+)` },
    );
    const photo = stats.width / stats.height;
    const entered = fields.width / fields.height;
    const drift = Math.abs(photo / entered - 1);
    out.push(
      drift <= SHAPE_TOLERANCE
        ? { ok: true, text: "Photo shape matches the size" }
        : {
            ok: false,
            text: `Photo shape doesn't match the size: the photo is ${(photo).toFixed(2)}:1, the size is ${entered.toFixed(2)}:1. One of them is probably wrong.`,
          },
    );
    out.push(
      stats.hasAlpha
        ? { ok: true, text: "Background is cut out" }
        : { ok: false, text: "No transparent background: it needs a cutout before approving" },
    );
  }
  const dupes = possibleDuplicates(fields, items, skipImage);
  out.push(
    dupes.length
      ? { ok: false, text: `Possible duplicate: ${dupes.slice(0, 3).map((d) => `${d.brand} ${d.name}`).join(", ")}` }
      : { ok: true, text: "No duplicates found" },
  );
  return out;
}

/** Problems that stop a save outright (the database would refuse them too). */
export function fieldProblems(f: Fields): string[] {
  const out: string[] = [];
  if (!f.brand.trim()) out.push("Brand is required.");
  if (!f.name.trim()) out.push("Name is required.");
  if (!(f.width > 0 && f.width <= 60) || !(f.height > 0 && f.height <= 60)) out.push("Width and height must be between 0 and 60 inches.");
  if (f.ma !== undefined && !(Number.isInteger(f.ma) && f.ma >= 0 && f.ma <= 10000)) out.push("Current draw must be 0 to 10,000 mA.");
  return out;
}

/** Pixel size and whether the image has transparency (any of a sample of pixels below full opacity). */
export function imageStats(img: HTMLImageElement): ImageStats {
  const width = img.naturalWidth;
  const height = img.naturalHeight;
  const scale = Math.min(1, 200 / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext("2d");
  let hasAlpha = false;
  if (ctx) {
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] < 250) {
        hasAlpha = true;
        break;
      }
    }
  }
  return { width, height, hasAlpha };
}
