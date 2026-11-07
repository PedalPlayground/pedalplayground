#!/usr/bin/env node
/**
 * Guesses a pedal's type from words in its name ("Super Overdrive" -> Overdrive), for pedals with no type yet.
 *
 *   node scripts/catalog/infer-types.mjs [catalog.json] [--sql out.sql]
 *
 * Prints how many pedals each rule matched, with examples, and how many names suggest more than one type. With --sql, also writes an update for each match that
 * only fills a type that's still empty, so it's safe to run again and never overwrites an editor's choice.
 */
import { readFileSync, writeFileSync } from "node:fs";

/**
 * First match wins, so the order matters: a "Fuzz Octave" is a Fuzz, a "Volume Boost" is a Volume pedal, and a
 * "Reverb Delay" is filed under Reverb. Types are the same list as src/lib/specs.ts.
 */
export const RULES = [
  // Test gear whose names say "phase" isn't a phaser.
  ["Utility", /\bphase\s*(inverter|analy[sz]er)\b/],
  ["Tuner", /\btuner\b/],
  ["Looper", /\bloop(er|\s+station)\b/],
  ["Volume / Expression", /\b(volume|expression|exp pedal)\b/],
  ["Noise Gate", /\b(noise\s*gate|gate|noise\s*(suppressor|reduction|killer)|decimator)\b/],
  ["Multi-Effect", /\b(multi[\s-]?effects?|multi[\s-]?fx|effects processor)\b/],
  ["Amp / Preamp", /\b(pre[\s-]?amp|amp\s*sim(ulator)?|cab(inet)?\s*sim(ulator)?|amp\s*in\s*a\s*box)\b/],
  ["Compressor", /\b(compressor|comp|sustainer|limiter)\b/],
  ["Fuzz", /\b(fuzz|muff\b|tone\s*bender)/],
  ["Distortion", /\b(distortion|dist)\b/],
  ["Overdrive", /\b(over[\s-]?drive|od|drive|driver|screamer)\b/],
  ["Boost", /\b(boost|booster)\b/],
  ["Reverb", /\b(reverb|verb)\b/],
  ["Delay", /\b(delay|echo)\b/],
  ["Modulation", /\b(chorus|flanger?|phaser|phase(?!\s*(inverter|analy))|tremolo|trem|vibrato|vibe|rotary|leslie|modulation|modulator|ring\s*mod)\b/],
  ["Pitch", /\b(octave|octaver|harmonizer|harmonist|pitch|whammy)\b/],
  ["Filter / Wah", /\b(wah|cry\s*baby|envelope|filter|auto[\s-]?wah)\b/],
  ["EQ", /\b(eq|equalizer|equaliser)\b/],
  ["Utility", /\b(di|di\s*box|buffer|a\/b|aby|splitter|switcher|junction|power\s*supply|mixer|blender)\b/],
];

/** Every type a pedal's name suggests, main (first matching rule) first: "Tremolo/Reverb" -> Reverb, Modulation. */
export function inferTypes(name) {
  const n = name.toLowerCase();
  const found = [];
  for (const [type, re] of RULES) if (re.test(n) && !found.includes(type)) found.push(type);
  return found;
}

/** The main type a pedal's name suggests, or null. */
export const inferType = (name) => inferTypes(name)[0] ?? null;

const sqlText = (s) => `'${s.replace(/'/g, "''")}'`;

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const sqlAt = args.indexOf("--sql");
  const sqlOut = sqlAt >= 0 ? args[sqlAt + 1] : null;
  const file = args.find((a, i) => !a.startsWith("--") && i !== sqlAt + 1) ?? "public/catalog/catalog.json";
  const { pedals } = JSON.parse(readFileSync(file, "utf8"));
  const open = pedals.filter((p) => !p.type);
  const byType = new Map();
  for (const p of open) {
    const t = inferType(p.name);
    if (!t) continue;
    if (!byType.has(t)) byType.set(t, []);
    byType.get(t).push(p);
  }
  const matched = [...byType.values()].reduce((n, l) => n + l.length, 0);
  const several = open.filter((p) => inferTypes(p.name).length > 1);
  console.log(`${matched} of ${open.length} pedals without a type get one from their name; ${several.length} suggest more than one.\n`);
  for (const type of new Set(RULES.map(([t]) => t))) {
    const list = byType.get(type) ?? [];
    console.log(`${type}: ${list.length}`);
    for (const p of list.slice(0, 6)) console.log(`    ${p.brand} ${p.name}`);
  }
  if (sqlOut) {
    const lines = ["-- Pedal types guessed from names by scripts/catalog/infer-types.mjs. Only fills empty types.", "begin;"];
    for (const [type, list] of byType) {
      const keys = list.map((p) => sqlText(p.image)).join(", ");
      lines.push(
        `update public.catalog_items set type = ${sqlText(type)} where kind = 'pedal' and type is null and key in (${keys});`,
      );
    }
    lines.push("commit;", "");
    writeFileSync(sqlOut, lines.join("\n"));
    console.log(`\nWrote ${sqlOut}`);
  }
}
