/**
 * Names for catalog photos in the catalog-sources bucket: `submissions/<user id>/<brand>-<name>.<ext>`, so a file
 * says what it is when you browse the bucket. Used by the Admin uploads (Queue, Add, Catalog) and players'
 * Suggest Gear photos alike.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

const MAX_BASE = 80;
/** Tries `name`, `name-2`, … this many times before giving up. */
const MAX_TRIES = 50;

/** Lowercase, hyphenated, accents dropped (é → e), apostrophes dropped (Devi Ever's → devi-evers). */
export function slugify(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/['’‘`]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** The file's extension from its type (the bucket takes PNG, JPEG and WebP). */
export function extensionFor(file: Blob): "png" | "webp" | "jpg" {
  return file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
}

/** `<brand>-<name>`, or "photo" when neither has a letter or number. */
export function sourceBase(brand: string, name: string): string {
  return slugify(`${brand} ${name}`).slice(0, MAX_BASE).replace(/-+$/, "") || "photo";
}

/** The path for try number `n` (1 is the plain name, 2 adds "-2", and so on). */
export function sourcePath(userId: string, base: string, ext: string, n = 1): string {
  return `submissions/${userId}/${base}${n > 1 ? `-${n}` : ""}.${ext}`;
}

const taken = (e: { message?: string; statusCode?: string | number } | null) =>
  !!e && (String(e.statusCode) === "409" || /already exists|duplicate/i.test(e.message ?? ""));

/**
 * Uploads a photo under its brand-name file name and returns the path. Never replaces a file: when the name is
 * taken (another photo of the same pedal), it adds -2, -3, … until one is free.
 */
export async function uploadNamedSource(db: SupabaseClient, file: Blob, userId: string, brand: string, name: string): Promise<string> {
  const base = sourceBase(brand, name);
  const ext = extensionFor(file);
  for (let n = 1; n <= MAX_TRIES; n++) {
    const path = sourcePath(userId, base, ext, n);
    const { error } = await db.storage.from("catalog-sources").upload(path, file, { contentType: file.type, upsert: false });
    if (!error) return path;
    if (!taken(error as { message?: string; statusCode?: string })) throw new Error(error.message);
  }
  throw new Error(`There are already ${MAX_TRIES} photos named ${base}. Please remove some first.`);
}
