#!/usr/bin/env node
// Compares the Supabase catalog with the one the site serves today, before the site switches over.
//
//   node scripts/catalog/compare.mjs --old https://pedalplayground.com/catalog/ --new <supabase public catalog url>/
//     [--sample 60] [--summary <file.md>]
//
// Checks, in order of importance:
//   1. Every image key today's catalog can draw is still drawable (saved boards depend on these).
//   2. Every entry in search today is still in search, with the same brand, name and size.
//   3. A sample of images: the new one is the same picture and at least as sharp.
// Exits 1 if 1 or 2 finds a problem.
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import sharp from "sharp";

const LISTS = ["pedals", "pedalboards"];
const SAME_PICTURE = 12; // mean greyscale difference on a 24x24 thumbnail, 0-255
const SIZE_TOLERANCE = 0.001; // inches; the database keeps three decimals

const entryId = (e) => `${e.brand}\u0000${e.name}`.toLowerCase();

/**
 * Compares two manifests. Pure, for tests. Returns { lostImages, missingEntries, changedEntries, newEntries,
 * counts }. An entry that moved to its own key (it used to share another entry's image) counts as the same entry.
 */
export function compareManifests(oldM, newM) {
  const out = { lostImages: [], missingEntries: [], changedEntries: [], newEntries: [], counts: {} };
  for (const list of LISTS) {
    const oldAssets = oldM.assets?.[list] ?? {};
    const newAssets = newM.assets?.[list] ?? {};
    for (const key of Object.keys(oldAssets)) if (!newAssets[key]) out.lostImages.push({ list, key });

    const pool = new Map();
    for (const e of newM[list] ?? []) pool.set(entryId(e), [...(pool.get(entryId(e)) ?? []), e]);
    for (const e of oldM[list] ?? []) {
      const candidates = pool.get(entryId(e)) ?? [];
      const i = Math.max(0, candidates.findIndex((c) => c.image === e.image));
      const match = candidates.splice(i, 1)[0];
      if (!match) {
        out.missingEntries.push({ list, image: e.image, brand: e.brand, name: e.name });
        continue;
      }
      const diffs = [];
      if (Math.abs(match.width - e.width) > SIZE_TOLERANCE || Math.abs(match.height - e.height) > SIZE_TOLERANCE) {
        diffs.push(`size ${e.width}x${e.height} -> ${match.width}x${match.height}`);
      }
      if (match.image !== e.image) diffs.push(`key ${e.image} -> ${match.image}`);
      for (const f of ["ma", "voltage", "type"]) if (match[f] !== e[f]) diffs.push(`${f} ${e[f]} -> ${match[f]}`);
      if (diffs.length) out.changedEntries.push({ list, image: e.image, name: `${e.brand} ${e.name}`, diffs });
    }
    for (const left of pool.values()) for (const e of left) out.newEntries.push({ list, image: e.image, name: `${e.brand} ${e.name}` });
    out.counts[list] = {
      old: oldM[list]?.length ?? 0,
      new: newM[list]?.length ?? 0,
      oldImages: Object.keys(oldAssets).length,
      newImages: Object.keys(newAssets).length,
    };
  }
  return out;
}

async function fetchBuffer(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} for ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

