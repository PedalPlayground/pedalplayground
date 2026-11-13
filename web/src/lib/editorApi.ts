/**
 * Supabase calls for the editor page. Every write goes through what phase 1 set up: editors file a submission
 * (their own, or a player's) and approve it with approve_catalog_submission(), which records who approved it.
 * Adding a pedal directly or fixing a live one is the same thing with the queue skipped.
 */
import type { Post } from "./announcements";
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
  extra_types?: string[];
  source_path: string | null;
  note: string | null;
  /** "resolved": dealt with some other way (fixed by hand, already listed), so it leaves the queue. */
  status: "pending" | "needs_changes" | "approved" | "rejected" | "resolved";
  editor_note: string | null;
  submitted_by: string;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  /** The item it became, once approved. */
  item_key?: string | null;
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
  extra_types?: string[];
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

/** Admins (Trav, so far): they change permissions and post What's New. False until the admins migration is run. */
export async function isAdmin(): Promise<boolean> {
  const { data, error } = await db().rpc("is_admin");
  if (error) return false;
  return data === true;
}

export interface EditorAccount {
  user_id: string;
  username: string | null;
  added_at: string;
  admin: boolean;
}

/** Admins: everyone who can edit (empty until the admins migration is run). */
export async function listEditors(): Promise<EditorAccount[]> {
  const { data, error } = await db().rpc("list_editors");
  if (error && /list_editors|schema cache|does not exist/i.test(error.message)) return [];
  fail(error);
  return (data ?? []) as EditorAccount[];
}

