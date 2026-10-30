/**
 * Supabase calls for the editor page. Every write goes through what phase 1 set up: editors file a submission
 * (their own, or a player's) and approve it with approve_catalog_submission(), which records who approved it.
 * Adding a pedal directly or fixing a live one is the same thing with the queue skipped.
 */
import type { Fields } from "./editorChecks";
import { supabase } from "./supabase";

export interface Submission {
  id: string;
  kind: "pedal" | "pedalboard";
  target_key: string | null;
  brand: string;
  name: string;
  width_in: number;
  height_in: number;
  current_ma: number | null;
  voltage: string | null;
  type: string | null;
  source_path: string | null;
  note: string | null;
  status: "pending" | "needs_changes" | "approved" | "rejected";
  editor_note: string | null;
  submitted_by: string;
  created_at: string;
}

export interface Item {
  id: number;
  kind: "pedal" | "pedalboard";
  key: string;
  brand: string;
  name: string;
  width_in: number;
  height_in: number;
  current_ma: number | null;
  voltage: string | null;
  type: string | null;
  source_path: string | null;
  thumb_path: string | null;
  img_path: string | null;
  needs_render: boolean;
  status: "live" | "retired";
  added_on: string;
  updated_at: string;
}

function db() {
  if (!supabase) throw new Error("Supabase isn't configured for this build.");
  return supabase;
}

const fail = (error: { message: string } | null) => {
  if (error) throw new Error(error.message);
};

/** Public URL of a built file (thumb/img) in the catalog-public bucket. */
export function publicUrl(path: string): string {
  return db().storage.from("catalog-public").getPublicUrl(path).data.publicUrl;
}

/** A short-lived link to a private source image. */
export async function sourceUrl(path: string): Promise<string> {
  const { data, error } = await db().storage.from("catalog-sources").createSignedUrl(path, 3600);
  fail(error);
  return data!.signedUrl;
}

export async function isEditor(): Promise<boolean> {
  const { data, error } = await db().rpc("is_catalog_editor");
  fail(error);
  return data === true;
}

export const fieldsFrom = (r: Submission | Item): Fields => ({
  kind: r.kind,
  brand: r.brand,
  name: r.name,
  width: Number(r.width_in),
  height: Number(r.height_in),
  ma: r.current_ma ?? undefined,
  voltage: r.voltage ?? undefined,
  type: r.type ?? undefined,
});

const columns = (f: Fields) => ({
  kind: f.kind,
  brand: f.brand.trim(),
  name: f.name.trim(),
  width_in: f.width,
  height_in: f.height,
  current_ma: f.ma ?? null,
  voltage: f.voltage || null,
  type: f.kind === "pedal" ? f.type || null : null,
});

/** Submissions waiting for an editor, oldest first. */
export async function listQueue(): Promise<Submission[]> {
  const { data, error } = await db()
    .from("catalog_submissions")
    .select("*")
    .in("status", ["pending", "needs_changes"])
    .order("created_at");
  fail(error);
  return (data ?? []) as Submission[];
}

/** Uploads an image to the editor's own folder in catalog-sources and returns its path. */
export async function uploadSource(file: File, userId: string): Promise<string> {
  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const base = file.name.replace(/\.[^.]+$/, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "image";
  const path = `submissions/${userId}/${Date.now()}-${base.slice(0, 60)}.${ext}`;
  const { error } = await db().storage.from("catalog-sources").upload(path, file, { contentType: file.type, upsert: false });
  fail(error);
  return path;
}

/** Saves an editor's fixes to a submission before deciding on it. */
export async function updateSubmission(id: string, f: Fields, sourcePath?: string): Promise<void> {
  const { error } = await db()
    .from("catalog_submissions")
    .update({ ...columns(f), ...(sourcePath ? { source_path: sourcePath } : {}) })
    .eq("id", id);
  fail(error);
}

/** Approves a submission and returns the item's key. */
export async function approve(id: string): Promise<string> {
  const { data, error } = await db().rpc("approve_catalog_submission", { submission_id: id });
  fail(error);
  return data as string;
}

export async function review(id: string, decision: "needs_changes" | "rejected", note: string): Promise<void> {
  const { error } = await db().rpc("review_catalog_submission", { submission_id: id, decision, note });
  fail(error);
}

/**
 * Adds an item (no targetKey) or changes a live one (targetKey), skipping the queue: files the change as the
 * editor's own submission and approves it, so it's recorded like any other approval. Returns the item's key.
 */
export async function saveDirect(f: Fields, opts: { targetKey?: string; sourcePath?: string; note?: string }): Promise<string> {
  const { data, error } = await db()
    .from("catalog_submissions")
    .insert({ ...columns(f), target_key: opts.targetKey ?? null, source_path: opts.sourcePath ?? null, note: opts.note ?? null })
    .select("id")
    .single();
  fail(error);
  return approve((data as { id: string }).id);
}

export async function setStatus(kind: Item["kind"], key: string, status: Item["status"]): Promise<void> {
  const { error } = await db().rpc("set_catalog_item_status", { p_kind: kind, p_key: key, p_status: status });
  fail(error);
}

/** Catalog items whose brand or name contain every word typed, newest changes first when nothing is typed. */
export async function searchItems(text: string, opts: { kind?: Item["kind"]; retired?: boolean } = {}): Promise<Item[]> {
  let q = db().from("catalog_items").select("*");
  for (const word of text.trim().split(/\s+/).filter(Boolean).slice(0, 5)) {
    // PostgREST's or() syntax treats , ( ) as separators, so they can't appear in a search word.
    const w = word.replace(/[,()%*\\]/g, "");
    if (w) q = q.or(`brand.ilike.*${w}*,name.ilike.*${w}*`);
  }
  if (opts.kind) q = q.eq("kind", opts.kind);
  if (!opts.retired) q = q.eq("status", "live");
  const { data, error } = await q.order(text.trim() ? "brand" : "updated_at", { ascending: !!text.trim() }).limit(60);
  fail(error);
  return (data ?? []) as Item[];
}

/** How many approved items are still waiting for their images to be built. */
export async function pendingBuilds(): Promise<number> {
  const { count, error } = await db().from("catalog_items").select("id", { count: "exact", head: true }).eq("needs_render", true).not("source_path", "is", null);
  fail(error);
  return count ?? 0;
}

/**
 * Starts the Catalog publish run, which builds new images and rewrites catalog.json (live within a few minutes).
 * Returns null when it started, or why it didn't.
 */
export async function publish(): Promise<string | null> {
  const { error } = await db().functions.invoke("catalog-publish");
  if (!error) return null;
  const ctx = (error as { context?: Response }).context;
  if (ctx && typeof ctx.json === "function") {
    try {
      const body = (await ctx.json()) as { error?: string };
      if (body?.error) return body.error;
    } catch {
      // fall through to the generic message
    }
  }
  return error.message || "Couldn't start the publish.";
}
