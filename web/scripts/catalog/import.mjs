#!/usr/bin/env node
// One-time import of the repo catalog (public/data + images) into Supabase.
//
//   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/catalog/import.mjs [--limit N] [--refresh] [--dry-run]
//     [--src <public dir>] [--app <sharper originals dir>] [--report <file.json>]
//
// For each entry it picks the best image (the larger original in app/images/pedals when it's the same photo),
// stores it in catalog-sources as a lossless WebP no bigger than the canvas size, and adds a catalog_items row
// marked needs_render. The publish script then builds the files and catalog.json.
//
// Safe to rerun: items already in Supabase are skipped, so a run that stops partway picks up where it left off.
// --refresh re-imports existing items too, overwriting their fields; only use it before the site switches over,
// since after that editors own the data.
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { CANVAS_MAX } from "./render.mjs";
import { addedDatesInOrder, imageDir, imageKey, KINDS, readEntries, resolveImageFile, slugify } from "./source.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const SOURCES = "catalog-sources";
const PAGE = 1000;
const MAX_SOURCE_BYTES = 9.5 * 1024 * 1024; // the bucket allows 10 MB
const DB_KIND = { pedals: "pedal", pedalboards: "pedalboard" };

/** Same aspect within this fraction, and a photo difference under this (0-255 scale), counts as the same photo. */
export const SAME_ASPECT = 0.03;
export const SAME_PHOTO = 12;

/**
 * Assigns each entry its catalog key. Keys must be unique, but a few repo entries share one image file. The first
 * entry keeps the image's key (that's what saved boards point at); later ones get a key from their brand and name
 * and reuse the same image. Pure, for tests.
 *
 * entries: [{ Brand, Name, Width, Height, Image }], dates: [{ key, date }] in the same order (may be empty).
 * Returns [{ key, imageKey, file, brand, name, width_in, height_in, added_on }].
 */
export function planImport(entries, dates = []) {
  const reserved = new Set(entries.map((e) => imageKey(e.Image)));
  const used = new Set();
  const fresh = (base) => {
    let key = base;
    for (let n = 2; used.has(key) || reserved.has(key); n++) key = `${base}-${n}`;
    return key;
  };
  return entries.map((e, i) => {
    const img = imageKey(e.Image);
    const key = used.has(img) ? fresh(slugify(`${e.Brand} ${e.Name}`)) : img;
    used.add(key);
    const date = dates[i]?.key === img ? dates[i].date : null;
    return { key, imageKey: img, file: e.Image, brand: e.Brand, name: e.Name, width_in: e.Width, height_in: e.Height, added_on: date };
  });
}

/** Where an image's source goes in catalog-sources. The hash keeps keys that slugify alike apart. */
export function sourcePath(kind, key) {
  const h = crypto.createHash("sha1").update(key).digest("hex").slice(0, 6);
  return `import/${kind}/${slugify(key)}-${h}.webp`;
}

/** A tiny greyscale thumbnail on white, for telling whether two files are the same photo. */
async function signature(file) {
  return sharp(file).flatten({ background: "#ffffff" }).resize(24, 24, { fit: "fill" }).greyscale().raw().toBuffer();
}

/**
 * Picks the sharper of the repo image and the app/ original. The original wins only when it's bigger, has the same
 * shape, and looks like the same photo. Returns { file, from, reason? }.
 */
export async function chooseSource(publicFile, appFile) {
  if (!appFile || !fs.existsSync(appFile)) return { file: publicFile, from: "public" };
  const [a, b] = await Promise.all([sharp(publicFile).metadata(), sharp(appFile).metadata()]);
  if (Math.max(b.width, b.height) <= Math.max(a.width, a.height)) return { file: publicFile, from: "public" };
  if (Math.abs(b.width / b.height / (a.width / a.height) - 1) > SAME_ASPECT) {
    return { file: publicFile, from: "public", reason: "app/ original has a different shape" };
  }
  const [sa, sb] = await Promise.all([signature(publicFile), signature(appFile)]);
  let diff = 0;
  for (let i = 0; i < sa.length; i++) diff += Math.abs(sa[i] - sb[i]);
  diff /= sa.length;
  if (diff > SAME_PHOTO) return { file: publicFile, from: "public", reason: `app/ original looks different (${diff.toFixed(1)})` };
  return { file: appFile, from: "app" };
}