/** Admins: makes someone an editor, or stops them being one. */
export async function setEditor(userId: string, make: boolean): Promise<void> {
  const { error } = await db().rpc("set_editor", { target: userId, make });
  if (error && /set_editor|schema cache/i.test(error.message)) throw new Error("Roles aren't set up yet. Run the admins migration first.");
  fail(error);
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
  extraTypes: r.extra_types,
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
  // Only sent once the column exists (fieldsFrom fills it in from the row); boards never have extras.
  ...(f.extraTypes !== undefined && { extra_types: f.kind === "pedal" && f.type ? [...new Set(f.extraTypes)].filter((t) => t !== f.type) : [] }),
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

/** Short-lived links to several private source images at once, by path (paths that fail are left out). */
export async function sourceUrls(paths: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const unique = [...new Set(paths)];
  if (!unique.length) return out;
  const { data, error } = await db().storage.from("catalog-sources").createSignedUrls(unique, 3600);
  fail(error);
  for (const d of data ?? []) if (d.path && d.signedUrl && !d.error) out.set(d.path, d.signedUrl);
  return out;
}

/** Usernames by user id (people without one are left out). */
export async function usernames(ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const unique = [...new Set(ids)];
  if (!unique.length) return out;
  const { data, error } = await db().from("profiles").select("user_id,username").in("user_id", unique);
  // Profiles not set up: show no names rather than failing the queue.
  if (error) return out;
  for (const r of (data ?? []) as { user_id: string; username: string }[]) out.set(r.user_id, r.username);
  return out;
}

/** Everything one person has submitted: totals by status, and their latest submissions, newest first. */
export interface SubmitterHistory {
  counts: Record<Submission["status"], number>;
  total: number;
  recent: Submission[];
}

export async function submitterHistory(userId: string, limit = 50): Promise<SubmitterHistory> {
  const statuses: Submission["status"][] = ["pending", "needs_changes", "approved", "rejected", "resolved"];
  const [recent, ...counts] = await Promise.all([
    db()
      .from("catalog_submissions")
      .select("id,kind,target_key,brand,name,status,editor_note,submitted_by,reviewed_by,reviewed_at,item_key,created_at")
      .eq("submitted_by", userId)
      .order("created_at", { ascending: false })
      .limit(limit),
    ...statuses.map((st) =>
      db().from("catalog_submissions").select("id", { count: "exact", head: true }).eq("submitted_by", userId).eq("status", st),
    ),
  ]);
  fail(recent.error);
  for (const c of counts) fail(c.error);
  const byStatus = Object.fromEntries(statuses.map((st, i) => [st, counts[i].count ?? 0])) as SubmitterHistory["counts"];
  return {
    counts: byStatus,
    total: statuses.reduce((n, st) => n + byStatus[st], 0),
    recent: (recent.data ?? []) as Submission[],
  };
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

export async function review(id: string, decision: "needs_changes" | "rejected" | "resolved", note: string): Promise<void> {
  const { error } = await db().rpc("review_catalog_submission", { submission_id: id, decision, note });
  if (error && decision === "resolved" && /decision must be/i.test(error.message)) throw new Error("Resolve isn't set up yet. Run the submission_resolved migration first.");
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

/** What the Catalog tab lists. `type` "none" means pedals with no type. */
export interface CatalogFilter {
  kind: Item["kind"] | null;
  type: string | null;
  brand: string | null;
  text: string;
  status: Item["status"] | "all";
}

/**
 * Catalog items for the Catalog tab's filters, a page at a time: A–Z by brand and name, or most recently changed
 * first when nothing narrows the list.
 */
export async function listCatalog(f: CatalogFilter, page: number, pageSize = 100): Promise<Item[]> {
  let q = db().from("catalog_items").select("*");
  if (f.kind) q = q.eq("kind", f.kind);
  if (f.status !== "all") q = q.eq("status", f.status);
  if (f.brand) q = q.eq("brand", f.brand);
  // Quoted, since types have spaces and slashes ("Amp / Preamp").
  if (f.type === "none") q = q.eq("kind", "pedal").is("type", null);
  else if (f.type) q = q.or(`type.eq."${f.type}",extra_types.cs.{"${f.type}"}`);
  for (const word of f.text.trim().split(/\s+/).filter(Boolean).slice(0, 5)) {
    // PostgREST's or() syntax treats , ( ) as separators, so they can't appear in a search word.
    const w = word.replace(/[,()%*\\]/g, "");
    if (w) q = q.or(`brand.ilike.*${w}*,name.ilike.*${w}*`);
  }
  const narrowed = f.kind || f.type || f.brand || f.text.trim();
  q = narrowed ? q.order("brand").order("name") : q.order("updated_at", { ascending: false });
  const { data, error } = await q.range(page * pageSize, page * pageSize + pageSize - 1);
  fail(error);
  return (data ?? []) as Item[];
}

/** One catalog item by kind and key (for links like /editor/#catalog?kind=pedal&key=boss-ds1). */
export async function getItem(kind: Item["kind"], key: string): Promise<Item | null> {
  const { data, error } = await db().from("catalog_items").select("*").eq("kind", kind).eq("key", key).maybeSingle();
  fail(error);
  return (data as Item | null) ?? null;
}

/** How many approved items are still waiting for their images to be built. */
export async function pendingBuilds(): Promise<number> {
  const { count, error } = await db().from("catalog_items").select("id", { count: "exact", head: true }).eq("needs_render", true).not("source_path", "is", null);
  fail(error);
  return count ?? 0;
}

/**
 * Starts the Catalog publish run, which builds new images and rewrites catalog.json (live within a few minutes).
 * Says why it didn't start, or where to watch it on GitHub (the run's page, or the workflow's runs when the run
 * couldn't be found yet).
 */
export async function publish(): Promise<{ error: string } | { runUrl?: string }> {
  const { data, error } = await db().functions.invoke<{ run_url?: string }>("catalog-publish");
  if (!error) return { runUrl: typeof data?.run_url === "string" && data.run_url.startsWith("https://github.com/") ? data.run_url : undefined };
  const ctx = (error as { context?: Response }).context;
  if (ctx && typeof ctx.json === "function") {
    try {
      const body = (await ctx.json()) as { error?: string };
      if (body?.error) return { error: body.error };
    } catch {
      // fall through to the generic message
    }
  }
  return { error: error.message || "Couldn't start the publish." };
}

// ---- What's New posts (announcements table) ----

/** The editor form's values; empty strings mean "not set". `published_at` is a datetime-local value. */
export interface PostDraft {
  title: string;
  body: string;
  link_url: string;
  link_label: string;
  published_at: string;
}

/** All posts, scheduled ones included (editors can see them), newest first. */
export async function listPosts(): Promise<Post[]> {
  const { data, error } = await db()
    .from("announcements")
    .select("id,title,body,link_url,link_label,published_at")
    .order("published_at", { ascending: false })
    .limit(100);
  fail(error);
  return (data ?? []) as Post[];
}

/** Creates a post (id null) or updates one. */
export async function savePost(id: string | null, d: PostDraft): Promise<void> {
  const row = {
    title: d.title.trim(),
    body: d.body.trim(),
    link_url: d.link_url.trim() || null,
    link_label: d.link_label.trim() || null,
    ...(d.published_at ? { published_at: new Date(d.published_at).toISOString() } : id ? {} : { published_at: new Date().toISOString() }),
  };
  const { error } = id ? await db().from("announcements").update(row).eq("id", id) : await db().from("announcements").insert(row);
  fail(error);
}

export async function deletePost(id: string): Promise<void> {
  const { error } = await db().from("announcements").delete().eq("id", id);
  fail(error);
}

// Bug reports ------------------------------------------------------------------------------------------------------

export interface BugReport {
  id: string;
  details: string;
  page: string | null;
  user_agent: string | null;
  status: "open" | "closed";
  created_at: string;
  reporter_id: string;
}

/** Open bug reports, newest first (empty, with no error, until the bug_reports migration is run). */
export async function listBugReports(): Promise<BugReport[]> {
  const { data, error } = await db().from("bug_reports").select("*").eq("status", "open").order("created_at", { ascending: false }).limit(200);
  if (error && (error.code === "42P01" || /schema cache|does not exist/i.test(error.message))) return [];
  fail(error);
  return (data ?? []) as BugReport[];
}

export async function closeBugReport(id: string): Promise<void> {
  const { data: u } = await db().auth.getUser();
  const { error } = await db().from("bug_reports").update({ status: "closed", closed_by: u.user?.id ?? null, closed_at: new Date().toISOString() }).eq("id", id);
  fail(error);
}

// Pedal types (admins only; the database checks too) ---------------------------------------------------------------

/** The pedal types in order, or null when the pedal_types migration hasn't been run yet. */
export async function listPedalTypes(): Promise<string[] | null> {
  const { data, error } = await db().from("pedal_types").select("name").order("position").order("name");
  if (error && (error.code === "42P01" || error.code === "PGRST205" || /schema cache|does not exist/i.test(error.message))) return null;
  fail(error);
  return (data ?? []).map((r: { name: string }) => r.name);
}

export async function addPedalType(name: string): Promise<void> {
  const { error } = await db().rpc("add_pedal_type", { type_name: name });
  fail(error);
}

/** Renames a type on the list and on every catalog item that has it. Returns how many items changed. */
export async function renamePedalType(from: string, to: string): Promise<number> {
  const { data, error } = await db().rpc("rename_pedal_type", { old_name: from, new_name: to });
  fail(error);
  return Number(data ?? 0);
}

/** Removes a type; its pedals move to `moveTo`, or just lose it when that's null. Returns how many items changed. */
export async function removePedalType(name: string, moveTo: string | null): Promise<number> {
  const { data, error } = await db().rpc("remove_pedal_type", { type_name: name, move_to: moveTo });
  fail(error);
  return Number(data ?? 0);
}

/** Saves the order: every type, first to last. */
export async function reorderPedalTypes(names: string[]): Promise<void> {
  const { error } = await db().rpc("reorder_pedal_types", { names });
  fail(error);
}
