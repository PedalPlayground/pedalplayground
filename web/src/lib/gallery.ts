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
  like_count: number;
  /** Whether the signed-in viewer likes it. */
  liked: boolean;
  /** Missing until the board_comments migration is run. */
  comment_count?: number;
}

export type GallerySort = "new" | "liked";

export const GALLERY_PAGE_SIZE = 24;

/** Boards owned by test accounts show on beta and local copies, never on the live site (see the test_accounts migration). */
const SHOW_TEST_BOARDS = !["pedalplayground.com", "www.pedalplayground.com"].includes(window.location.hostname);

const db = () => {
  if (!supabase) throw new Error("Cloud is not configured.");
  return supabase;
};

/** One page of gallery boards. `offset` is how many boards are already showing. */
export async function fetchGalleryBoards(opts: { type: PlaygroundType | null; search: string; sort: GallerySort; offset: number; limit?: number }): Promise<GalleryBoard[]> {
  const { data, error } = await db().rpc("gallery_boards", {
    board_type: opts.type,
    search: opts.search.trim() || null,
    sort: opts.sort,
    page_offset: opts.offset,
    page_size: opts.limit ?? GALLERY_PAGE_SIZE,
    // Only sent when true, so the live site keeps working with a database that doesn't know the argument yet.
    ...(SHOW_TEST_BOARDS ? { include_test: true } : {}),
  });
  if (error) throw error;
  return data as GalleryBoard[];
}

/** Likes or unlikes a board as the signed-in user. Returns the board's new like count. */
export async function setGalleryLike(id: string, liked: boolean): Promise<number> {
  const { data, error } = await db().rpc("gallery_set_like", { board: id, liked });
  if (error) throw error;
  return data as number;
}

/** Editors only: hides a board from the gallery (its share link keeps working), or shows it again. */
export async function setGalleryHidden(id: string, hidden: boolean) {
  const { error } = await db().rpc("gallery_set_hidden", { board: id, hidden });
  if (error) throw error;
}

/** The playground opens a shared board view-only, with a way to make your own copy. */
export const boardUrl = (slug: string) => `/?p=${encodeURIComponent(slug)}`;

/** Where you were in the gallery when you opened a board: filters, how many boards had loaded, and the scroll. */
export interface GalleryReturn {
  sort: GallerySort;
  type: PlaygroundType | null;
  query: string;
  count: number;
  scroll: number;
}

const RETURN_KEY = "pp:gallery-return";

export function saveGalleryReturn(r: GalleryReturn) {
  try {
    sessionStorage.setItem(RETURN_KEY, JSON.stringify(r));
  } catch {
    /* private mode: the gallery just starts at the top */
  }
}

/** The saved spot, if a board was opened from the gallery in this tab. `take` clears it, so it's used once. */
export function readGalleryReturn(take = false): GalleryReturn | null {
  try {
    const raw = sessionStorage.getItem(RETURN_KEY);
    if (take) sessionStorage.removeItem(RETURN_KEY);
    return raw ? (JSON.parse(raw) as GalleryReturn) : null;
  } catch {
    return null;
  }
}

/** True when "Back to Gallery" has a spot to go back to. */
export const galleryReturnUrl = () => !!readGalleryReturn();