/** The stored source: upright, sRGB, no bigger than the canvas size, lossless WebP (near-lossless if too big). */
export async function prepareSource(file, canvasMax) {
  const base = () =>
    sharp(file).rotate().toColourspace("srgb").resize(canvasMax, canvasMax, { fit: "inside", withoutEnlargement: true });
  const lossless = await base().webp({ lossless: true, effort: 2 }).toBuffer();
  if (lossless.length <= MAX_SOURCE_BYTES) return lossless;
  return base().webp({ quality: 95, alphaQuality: 100 }).toBuffer();
}

async function existingKeys(db, kind) {
  const keys = new Set();
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db.from("catalog_items").select("key").eq("kind", kind).order("id").range(from, from + PAGE - 1);
    if (error) throw error;
    for (const r of data) keys.add(r.key);
    if (data.length < PAGE) return keys;
  }
}

/** Runs async jobs with bounded parallelism; collects failures instead of stopping. */
async function pool(items, size, fn) {
  const failures = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: size }, async () => {
      while (next < items.length) {
        const item = items[next++];
        try {
          await fn(item);
        } catch (e) {
          failures.push({ item, error: e.message ?? String(e) });
        }
      }
    }),
  );
  return failures;
}

/**
 * db: a supabase-js client with the service role. Returns a report of what it did.
 * src: the folder holding data/ and images/ (the repo's public/). app: the folder of sharper pedal originals.
 */
export async function importCatalog(
  db,
  { src, app = null, limit = Infinity, refresh = false, dryRun = false, log = console, concurrency = 4 } = {},
) {
  const report = {
    imported: { pedal: 0, pedalboard: 0 },
    skippedExisting: 0,
    fromApp: 0,
    fromPublic: 0,
    keptRepoImage: [], // app/ original rejected, with why
    renamed: [], // entries that shared an image and got their own key
    missingImage: [], // no image file: imported without one, left out of the catalog
    duplicateNames: [], // same brand and name more than once
    failed: [],
  };
  let budget = limit;

  for (const k of KINDS) {
    const kind = DB_KIND[k.kind];
    const entries = readEntries(src, k);
    const plan = planImport(entries, addedDatesInOrder(src, k));
    const existing = await existingKeys(db, kind);

    const seenNames = new Map();
    for (const p of plan) {
      const n = `${p.brand}\u0000${p.name}`.toLowerCase();
      if (seenNames.has(n)) report.duplicateNames.push({ kind, keys: [seenNames.get(n), p.key], brand: p.brand, name: p.name });
      else seenNames.set(n, p.key);
      if (p.key !== p.imageKey) report.renamed.push({ kind, key: p.key, image: p.imageKey, brand: p.brand, name: p.name });
    }

    let todo = plan.filter((p) => refresh || !existing.has(p.key));
    report.skippedExisting += plan.length - todo.length;
    todo = todo.slice(0, Math.max(0, budget));
    budget -= todo.length;
    if (!todo.length) {
      log.log(`${k.kind}: nothing to import`);
      continue;
    }

    // One stored source per image, shared by every entry that uses it.
    const groups = new Map();
    for (const p of todo) groups.set(p.imageKey, [...(groups.get(p.imageKey) ?? []), p]);
    log.log(`${k.kind}: importing ${todo.length} entries (${groups.size} images)`);

    const dir = imageDir(src, k);
    const rows = [];
    let done = 0;
    const failures = await pool([...groups.entries()], concurrency, async ([img, items]) => {
      const publicFile = resolveImageFile(dir, items[0].file);
      let source_path = null;
      if (!publicFile) {
        for (const p of items) report.missingImage.push({ kind, key: p.key, brand: p.brand, name: p.name });
      } else {
        const appFile = app && kind === "pedal" ? path.join(app, path.basename(publicFile)) : null;
        const choice = await chooseSource(publicFile, appFile);
        if (choice.from === "app") report.fromApp++;
        else report.fromPublic++;
        if (choice.reason) report.keptRepoImage.push({ kind, image: img, reason: choice.reason });
        source_path = sourcePath(kind, img);
        if (!dryRun) {
          const body = await prepareSource(choice.file, CANVAS_MAX[kind]);
          const { error } = await db.storage
            .from(SOURCES)
            .upload(source_path, body, { contentType: "image/webp", cacheControl: "3600", upsert: true });
          if (error) throw new Error(`upload ${source_path}: ${error.message}`);
        }
      }
      for (const p of items) {
        rows.push({
          kind,
          key: p.key,
          brand: p.brand,
          name: p.name,
          width_in: p.width_in,
          height_in: p.height_in,
          source_path,
          needs_render: source_path !== null,
          ...(p.added_on && { added_on: p.added_on }),
        });
      }
      if (++done % 250 === 0) log.log(`  ${done}/${groups.size} images…`);
    });
    for (const f of failures) {
      report.failed.push({ kind, image: f.item[0], error: f.error });
      log.error(`failed ${kind} ${f.item[0]}: ${f.error}`);
    }

    // Rows after their sources, so a row never points at a file that isn't there.
    if (!dryRun) {
      for (let i = 0; i < rows.length; i += 500) {
        const { error } = await db
          .from("catalog_items")
          .upsert(rows.slice(i, i + 500), { onConflict: "kind,key", ignoreDuplicates: !refresh });
        if (error) throw new Error(`insert rows: ${error.message}`);
      }
    }
    report.imported[kind] += rows.length;
  }
  return report;
}

