import type { Kind } from "./catalog";
import { supabase } from "./supabase";

export interface TrendingEntry {
  kind: Kind;
  image: string;
  adds: number;
}

/** Records that a catalog item was added to a playground. Fire and forget: failures never reach the user. */
export function recordGearAdd(kind: Kind, image: string) {
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
