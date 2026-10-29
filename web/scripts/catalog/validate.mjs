#!/usr/bin/env node
// Checks contributor changes to the catalog (JSON entries + source PNGs).
//
// Errors fail the run unless they're already listed in baseline.json (known problems that
// predate these checks); warnings never fail it. Run with --update-baseline to accept the
// current set of errors (do that only when fixing/triaging legacy data, not for new pedals).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { imageDir, KINDS, parseArgs, readEntries, resolveImageFile } from "./source.mjs";

const args = parseArgs(process.argv);
const baselinePath = path.join(path.dirname(fileURLToPath(import.meta.url)), "baseline.json");
const baseline = new Set(fs.existsSync(baselinePath) ? JSON.parse(fs.readFileSync(baselinePath, "utf8")) : []);

const MAX_BYTES = 3 * 1024 * 1024;
const MIN_PX_PER_INCH = 60;
const MAX_DIM_IN = { pedals: 25, pedalboards: 60 };
const FILE_NAME = /^[a-z0-9]+(-[a-z0-9]+)*\.png$/;
// Optional pedal specs. Keep these lists in step with web/src/lib/specs.ts.
const PEDAL_TYPES = ["Boost", "Overdrive", "Distortion", "Fuzz", "Compressor", "EQ", "Modulation", "Delay", "Reverb", "Pitch", "Filter / Wah", "Looper", "Multi-Effect", "Amp / Preamp", "Tuner", "Volume / Expression", "Noise Gate", "Utility", "Other"];
const VOLTAGES = ["9V DC", "12V DC", "18V DC", "24V DC", "9V AC", "12V AC", "5V USB"];

const issues = []; // { level, id, message }
const error = (code, subject, message) => issues.push({ level: "error", id: `${code}:${subject}`, message });
const warn = (code, subject, message) => issues.push({ level: "warn", id: `${code}:${subject}`, message });

for (const k of KINDS) {
  const entries = readEntries(args.src, k);
  const dir = imageDir(args.src, k);
  const referenced = new Set();
  const names = new Map();

  for (const [n, e] of entries.entries()) {
    const where = `${k.kind}[${n}] ${e?.Brand ?? "?"} ${e?.Name ?? "?"}`;
    const subject = `${k.kind}:${e?.Brand}|${e?.Name}`;

    if (!e || typeof e.Brand !== "string" || !e.Brand.trim() || typeof e.Name !== "string" || !e.Name.trim()) {
      error("entry-shape", `${k.kind}:${n}`, `${where}: Brand and Name must be non-empty strings`);
      continue;
    }
    if (typeof e.Width !== "number" || typeof e.Height !== "number" || !(e.Width > 0) || !(e.Height > 0)) {
      error("dims", subject, `${where}: Width and Height must be positive numbers (inches)`);
    } else if (e.Width > MAX_DIM_IN[k.kind] || e.Height > MAX_DIM_IN[k.kind]) {
      warn("dims-large", subject, `${where}: ${e.Width}×${e.Height} in looks too large; check the units are inches`);
    }
    if (typeof e.Image !== "string" || !e.Image) {
      error("image-field", subject, `${where}: missing Image`);
      continue;
    }

    if (e.Current !== undefined && !(Number.isInteger(e.Current) && e.Current > 0 && e.Current <= 5000)) {
      error("spec-current", subject, `${where}: Current must be a whole number of milliamps, like 100`);
    }
    if (e.Voltage !== undefined && !VOLTAGES.includes(e.Voltage)) {
      error("spec-voltage", subject, `${where}: Voltage must be one of ${VOLTAGES.join(", ")}`);
    }
    if (e.Type !== undefined && !PEDAL_TYPES.includes(e.Type)) {
      error("spec-type", subject, `${where}: Type must be one of ${PEDAL_TYPES.join(", ")}`);
    }

    const dupKey = `${e.Brand}|${e.Name}`.toLowerCase();
    if (names.has(dupKey)) error("duplicate-entry", subject, `${where}: duplicate of entry ${names.get(dupKey)}`);
    else names.set(dupKey, n);

    referenced.add(e.Image);
    if (!FILE_NAME.test(e.Image)) {
      error("image-name", `${k.kind}:${e.Image}`, `${where}: image "${e.Image}" should be lowercase letters, digits and hyphens, ending in .png`);
    }
  }

  // Per-image checks (once per file).
  for (const image of referenced) {
    const file = resolveImageFile(dir, image);
    const subject = `${k.kind}:${image}`;
    if (!file) {
      error("image-missing", subject, `${k.kind}: image "${image}" is listed in ${k.json} but not found in images/${k.dir}/`);
      continue;
    }
    const size = fs.statSync(file).size;
    if (size > MAX_BYTES) error("image-bytes", subject, `${image}: ${(size / 1048576).toFixed(1)} MB exceeds 3 MB`);

    let meta;
    try {
      meta = await sharp(file).metadata();
    } catch {
      error("image-unreadable", subject, `${image}: not a readable image`);
      continue;
    }
    if (meta.format !== "png") error("image-format", subject, `${image}: must be a PNG (found ${meta.format})`);
    if (!meta.hasAlpha) warn("image-alpha", subject, `${image}: no transparency; product shots should have a transparent background`);

    for (const e of entries.filter((x) => x?.Image === image)) {
      if (!(e.Width > 0) || !(e.Height > 0)) continue;
      const ppi = meta.width / e.Width;
      if (ppi < MIN_PX_PER_INCH) {
        error("image-resolution", subject, `${image}: only ${Math.round(ppi)} px/inch (minimum ${MIN_PX_PER_INCH}); use a larger source image`);
      }
      const drift = Math.abs(meta.width / meta.height / (e.Width / e.Height) - 1);
      if (drift > 0.15) error("image-aspect", subject, `${image}: image is ${meta.width}×${meta.height} px but entry is ${e.Width}×${e.Height} in (${Math.round(drift * 100)}% off)`);
      else if (drift > 0.05) warn("image-aspect", subject, `${image}: aspect ratio is ${Math.round(drift * 100)}% off from the entry's dimensions`);
      break; // entries sharing an image are checked against the first
    }
  }

  const stray = fs.readdirSync(dir).filter((f) => !referenced.has(f) && !referenced.has(f.replace(/\.png$/i, "")));
  for (const f of stray) warn("orphan-file", `${k.kind}:${f}`, `images/${k.dir}/${f} isn't referenced by ${k.json}`);
}

const errors = issues.filter((i) => i.level === "error");
const newErrors = errors.filter((i) => !baseline.has(i.id));
const warnings = issues.filter((i) => i.level === "warn");

if (args.updateBaseline) {
  fs.writeFileSync(baselinePath, JSON.stringify(errors.map((i) => i.id).sort(), null, 2) + "\n");
  console.log(`Baseline updated: ${errors.length} known errors.`);
  process.exit(0);
}

for (const i of newErrors) console.error(`error   ${i.message}`);
for (const i of warnings.slice(0, 30)) console.warn(`warning ${i.message}`);
if (warnings.length > 30) console.warn(`… and ${warnings.length - 30} more warnings`);

console.log(
  `\n${newErrors.length} new error(s), ${errors.length - newErrors.length} known (baseline), ${warnings.length} warning(s).`,
);
process.exit(newErrors.length ? 1 : 0);
