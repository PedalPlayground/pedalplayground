/**
 * The "What's new" feed behind the header bell: posts editors write in /editor/ (the announcements table), plus
 * "N new pedals added" posts built here from the catalog's added dates, so those cost nothing to run.
 *
 * Posts load once per visit and are kept in sessionStorage for the rest of it. Which posts a browser has seen is
 * kept in localStorage, so guests get the unread dot too and nothing is written to the database.
 */
import type { Manifest } from "./catalog";
import type { CatalogItem } from "./types";
import { supabase } from "./supabase";

export interface Post {
  id: string;
  title: string;
  body: string;
  link_url: string | null;
  link_label: string | null;
  published_at: string;
}

export type FeedEntry =
  | { kind: "post"; id: string; date: string; post: Post }
  | { kind: "pedals"; id: string; date: string; count: number; names: string[] };

/** How many entries the panel shows. */
export const FEED_LIMIT = 20;
/** Weeks of "new pedals" entries. */
const PEDAL_WEEKS = 6;
/** Entries older than this never light the dot, so a first visit doesn't flag the whole history. */
const UNREAD_DAYS = 21;

const CACHE_KEY = "pp:news";
const CACHE_MS = 30 * 60_000;
const SEEN_KEY = "pp:news-seen";
const SEEN_MAX = 100;

/** Published posts, newest first. One request per visit; failures give an empty list. */
export async function fetchPosts(): Promise<Post[]> {
  try {
    const cached = JSON.parse(sessionStorage.getItem(CACHE_KEY) ?? "null") as { at: number; posts: Post[] } | null;
    if (cached && Date.now() - cached.at < CACHE_MS) return cached.posts;
  } catch {
    /* storage unavailable or bad JSON */
  }
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("announcements")
    .select("id,title,body,link_url,link_label,published_at")
    .lte("published_at", new Date().toISOString())
    .order("published_at", { ascending: false })
    .limit(FEED_LIMIT);
  if (error) return [];
  const posts = (data ?? []) as Post[];
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), posts }));
  } catch {
    /* storage unavailable */
  }
  return posts;
}

/** Drops the cached posts (the editor calls this after a change so its own tab shows it). */
export function clearPostCache() {
  try {
    sessionStorage.removeItem(CACHE_KEY);
  } catch {
    /* storage unavailable */
  }
}

/** Monday of the week holding a "YYYY-MM-DD" day, as "YYYY-MM-DD" (UTC). */
export function weekStart(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

/**
 * One entry per recent week that added pedals. The id includes the count, so pedals added later in the same week
 * make it unread again. The entry is dated by the newest pedal in it.
 */
export function pedalEntries(pedals: CatalogItem[], now = new Date()): FeedEntry[] {
  const cutoff = new Date(now);
  cutoff.setUTCDate(cutoff.getUTCDate() - PEDAL_WEEKS * 7);
  const since = weekStart(cutoff.toISOString().slice(0, 10));
  const weeks = new Map<string, CatalogItem[]>();
  for (const p of pedals) {
    if (!p.added || p.added < since) continue;
    const w = weekStart(p.added);
    (weeks.get(w) ?? weeks.set(w, []).get(w)!).push(p);
  }
  return [...weeks].map(([week, items]) => {
    items.sort((a, b) => b.added!.localeCompare(a.added!) || a.brand.localeCompare(b.brand) || a.name.localeCompare(b.name));
    return {
      kind: "pedals" as const,
      id: `pedals-${week}-${items.length}`,
      date: `${items[0].added!}T12:00:00Z`,
      count: items.length,
      names: items.slice(0, 3).map((p) => `${p.brand} ${p.name}`),
    };
  });
}

/** Editor posts and pedal weeks together, newest first. */
export function buildFeed(posts: Post[], manifest: Manifest | null, now = new Date()): FeedEntry[] {
  const entries: FeedEntry[] = [
    ...posts.map((post) => ({ kind: "post" as const, id: `post-${post.id}`, date: post.published_at, post })),
    ...(manifest ? pedalEntries(manifest.pedals, now) : []),
  ];
  return entries.sort((a, b) => b.date.localeCompare(a.date)).slice(0, FEED_LIMIT);
}

export function readSeen(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

export function markSeen(entries: FeedEntry[]) {
  const ids = [...new Set([...entries.map((e) => e.id), ...readSeen()])].slice(0, SEEN_MAX);
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(ids));
  } catch {
    /* storage unavailable */
  }
}

export function isUnread(e: FeedEntry, seen: Set<string>, now = new Date()): boolean {
  return !seen.has(e.id) && now.getTime() - new Date(e.date).getTime() < UNREAD_DAYS * 86_400_000;
}
