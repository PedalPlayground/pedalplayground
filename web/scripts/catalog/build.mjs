#!/usr/bin/env node
// Turns the contributor-facing catalog (JSON + original PNGs) into CDN-ready assets:
//   <out>/thumb/<slug>.<hash>.webp   small image for search results
//   <out>/img/<slug>.<hash>.webp     optimized image for the canvas
//   <out>/catalog.json               manifest the app loads
// Output names embed a hash of the source bytes, so they can be cached forever and
// unchanged images are skipped on rebuilds.
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { imageDir, imageKey, KINDS, parseArgs, readEntries, resolveImageFile, slugify } from "./source.mjs";

const THUMB_MAX = 128; // 2x the 64px shown in search
const args = parseArgs(process.argv);

for (const sub of ["thumb", "img"]) fs.mkdirSync(path.join(args.out, sub), { recursive: true });

const stats = { processed: 0, skipped: 0, missing: [], bytesIn: 0, bytesOut: 0 };
const keep = new Set();

async function processImage(file, key, canvasMax) {
  const buf = fs.readFileSync(file);
  const hash = crypto.createHash("sha1").update(buf).digest("hex").slice(0, 8);
  const base = `${slugify(key)}.${hash}.webp`;
  const thumb = `thumb/${base}`;
  const img = `img/${base}`;
  keep.add(thumb).add(img);
  stats.bytesIn += buf.length;

  const thumbPath = path.join(args.out, thumb);
  const imgPath = path.join(args.out, img);
  if (!args.force && fs.existsSync(thumbPath) && fs.existsSync(imgPath)) {
    stats.skipped++;
    stats.bytesOut += fs.statSync(thumbPath).size + fs.statSync(imgPath).size;
    return { thumb, img };
  }

  const base$ = () => sharp(buf).rotate().toColourspace("srgb");
  await base$().resize(THUMB_MAX, THUMB_MAX, { fit: "inside", withoutEnlargement: true }).webp({ quality: 75, alphaQuality: 90 }).toFile(thumbPath);
  await base$().resize(canvasMax, canvasMax, { fit: "inside", withoutEnlargement: true }).webp({ quality: 82, alphaQuality: 95 }).toFile(imgPath);
  stats.processed++;
  stats.bytesOut += fs.statSync(thumbPath).size + fs.statSync(imgPath).size;
  return { thumb, img };
}

/** Runs async jobs with bounded parallelism. */
async function pool(jobs, size) {
  let next = 0;
  await Promise.all(
    Array.from({ length: size }, async () => {
      while (next < jobs.length) await jobs[next++]();
    }),
  );
}

const manifest = { schema: 1, generatedAt: new Date().toISOString(), pedals: [], pedalboards: [], assets: { pedals: {}, pedalboards: {} } };

for (const k of KINDS) {
  const entries = readEntries(args.src, k);
  const dir = imageDir(args.src, k);
  const jobs = [];
  const seen = new Set();

  for (const e of entries) {
    const key = imageKey(e.Image);
    const file = resolveImageFile(dir, e.Image);
    if (!file) {
      stats.missing.push(`${k.kind}: ${e.Brand} ${e.Name} -> ${e.Image}`);
      continue;
    }
    manifest[k.kind].push({
      brand: e.Brand,
      name: e.Name,
      width: e.Width,
      height: e.Height,
      image: key,
      // Optional pedal specs; left out when the entry doesn't have them, to keep the manifest small.
      ...(e.Current !== undefined && { ma: e.Current }),
      ...(e.Voltage !== undefined && { voltage: e.Voltage }),
      ...(e.Type !== undefined && { type: e.Type }),
    });
    if (seen.has(key)) continue;
    seen.add(key);
    jobs.push(async () => {
      manifest.assets[k.kind][key] = await processImage(file, key, k.canvasMax);
      if ((stats.processed + stats.skipped) % 500 === 0) process.stdout.write(`  ${stats.processed + stats.skipped} images…\n`);
    });
  }
  console.log(`${k.kind}: ${entries.length} entries, ${jobs.length} unique images`);
  await pool(jobs, Math.max(2, os.cpus().length));
}

// Drop generated files nothing references any more.
for (const sub of ["thumb", "img"]) {
  for (const f of fs.readdirSync(path.join(args.out, sub))) {
    if (!keep.has(`${sub}/${f}`)) fs.unlinkSync(path.join(args.out, sub, f));
  }
}

fs.writeFileSync(path.join(args.out, "catalog.json"), JSON.stringify(manifest));

const mb = (n) => (n / 1048576).toFixed(1);
console.log(`\nprocessed ${stats.processed}, reused ${stats.skipped}`);
console.log(`source ${mb(stats.bytesIn)} MB -> output ${mb(stats.bytesOut)} MB`);
if (stats.missing.length) {
  console.warn(`\n${stats.missing.length} entries skipped (image file not found):\n  ${stats.missing.join("\n  ")}`);
  if (args.strict) process.exit(1);
}
