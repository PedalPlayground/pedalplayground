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
  /** Types besides the main one. Undefined until the database has the column (it's then left out of saves). */
  extraTypes?: string[];
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
  /** "shape": the photo's shape doesn't match the size, and the form offers to size it from the photo. */
  fix?: "shape";
}

/** Below this many pixels per inch a photo looks soft at the canvas's zoomed-in sizes. */
export const MIN_PPI = 60;
/** How far the photo's shape may drift from the entered size before it's flagged (5%). */
export const SHAPE_TOLERANCE = 0.05;

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");

/**
 * The catalog's brands, one per brand however it's spelled across items (case, spaces, punctuation), using the
 * spelling most of its items use. Most items first.
 */
export function catalogBrands(items: Pick<CatalogItem, "brand">[]): string[] {
  const groups = new Map<string, Map<string, number>>();
  for (const { brand } of items) {
    const key = norm(brand);
    if (!key) continue;
    const spellings = groups.get(key) ?? new Map<string, number>();
    spellings.set(brand.trim(), (spellings.get(brand.trim()) ?? 0) + 1);
    groups.set(key, spellings);
  }
  return [...groups.values()]
    .map((spellings) => {
      const [best] = [...spellings].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
      const total = [...spellings.values()].reduce((a, b) => a + b, 0);
      return { brand: best[0], total };
    })
    .sort((a, b) => b.total - a.total || a.brand.localeCompare(b.brand))
    .map((b) => b.brand);
}

/** Brands matching what's typed, ignoring case, spaces and punctuation: those starting with it first, then the rest. */
export function brandSuggestions(typed: string, brands: string[], n = 8): string[] {
  const q = norm(typed);
  if (!q) return [];
  const starts = brands.filter((b) => norm(b).startsWith(q));
  const contains = brands.filter((b) => !norm(b).startsWith(q) && norm(b).includes(q));
  return [...starts, ...contains].slice(0, n);
}

/** One size a brand uses, how many of its items have it, and its most used item (for a thumbnail). */
export interface BrandSize {
  width: number;
  height: number;
  count: number;
  example: CatalogItem;
}

/** How much an item is used (higher first); ties fall back to the name. Defaults to no usage data. */
export type Usage = (item: CatalogItem) => number;
const byUsage = (usage: Usage) => (a: CatalogItem, b: CatalogItem) => usage(b) - usage(a) || a.name.localeCompare(b.name);

/**
 * The sizes a brand's items come in (sizes within 0.05 in count as one), for brands that build on standard
 * enclosures. Only sizes shared by at least `minCount` items, up to `n`. Closest to `near` first when it's given (the
 * new item's size, either way round), then the most common.
 */
export function brandSizes(
  items: CatalogItem[],
  brand: string,
  n = 6,
  usage: Usage = () => 0,
  minCount = 2,
  near?: { width: number; height: number },
): BrandSize[] {
  const key = norm(brand);
  if (!key) return [];
  const sizes: BrandSize[] = [];
  for (const i of items) {
    if (norm(i.brand) !== key || !(i.width > 0 && i.height > 0)) continue;
    const same = sizes.find((s) => Math.abs(s.width - i.width) < 0.05 && Math.abs(s.height - i.height) < 0.05);
    if (same) {
      same.count++;
      if (byUsage(usage)(i, same.example) < 0) same.example = i;
    } else sizes.push({ width: i.width, height: i.height, count: 1, example: i });
  }
  const sized = near && near.width > 0 && near.height > 0;
  // How far a size is from the new item's: the bigger of the two side differences, either way round.
  const off = (s: BrandSize) =>
    sized
      ? Math.min(
          Math.max(Math.abs(s.width - near.width), Math.abs(s.height - near.height)),
          Math.max(Math.abs(s.width - near.height), Math.abs(s.height - near.width)),
        )
      : 0;
  return sizes
    .filter((s) => s.count >= minCount)
    .sort((a, b) => off(a) - off(b) || b.count - a.count || a.width * a.height - b.width * b.height)
    .slice(0, n);
}

/** Catalog items for "Copy from…": every word typed in the brand or name, the given brand's items first, then most used. */
export function copySources(items: CatalogItem[], typed: string, brand: string, n = 12, usage: Usage = () => 0): CatalogItem[] {
  const words = typed.toLowerCase().split(/\s+/).filter(Boolean).map(norm).filter(Boolean);
  const key = norm(brand);
  const matches = items.filter((i) => {
    const text = norm(`${i.brand} ${i.name}`);
    return words.length ? words.every((w) => text.includes(w)) : key !== "" && norm(i.brand) === key;
  });
  return matches.sort((a, b) => Number(norm(b.brand) === key) - Number(norm(a.brand) === key) || byUsage(usage)(a, b)).slice(0, n);
}

/** What "Copy from…" and Duplicate fill in: brand and size, plus power and type when asked. */
export function copiedFields(from: CatalogItem, withSpecs: boolean): Partial<Fields> {
  return {
    brand: from.brand,
    width: from.width,
    height: from.height,
    ...(withSpecs ? { ma: from.ma, voltage: from.voltage, type: from.type, extraTypes: from.types?.slice(1) ?? [] } : {}),
  };
}

/** The catalog's spelling when the typed brand is the same brand spelled differently ("Electro Harmonix"), else null. */
export function brandSpelling(typed: string, brands: string[]): string | null {
  const q = norm(typed);
  if (!q) return null;
  const match = brands.find((b) => norm(b) === q);
  return match && match !== typed.trim() ? match : null;
}

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
            fix: "shape",
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
