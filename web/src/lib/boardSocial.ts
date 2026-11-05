import { supabase } from "./supabase";
import type { PlaygroundType } from "./cloud";

/** What the board info panel shows (see the board_comments migration). */
export interface BoardPanelInfo {
  name: string;
  description: string | null;
  playground_type: PlaygroundType | null;
  username: string | null;
  is_owner: boolean;
  in_gallery: boolean;
  comments_off: boolean;
  /** In the gallery with comments on: people can read and post. */
  comments_open: boolean;
  like_count: number;
  liked: boolean;
  comment_count: number;
  /** Owner only: comments from others since they last opened the panel. */
  new_comments: number;
}

export interface BoardComment {
  id: string;
  body: string;
  created_at: string;
  username: string | null;
  mine: boolean;
  can_delete: boolean;
}

export const COMMENT_MAX = 1000;

const db = () => {
  if (!supabase) throw new Error("Cloud is not configured.");
  return supabase;
};

/** Null when the board isn't shared and isn't yours, or the database doesn't have the panel yet. */
export async function fetchBoardPanel(id: string): Promise<BoardPanelInfo | null> {
  const { data, error } = await db().rpc("board_panel", { board: id });
  if (error) throw error;
  return ((data as BoardPanelInfo[] | null) ?? [])[0] ?? null;
}

export async function fetchComments(id: string): Promise<BoardComment[]> {
  const { data, error } = await db().rpc("board_comments_list", { board: id });
  if (error) throw error;
  return (data as BoardComment[] | null) ?? [];
}

const COMMENT_ERRORS: Record<string, string> = {
  sign_in_required: "Sign in to comment.",
  username_required: "Pick a username first (Account menu), then comment.",
  comments_closed: "Comments are closed on this board.",
  slow_down: "You're commenting very fast. Wait a minute and try again.",
};

/** Posts a comment. Throws an Error with a message that's fine to show. */
export async function addComment(id: string, body: string): Promise<void> {
  const { error } = await db().rpc("board_comment_add", { board: id, body });
  if (error) throw new Error(COMMENT_ERRORS[error.message] ?? "The comment didn't post. Try again.");
}

export async function deleteComment(commentId: string) {
  const { error } = await db().rpc("board_comment_delete", { comment: commentId });
  if (error) throw error;
}

/** The owner opened their comments: clears the new-comment count. */
export async function markCommentsSeen(id: string) {
  const { error } = await db().rpc("board_comments_seen", { board: id });
  if (error) throw error;
}

/** The owner's "Allow comments" switch. */
export async function setCommentsOff(id: string, off: boolean) {
  const { error } = await db().from("playgrounds").update({ comments_off: off }).eq("id", id);
  if (error) throw error;
}

/** "3m", "2h", "5d", or a date for older ones. */
export function timeAgo(iso: string, now = Date.now()): string {
  const s = Math.max(0, (now - new Date(iso).getTime()) / 1000);
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}d`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