/** A short plain-text summary of a report, for logs and the Actions run page. */
export function summarize(report, { dryRun = false } = {}) {
  const lines = [
    `${dryRun ? "Would import" : "Imported"} ${report.imported.pedal} pedals and ${report.imported.pedalboard} pedalboards` +
      ` (${report.skippedExisting} already there).`,
    `Images: ${report.fromApp} from the sharper app/ originals, ${report.fromPublic} from the repo images.`,
  ];
  const list = (title, items, fmt) => {
    if (!items.length) return;
    lines.push("", `${title} (${items.length}):`, ...items.slice(0, 50).map((x) => `  ${fmt(x)}`));
    if (items.length > 50) lines.push(`  …and ${items.length - 50} more (see the report file)`);
  };
  list("Failed, rerun to retry", report.failed, (x) => `${x.kind} ${x.image}: ${x.error}`);
  list("No image file, so not in the catalog", report.missingImage, (x) => `${x.kind} ${x.key} (${x.brand} ${x.name})`);
  list("Shared an image, given their own key", report.renamed, (x) => `${x.kind} ${x.key} uses ${x.image} (${x.brand} ${x.name})`);
  list("Same brand and name twice", report.duplicateNames, (x) => `${x.kind} ${x.keys.join(" and ")} (${x.brand} ${x.name})`);
  list("Kept the repo image", report.keptRepoImage, (x) => `${x.kind} ${x.image}: ${x.reason}`);
  return lines.join("\n");
}

// Command line: only when run directly, not when imported by tests.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const argv = process.argv.slice(2);
  const opt = (name, fallback) => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : fallback;
  };
  const env = (name) => {
    const v = process.env[name];
    if (!v) {
      console.error(`Set ${name}.`);
      process.exit(2);
    }
    return v;
  };
  const dryRun = argv.includes("--dry-run");
  const appDir = path.resolve(opt("--app", path.resolve(here, "../../../app/images/pedals")));
  const db = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
  const report = await importCatalog(db, {
    src: path.resolve(opt("--src", path.resolve(here, "../../../public"))),
    app: fs.existsSync(appDir) ? appDir : null,
    limit: opt("--limit") ? Number(opt("--limit")) : Infinity,
    refresh: argv.includes("--refresh"),
    dryRun,
    concurrency: Math.max(2, os.cpus().length),
  });
  const reportFile = opt("--report");
  if (reportFile) fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
  console.log(`\n${summarize(report, { dryRun })}`);
  if (report.failed.length) process.exit(1);
}
