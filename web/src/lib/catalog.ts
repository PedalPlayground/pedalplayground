import type { Catalog, CatalogItem } from "./types";

interface RawItem {
  Brand?: string;
  Name?: string;
  Width?: number;
  Height?: number;
  Image?: string;
}

const normalize = (raw: RawItem[]): CatalogItem[] =>
  raw
    .map((r) => ({
      brand: r.Brand ?? "",
      name: r.Name ?? "",
      width: r.Width ?? 0,
      height: r.Height ?? 0,
      image: r.Image ?? "",
    }))
    .sort((a, b) => a.brand.localeCompare(b.brand) || a.name.localeCompare(b.name));

/**
 * Catalog source. Reads the repo JSON today; swap this for Supabase tables later
 * without touching callers.
 */
export async function loadCatalog(): Promise<Catalog> {
  const [pedals, pedalboards] = await Promise.all(
    ["pedals", "pedalboards"].map((n) => fetch(`/data/${n}.json`).then((r) => r.json() as Promise<RawItem[]>)),
  );
  return { pedals: normalize(pedals), pedalboards: normalize(pedalboards) };
}

export const pedalImageUrl = (image: string) => `/images/pedals/${image}`;
export const pedalboardImageUrl = (image: string) => `/images/pedalboards/${image}`;
