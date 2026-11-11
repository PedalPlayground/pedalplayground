import { track } from "./analytics";
import type { Kind } from "./catalog";
import { supabase } from "./supabase";

export interface TrendingEntry {
  kind: Kind;
  image: string;
  adds: number;
}

/**
 * Records that a catalog item was added to a playground. Fire and forget: failures never reach the user. `source` says
 * how it was found, for GA: "search", "trending" or "new" in Add Gear, "replace", or "gear_page".
 */
export function recordGearAdd(kind: Kind, image: string, source?: string) {
  track("add_gear", source ? { kind, source } : { kind });
  if (!supabase) return;
  void supabase.rpc("record_gear_add", { kind, image }).then(
    () => undefined,
    () => undefined,
  );
}

let cached: Promise<TrendingEntry[]> | null = null;

/** The most-added gear over the last 30 days, loaded once per visit. Empty when unavailable. */
export function fetchTrending(): Promise<TrendingEntry[]> {
  if (!supabase) return Promise.resolve([]);
  cached ??= Promise.resolve(supabase.rpc("trending_gear", { days: 30, max_items: 30 })).then(
    ({ data, error }) => (error || !Array.isArray(data) ? [] : (data as TrendingEntry[])),
    () => [],
  );
  return cached;
}

let usage: Promise<Map<string, number>> | null = null;

/** How often each item was added in the last year (the 100 most added), keyed "kind:image". Empty when unavailable. */
export function fetchGearUsage(): Promise<Map<string, number>> {
  if (!supabase) return Promise.resolve(new Map());
  usage ??= Promise.resolve(supabase.rpc("trending_gear", { days: 365, max_items: 100 })).then(
    ({ data, error }) => new Map(error || !Array.isArray(data) ? [] : (data as TrendingEntry[]).map((e) => [`${e.kind}:${e.image}`, Number(e.adds)])),
    () => new Map(),
  );
  return usage;
}

export interface HotEntry {
  kind: Kind;
  image: string;
  /** Adds in the last 7 and 30 days. */
  week: number;
  month: number;
  /** Momentum: this week's share of the month, weighed so big numbers alone don't win. */
  score: number;
}

let hot: Promise<{ rising: HotEntry[]; monthTop: TrendingEntry[] }> | null = null;

/**
 * What Gear's Hot section ranks from: this week's 100 most added, each scored by momentum (this week's adds against
 * the month's), plus the month's 100 most added so the caller can set aside the everyday staples. Empty when
 * unavailable.
 */
export function fetchHot(): Promise<{ rising: HotEntry[]; monthTop: TrendingEntry[] }> {
  if (!supabase) return Promise.resolve({ rising: [], monthTop: [] });
  const get = (days: number) =>
    Promise.resolve(supabase!.rpc("trending_gear", { days, max_items: 100 })).then(
      ({ data, error }) => (error || !Array.isArray(data) ? [] : (data as TrendingEntry[])),
      () => [] as TrendingEntry[],
    );
  hot ??= Promise.all([get(7), get(30)]).then(([week, monthTop]) => {
    const key = (e: { kind: string; image: string }) => `${e.kind}:${e.image}`;
    const monthAdds = new Map(monthTop.map((e) => [key(e), Number(e.adds)]));
    const rising = week
      .filter((e) => Number(e.adds) >= 5)
      .map((e) => {
        const n7 = Number(e.adds);
        const n30 = Math.max(monthAdds.get(key(e)) ?? n7, n7);
        return { kind: e.kind, image: e.image, week: n7, month: n30, score: (n7 * n7) / n30 / Math.log(2 + n30) };
      })
      .sort((a, b) => b.score - a.score);
    return { rising, monthTop };
  });
  return hot;
}
