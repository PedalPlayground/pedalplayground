// Shared helpers for reading the catalog source (JSON entries + original PNGs).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

export const KINDS = [
  { kind: "pedals", json: "pedals.json", dir: "pedals", canvasMax: 1200 },
  { kind: "pedalboards", json: "pedalboards.json", dir: "pedalboards", canvasMax: 2400 },
];

/** Defaults to the legacy layout (public/data + public/images); override with --src <dir>. */
export function parseArgs(argv) {
  const args = { src: path.resolve(here, "../../../public"), out: path.resolve(here, "../../public/catalog"), force: false, strict: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--src") args.src = path.resolve(argv[++i]);
    else if (a === "--out") args.out = path.resolve(argv[++i]);
    else if (a === "--force") args.force = true;
    else if (a === "--strict") args.strict = true;
    else if (a === "--update-baseline") args.updateBaseline = true;
  }
  return args;
}

/** Entries as written by contributors: { Brand, Name, Width, Height, Image } (inches). */
export function readEntries(src, k) {
  return JSON.parse(fs.readFileSync(path.join(src, "data", k.json), "utf8"));
}

export function imageDir(src, k) {
  return path.join(src, "images", k.dir);
}

/** Catalog entries sometimes omit the extension; try the name as written, then with .png. */
export function resolveImageFile(dir, image) {
  for (const candidate of [image, `${image}.png`]) {
    const p = path.join(dir, candidate);
    if (fs.existsSync(p) && fs.statSync(p).isFile()) return p;
  }
  return null;
}

/** Key used in documents and the manifest: the filename without its extension. */
export const imageKey = (image) => image.replace(/\.png$/i, "");

export const slugify = (s) =>
  s
    .toLowerCase()
    .replace(/\+/g, "-plus")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "item";
