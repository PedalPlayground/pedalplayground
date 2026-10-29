/**
 * Forgiving catalog search: ignores case, accents and punctuation, matches words in any order and by prefix,
 * and tolerates a typo or two in longer words. No dependencies; the index is built once per catalog.
 */

/** Lowercase, strip accents, and turn punctuation into spaces ("Big-Sky™ (MX)" -> "big sky mx"). */
export function normalize(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export interface Indexed<T> {
  item: T;
  /** Words of the brand and name together. */
  words: string[];
  /** The same text with no spaces, so "ds1" finds "DS-1" and "bigsky" finds "Big Sky". */
  joined: string;
  /** Normalized name and brand, for ranking: a match at the start of the name (or brand) beats one in the middle. */
  name: string;
  nameJoined: string;
  brand: string;
}

/** Nicknames people search by. Keys are normalized brand names. */
const BRAND_ALIASES: Record<string, string> = {
  "electro harmonix": "ehx",
  earthquaker: "eqd",
  "earthquaker devices": "eqd",
  "way huge": "wh",
  "tc electronic": "tce",
  digitech: "dt",
};

export function indexItem<T extends { brand: string; name: string }>(item: T): Indexed<T> {
  const brand = normalize(item.brand);
  const name = normalize(item.name);
  const words = `${brand} ${name}`.split(" ").filter(Boolean);
  const alias = BRAND_ALIASES[brand];
  if (alias) words.push(alias);
  return { item, words, joined: words.join(""), name, nameJoined: name.replace(/ /g, ""), brand };
}

/** Edit distance (with swapped neighbours counting as one edit), giving up once it passes `max`. */
function distance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev2: number[] = [];
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let d = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d = Math.min(d, prev2[j - 2] + 1);
      cur[j] = d;
      if (d < rowMin) rowMin = d;
    }
    if (rowMin > max) return max + 1;
    prev2 = prev;
    prev = cur;
  }
  return prev[b.length];
}

/** How many typos a query word of this length may have. Short words have to be spelled right. */
const allowedTypos = (len: number, multiWord: boolean) => (len >= 7 ? 2 : len >= 4 || (len === 3 && multiWord) ? 1 : 0);

/** Scores a query word against one catalog word; 0 means no match. */
function scoreAgainst(q: string, w: string, typos: number): number {
  if (w === q) return 10;
  if (w.startsWith(q)) return 7;
  if (q.length >= 3 && w.includes(q)) return 4;
  if (!typos) return 0;
  // Compare with the whole word, and with its start so a misspelled prefix still counts ("delya" -> "delay").
  const d = Math.min(distance(q, w, typos), w.length > q.length ? distance(q, w.slice(0, q.length), typos) : typos + 1);
  return d > typos ? 0 : d === 1 ? 3 : 2;
}

/**
 * Scores one query word against an item; 0 means no match. `cache` holds this query word's score against each
 * catalog word seen so far, since the same words ("delay", "boss") repeat across thousands of items.
 */
function scoreWord(q: string, entry: Indexed<unknown>, typos: number, cache: Map<string, number>): number {
  let best = 0;
  const { words } = entry;
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    // Two words run together count too: "ds1" is "DS-1", "bigsky" is "Big Sky".
    if (i + 1 < words.length && q.length > w.length && q.startsWith(w)) {
      const pair = w + words[i + 1];
      if (pair === q) return 10;
      if (pair.startsWith(q)) best = Math.max(best, 7);
    }
    let s = cache.get(w);
    if (s === undefined) cache.set(w, (s = scoreAgainst(q, w, typos)));
    if (s === 10) return 10;
    if (s > best) best = s;
  }
  if (best < 5 && q.length >= 2 && entry.joined.includes(q)) best = 5;
  return best;
}

export interface SearchResult<T> {
  items: T[];
  /** True when nothing matched every word, so `items` are close matches that missed a word or two. */
  partial: boolean;
}

/**
 * Filters and ranks `entries` for `query`. Every query word has to match somewhere; better matches rank higher,
 * and ties keep the catalog's order. If nothing matches every word of a longer query, falls back to items that
 * match most of them. An empty query returns everything as is.
 */
export function search<T>(entries: Indexed<T>[], query: string): SearchResult<T> {
  const q = normalize(query);
  if (!q) return { items: entries.map((e) => e.item), partial: false };
  const words = q.split(" ");
  const joinedQuery = q.replace(/ /g, "");
  const multiWord = words.length > 1;
  const full: { item: T; score: number; i: number }[] = [];
  const close: { item: T; score: number; i: number }[] = [];
  const minClose = Math.max(1, Math.ceil(words.length / 2));
  const maxMisses = words.length - minClose;
  const typos = words.map((w) => allowedTypos(w.length, multiWord));
  const caches = words.map(() => new Map<string, number>());
  entries.forEach((entry, i) => {
    let score = 0;
    let matched = 0;
    let misses = 0;
    for (let k = 0; k < words.length; k++) {
      const s = scoreWord(words[k], entry, typos[k], caches[k]);
      if (s) matched++;
      else if (++misses > maxMisses) return; // can't be even a close match
      score += s;
    }
    if (matched < words.length) {
      if (multiWord && matched >= minClose) close.push({ item: entry.item, score: matched * 100 + score, i });
      return;
    }
    if (entry.name.startsWith(q) || entry.nameJoined.startsWith(joinedQuery)) score += 6;
    else if (entry.name.includes(q)) score += 3;
    if (entry.brand.startsWith(q)) score += 5;
    if (multiWord && entry.joined.includes(joinedQuery)) score += 3;
    full.push({ item: entry.item, score, i });
  });
  const partial = full.length === 0 && close.length > 0;
  const hits = partial ? close : full;
  hits.sort((a, b) => b.score - a.score || a.i - b.i);
  return { items: hits.map((h) => h.item), partial };
}
