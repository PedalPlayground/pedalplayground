// Turns one source image into the two files the app loads: a small thumbnail for search results and an
// optimized canvas image. Shared by build.mjs (repo catalog) and publish.mjs (Supabase catalog).
import crypto from "node:crypto";
import sharp from "sharp";
import { slugify } from "./source.mjs";

export const THUMB_MAX = 128; // 2x the 64px shown in search
export const CANVAS_MAX = { pedal: 1200, pedalboard: 2400 };

/**
 * File names for a source: `thumb/<slug>.<hash>.webp` and `img/<slug>.<hash>.webp`. The hash is of the source
 * bytes, so a changed image gets new names and old URLs can be cached forever.
 */
export function assetNames(buf, key) {
  const hash = crypto.createHash("sha1").update(buf).digest("hex").slice(0, 8);
  const base = `${slugify(key)}.${hash}.webp`;
  return { hash, thumb: `thumb/${base}`, img: `img/${base}` };
}

/** Encodes both files. Returns WebP buffers. */
export async function renderAssets(buf, canvasMax) {
  const base$ = () => sharp(buf).rotate().toColourspace("srgb");
  const [thumb, img] = await Promise.all([
    base$().resize(THUMB_MAX, THUMB_MAX, { fit: "inside", withoutEnlargement: true }).webp({ quality: 75, alphaQuality: 90 }).toBuffer(),
    base$().resize(canvasMax, canvasMax, { fit: "inside", withoutEnlargement: true }).webp({ quality: 82, alphaQuality: 95 }).toBuffer(),
  ]);
  return { thumb, img };
}
