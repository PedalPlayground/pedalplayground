import { supabase } from "./supabase";
import type { PlaygroundType } from "./cloud";

export interface GalleryBoard {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  playground_type: PlaygroundType | null;
  thumbnail: string | null;
  updated_at: string;
  username: string | null;
  pedal_count: number;
}

export const GALLERY_PAGE_SIZE = 24;

const db = () => {
  if (!supabase) throw new Error("Cloud is not configured.");
  return supabase;
};

/** One page of gallery boards, newest first. Pass the last board of the previous page to continue. */
export async function fetchGalleryBoards(opts: { type: PlaygroundType | null; search: string; after?: GalleryBoard }): Promise<GalleryBoard[]> {
  const { data, error } = await db().rpc("gallery_boards", {
    board_type: opts.type,
    search: opts.search.trim() || null,
    before_updated: opts.after?.updated_at ?? null,
    before_id: opts.after?.id ?? null,
    page_size: GALLERY_PAGE_SIZE,
  });
  if (error) throw error;
  return data as GalleryBoard[];
}

/** Editors only: hides a board from the gallery (its share link keeps working), or shows it again. */
export async function setGalleryHidden(id: string, hidden: boolean) {
  const { error } = await db().rpc("gallery_set_hidden", { board: id, hidden });
  if (error) throw error;
}

/** The playground opens a shared board view-only, with a way to make your own copy. */
export const boardUrl = (slug: string) => `/?p=${encodeURIComponent(slug)}`;
