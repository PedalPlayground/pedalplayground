import type { CatalogItem } from "./types";

/**
 * Where the generated catalog lives (manifest + thumb/ + img/). Same-origin `/catalog/` in dev;
 * set VITE_CATALOG_BASE_URL to a CDN origin in production.
 */
export const CATALOG_BASE = ((import.meta.env.VITE_CATALOG_BASE_URL as string | undefined) || "/catalog/").replace(/\/?$/, "/");

export type Kind = "pedal" | "pedalboard";

export interface Manifest {
  schema: number;
  pedals: CatalogItem[];
  pedalboards: CatalogItem[];
  /** image key -> hashed file paths relative to CATALOG_BASE */
  assets: { pedals: Record<string, AssetPaths>; pedalboards: Record<string, AssetPaths> };
}

export interface AssetPaths {
  thumb: string;
  img: string;
}

/** Documents store the original filename ("boss-ds1.png"); the manifest keys drop the extension. */
export const imageKey = (image: string) => image.replace(/\.png$/i, "");

export async function fetchManifest(): Promise<Manifest> {
  const res = await fetch(`${CATALOG_BASE}catalog.json`);
  if (!res.ok) {
    throw new Error(`Catalog not found at ${CATALOG_BASE}catalog.json. In dev, run "npm run catalog:build" first.`);
  }
  const m = (await res.json()) as Manifest;
  const byName = (a: CatalogItem, b: CatalogItem) => a.brand.localeCompare(b.brand) || a.name.localeCompare(b.name);
  m.pedals.sort(byName);
  m.pedalboards.sort(byName);
  return m;
}

function paths(m: Manifest | null, kind: Kind, image: string): AssetPaths | null {
  return m?.assets[kind === "pedal" ? "pedals" : "pedalboards"][imageKey(image)] ?? null;
}

/** Optimized canvas image URL, or null if the manifest isn't loaded or has no such image. */
export function canvasImageUrl(m: Manifest | null, kind: Kind, image: string): string | null {
  const p = paths(m, kind, image);
  return p ? CATALOG_BASE + p.img : null;
}

export function thumbUrl(m: Manifest | null, kind: Kind, image: string): string | null {
  const p = paths(m, kind, image);
  return p ? CATALOG_BASE + p.thumb : null;
}
