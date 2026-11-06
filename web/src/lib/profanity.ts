/**
 * Keeps common curse words and slurs out of what people name things (usernames, board names and descriptions,
 * comments, custom gear). Leetspeak ("sh1t") counts too. Short words that hide inside ordinary ones (cock, dick, ass)
 * only count on their own, so "Cocktail" or "Bassist" are fine. Usernames are also checked by the database
 * (username_offensive in supabase/migrations/20261106000000_moderation.sql); keep the two lists in step.
 */

const ANYWHERE = /(fuck|fuk|shit|cunt|nigg|fagg|bitch|whore|slut|twat|wank|retard|asshole|pussy|motherf|dickhead|cocksuck|rapist|nazi)/;
const ALONE = new Set(["fag", "fags", "dick", "dicks", "cock", "cocks", "ass", "tit", "tits", "prick", "piss", "cum", "jizz", "kys"]);

const LEET: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", $: "s", "!": "i" };
const unleet = (s: string) => s.toLowerCase().replace(/[013457@$!]/g, (c) => LEET[c]);

/** The message to show under a field that has a curse word in it. */
export const PROFANITY_MESSAGE = "Please keep it family-friendly.";

/**
 * True when the text has a curse word, after taking out `allowed` phrases first: names of real pedals, some of which
 * have curse words in them.
 */
export function hasProfanity(text: string, allowed: string[] = []): boolean {
  let s = text.toLowerCase();
  for (const phrase of allowed) if (phrase && s.includes(phrase)) s = s.split(phrase).join(" ");
  s = unleet(s);
  if (ANYWHERE.test(s.replace(/[^a-z]+/g, " ")) || ANYWHERE.test(s.replace(/[^a-z]/g, ""))) return true;
  return s.split(/[^a-z]+/).some((w) => ALONE.has(w));
}

/** Usernames (no spaces, so only "-" and "_" split words), same rules as the database's. */
export function usernameOffensive(name: string): boolean {
  const s = unleet(name);
  return ANYWHERE.test(s) || s.split(/[-_]+/).some((w) => ALONE.has(w));
}

/** Catalog names (lowercased) that would trip the filter, so mentioning those pedals is fine. */
export function allowedPedalNames(items: { brand: string; name: string }[]): string[] {
  const out = new Set<string>();
  for (const i of items) {
    for (const phrase of [`${i.brand} ${i.name}`, i.name]) {
      const p = phrase.toLowerCase().trim();
      if (p && hasProfanity(p)) out.add(p);
    }
  }
  return [...out].sort((a, b) => b.length - a.length);
}
