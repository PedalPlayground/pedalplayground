import type { PlaygroundDocument } from "./types";
import { importAny } from "./importers";
import { supabase } from "./supabase";

export interface PlaygroundSummary {
  id: string;
  name: string;
  updated_at: string;
  slug: string | null;
  is_public: boolean;
  thumbnail: string | null;
}

const db = () => {
  if (!supabase) throw new Error("Cloud is not configured.");
  return supabase;
};

const UNIQUE_VIOLATION = "23505";
// PostgREST / Postgres codes for a column that hasn't been migrated yet.
const isMissingColumn = (code?: string) => code === "42703" || code === "PGRST204";

/** Set once we learn the `thumbnail` migration hasn't been run, so we stop sending it. */
let thumbnailSupported = true;

export class DuplicateNameError extends Error {}

/** The plan allows no more playgrounds (database answered 402 / playground_limit_reached). */
export class PlaygroundLimitError extends Error {
  constructor() {
    super("Your plan has reached its playground limit.");
  }
}

const isLimitError = (e: { code?: string; message?: string }) => e.code === "PT402" || e.message === "playground_limit_reached";

/**
 * The signed-in user's own playgrounds. The owner filter is required: the share feature lets everyone read
 * public playgrounds, so an unfiltered query would also return other people's shared boards.
 */
export async function listPlaygrounds(ownerId: string): Promise<PlaygroundSummary[]> {
  const cols = "id,name,updated_at,slug,is_public";
  if (thumbnailSupported) {
    const res = await db()
      .from("playgrounds")
      .select(`${cols},thumbnail`)
      .eq("owner_user_id", ownerId)
      .order("updated_at", { ascending: false });
    if (!res.error) return res.data as PlaygroundSummary[];
    if (!isMissingColumn(res.error.code)) throw res.error;
    thumbnailSupported = false;
  }
  const res = await db().from("playgrounds").select(cols).eq("owner_user_id", ownerId).order("updated_at", { ascending: false });
  if (res.error) throw res.error;
  return (res.data as Omit<PlaygroundSummary, "thumbnail">[]).map((p) => ({ ...p, thumbnail: null }));
}

export async function fetchLatestDocument(playgroundId: string): Promise<PlaygroundDocument> {
  const { data, error } = await db()
    .from("playground_versions")
    .select("document")
    .eq("playground_id", playgroundId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("That playground has no saved versions.");
  return importAny(data.document);
}

/** Inserts a new playground, suffixing the name if the owner already has one by that name. */
export async function createPlayground(
  ownerId: string,
  name: string,
  forkedFromId: string | null,
  thumbnail: string | null,
): Promise<{ id: string; name: string }> {
  for (let attempt = 1; attempt <= 20; attempt++) {
    const candidate = attempt === 1 ? name : `${name} (${attempt})`;
    const row: Record<string, unknown> = { owner_user_id: ownerId, name: candidate, forked_from_playground_id: forkedFromId };
    if (thumbnailSupported && thumbnail) row.thumbnail = thumbnail;
    const { data, error } = await db().from("playgrounds").insert(row).select("id,name").single();
    if (!error) return data;
    if (isMissingColumn(error.code) && "thumbnail" in row) {
      thumbnailSupported = false;
      attempt--;
      continue;
    }
    if (isLimitError(error)) throw new PlaygroundLimitError();
    if (error.code !== UNIQUE_VIOLATION) throw error;
  }
  throw new Error("Could not find an unused playground name.");
}

export async function touchPlayground(id: string, name: string, thumbnail: string | null) {
  const patch: Record<string, unknown> = { name, updated_at: new Date().toISOString() };
  if (thumbnailSupported) patch.thumbnail = thumbnail; // null clears it when the canvas was emptied
  let { error } = await db().from("playgrounds").update(patch).eq("id", id);
  if (error && isMissingColumn(error.code)) {
    thumbnailSupported = false;
    delete patch.thumbnail;
    ({ error } = await db().from("playgrounds").update(patch).eq("id", id));
  }
  if (error?.code === UNIQUE_VIOLATION) throw new DuplicateNameError("You already have a playground with that name.");
  if (error) throw error;
}

/** Renames a playground without touching its content or thumbnail (for ones that aren't open). */
export async function renamePlayground(id: string, name: string) {
  const { error } = await db().from("playgrounds").update({ name }).eq("id", id);
  if (error?.code === UNIQUE_VIOLATION) throw new DuplicateNameError("You already have a playground with that name.");
  if (error) throw error;
}

export async function insertVersion(playgroundId: string, doc: PlaygroundDocument) {
  const { error } = await db().from("playground_versions").insert({ playground_id: playgroundId, document: doc });
  if (error) throw error;
}

export async function deletePlayground(id: string) {
  // Row-level security makes a delete of someone else's row succeed with zero rows, so check the count.
  const { data, error } = await db().from("playgrounds").delete().eq("id", id).select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("That playground couldn't be deleted. It may belong to another account, or it's already gone.");
}

const SLUG_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
const newSlug = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => SLUG_ALPHABET[b % SLUG_ALPHABET.length]).join("");

/** Marks a playground public, creating its slug on first share. */
export async function sharePlayground(id: string): Promise<string> {
  const cur = await db().from("playgrounds").select("slug").eq("id", id).single();
  if (cur.error) throw cur.error;
  const slug = cur.data.slug ?? newSlug();
  const { error } = await db().from("playgrounds").update({ slug, is_public: true }).eq("id", id);
  if (error) throw error;
  return slug;
}

export async function unsharePlayground(id: string) {
  const { error } = await db().from("playgrounds").update({ is_public: false }).eq("id", id);
  if (error) throw error;
}

export async function fetchShared(slug: string): Promise<{ id: string; name: string; doc: PlaygroundDocument } | null> {
  const pg = await db().from("playgrounds").select("id,name").eq("slug", slug).eq("is_public", true).maybeSingle();
  if (pg.error) throw pg.error;
  if (!pg.data) return null;
  return { ...pg.data, doc: await fetchLatestDocument(pg.data.id) };
}

export const shareUrl = (slug: string) => `${window.location.origin}${window.location.pathname}?p=${encodeURIComponent(slug)}`;
