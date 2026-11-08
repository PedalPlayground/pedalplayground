/**
 * Suggestions from players for the catalog: a new pedal or pedalboard with its photo. They land as pending
 * catalog_submissions in the Admin queue (see docs/catalog-backend.md); an editor checks and approves them.
 * At most 10 open suggestions per player (a database rule).
 */
import type { Fields } from "./editorChecks";
import { supabase } from "./supabase";

function db() {
  if (!supabase) throw new Error("Accounts aren't set up on this build.");
  return supabase;
}

/**
 * Uploads the photo (if any) to the player's own folder, then files the suggestion. With `targetKey` it's a
 * correction to that catalog item (a photo is optional then); without, a new item (a photo is required).
 */
export async function submitSuggestion(f: Fields, photo: File | null, userId: string, note: string, targetKey?: string): Promise<void> {
  let path: string | null = null;
  if (photo) {
    const ext = photo.type === "image/png" ? "png" : photo.type === "image/webp" ? "webp" : "jpg";
    const base = `${f.brand}-${f.name}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "photo";
    path = `submissions/${userId}/${Date.now()}-${base}.${ext}`;
    const up = await db().storage.from("catalog-sources").upload(path, photo, { contentType: photo.type, upsert: false });
    if (up.error) throw new Error(up.error.message);
  }
  const pedal = f.kind === "pedal";
  const { error } = await db()
    .from("catalog_submissions")
    .insert({
      kind: f.kind,
      brand: f.brand.trim(),
      name: f.name.trim(),
      width_in: f.width,
      height_in: f.height,
      current_ma: pedal ? (f.ma ?? null) : null,
      voltage: pedal ? f.voltage || null : null,
      type: pedal ? f.type || null : null,
      extra_types: pedal && f.type ? [...new Set(f.extraTypes ?? [])].filter((t) => t !== f.type) : [],
      target_key: targetKey ?? null,
      source_path: path,
      note: note.trim() || null,
    });
  if (error) {
    // Don't leave the photo behind when the row didn't save.
    if (path) await db().storage.from("catalog-sources").remove([path]);
    if (/at most|limit/i.test(error.message)) throw new Error("You have 10 suggestions waiting already. Please wait until some are reviewed.");
    throw new Error(error.message);
  }
}

/** A bug report, with the page it came from and the browser (see the bug_reports migration). */
export async function reportBug(details: string): Promise<void> {
  const { error } = await db()
    .from("bug_reports")
    .insert({ details: details.trim(), page: window.location.href.slice(0, 500), user_agent: navigator.userAgent.slice(0, 500) });
  if (!error) return;
  if (error.code === "42P01" || /bug_reports/.test(error.message) && /exist|schema cache/i.test(error.message)) throw new Error("Bug reports aren't set up yet. Please try again later.");
  if (error.code === "42501") throw new Error("You've sent 10 reports today. Thanks! Please try again tomorrow.");
  throw new Error(error.message);
}