async function pictureCheck(oldBuf, newBuf) {
  const sig = (b) => sharp(b).flatten({ background: "#ffffff" }).resize(24, 24, { fit: "fill" }).greyscale().raw().toBuffer();
  const [a, b, ma, mb] = await Promise.all([sig(oldBuf), sig(newBuf), sharp(oldBuf).metadata(), sharp(newBuf).metadata()]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff += Math.abs(a[i] - b[i]);
  return { diff: diff / a.length, oldEdge: Math.max(ma.width, ma.height), newEdge: Math.max(mb.width, mb.height) };
}

/** Pulls a spread-out sample of image keys present in both catalogs and checks each picture. */
export async function sampleImages(oldM, newM, oldBase, newBase, size) {
  const keys = [];
  for (const list of LISTS) {
    for (const key of Object.keys(oldM.assets[list] ?? {})) if (newM.assets[list]?.[key]) keys.push({ list, key });
  }
  const step = Math.max(1, Math.floor(keys.length / Math.max(1, size)));
  const picked = keys.filter((_, i) => i % step === 0).slice(0, size);
  const results = [];
  for (const { list, key } of picked) {
    try {
      const [o, n] = await Promise.all([
        fetchBuffer(oldBase + oldM.assets[list][key].img),
        fetchBuffer(newBase + newM.assets[list][key].img),
      ]);
      results.push({ list, key, ...(await pictureCheck(o, n)) });
    } catch (e) {
      results.push({ list, key, error: e.message });
    }
  }
  return results;
}

export function report(cmp, samples) {
  const lines = ["## Catalog comparison", ""];
  for (const [list, c] of Object.entries(cmp.counts)) {
    lines.push(`- ${list}: ${c.old} in search today, ${c.new} in the new catalog; ${c.oldImages} images today, ${c.newImages} new`);
  }
  const section = (title, items, fmt, max = 40) => {
    lines.push("", `### ${title}: ${items.length}`);
    for (const x of items.slice(0, max)) lines.push(`- ${fmt(x)}`);
    if (items.length > max) lines.push(`- …and ${items.length - max} more`);
  };
  section("Images saved boards use that the new catalog can't draw", cmp.lostImages, (x) => `${x.list} ${x.key}`);
  section("Entries in search today that are missing", cmp.missingEntries, (x) => `${x.list} ${x.image} (${x.brand} ${x.name})`);
  section("Entries that changed", cmp.changedEntries, (x) => `${x.list} ${x.name}: ${x.diffs.join(", ")}`);
  section("Entries only in the new catalog", cmp.newEntries, (x) => `${x.list} ${x.image} (${x.name})`, 20);
  if (samples) {
    const ok = samples.filter((s) => !s.error);
    const different = ok.filter((s) => s.diff > SAME_PICTURE);
    const softer = ok.filter((s) => s.newEdge < s.oldEdge);
    const sharper = ok.filter((s) => s.newEdge > s.oldEdge);
    lines.push("", `### Image sample: ${samples.length}`);
    lines.push(`- ${sharper.length} sharper, ${ok.length - sharper.length - softer.length} the same size, ${softer.length} smaller`);
    for (const s of different) lines.push(`- looks different: ${s.list} ${s.key} (${s.diff.toFixed(1)})`);
    for (const s of softer) lines.push(`- smaller: ${s.list} ${s.key} (${s.oldEdge}px -> ${s.newEdge}px)`);
    for (const s of samples.filter((x) => x.error)) lines.push(`- couldn't check ${s.list} ${s.key}: ${s.error}`);
  }
  return lines.join("\n");
}

// Command line: only when run directly, not when imported by tests.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const argv = process.argv.slice(2);
  const opt = (name, fallback) => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : fallback;
  };
  const withSlash = (u) => (u.endsWith("/") ? u : `${u}/`);
  const oldBase = withSlash(opt("--old", "https://pedalplayground.com/catalog/"));
  const newBase = opt("--new");
  if (!newBase) {
    console.error("Pass --new <base URL of the new catalog>.");
    process.exit(2);
  }
  const bust = `?t=${Date.now()}`; // catalog.json is cached for a few minutes
  const [oldM, newM] = await Promise.all(
    [oldBase, withSlash(newBase)].map(async (b) => JSON.parse((await fetchBuffer(`${b}catalog.json${bust}`)).toString())),
  );
  const cmp = compareManifests(oldM, newM);
  const sample = Number(opt("--sample", "60"));
  const samples = sample > 0 ? await sampleImages(oldM, newM, oldBase, withSlash(newBase), sample) : null;
  const text = report(cmp, samples);
  console.log(text);
  const summary = opt("--summary");
  if (summary) fs.appendFileSync(summary, `${text}\n`);
  if (cmp.lostImages.length || cmp.missingEntries.length) process.exit(1);
}
