import { Copy, Heart, MessageSquare, Pencil, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { create } from "zustand";
import {
  addComment,
  COMMENT_MAX,
  deleteComment,
  fetchBoardPanel,
  fetchComments,
  markCommentsSeen,
  timeAgo,
  type BoardComment,
  type BoardPanelInfo,
} from "../lib/boardSocial";
import { PLAYGROUND_TYPES } from "../lib/cloud";
import { setGalleryLike } from "../lib/gallery";
import { useAuth } from "../store/auth";
import { useBilling } from "../store/billing";
import { useCloud } from "../store/cloud";
import { usePlayground } from "../store/playground";
import { useUi } from "../store/ui";
import { tip } from "./Tooltip";

const TYPE_LABELS = Object.fromEntries(PLAYGROUND_TYPES) as Record<string, string>;

interface PanelState {
  open: boolean;
  setOpen: (open: boolean) => void;
  /** Owner only: comments from others they haven't seen. */
  unseen: number;
  setUnseen: (n: number) => void;
  /** Comments on the board, shown on the header button; null when it has no comments section (not in the gallery). */
  count: number | null;
  /** Bumped when the board's settings change elsewhere (the Playground Settings dialog), so the panel reloads. */
  version: number;
  refresh: () => void;
}

const OPEN_KEY = "pp:boardPanel";
/** The column's width on larger screens (sm:w-[300px] below), plus its border. */
const COLUMN_WIDTH = 301;
const isWide = () => window.matchMedia("(min-width: 640px)").matches;

/** Larger screens remember whether the column was left open. Phones always start with the sheet closed. */
function rememberedOpen() {
  try {
    return isWide() && localStorage.getItem(OPEN_KEY) === "1";
  } catch {
    return false;
  }
}
function remember(open: boolean) {
  try {
    if (isWide()) localStorage.setItem(OPEN_KEY, open ? "1" : "0");
  } catch {
    /* private mode: just don't remember */
  }
}

export const useBoardPanel = create<PanelState>((set) => ({
  open: rememberedOpen(),
  setOpen: (open) => {
    remember(open);
    set({ open });
  },
  unseen: 0,
  setUnseen: (unseen) => set({ unseen }),
  count: null,
  version: 0,
  refresh: () => set((s) => ({ version: s.version + 1 })),
}));

/**
 * The board the panel is about: a shared board being viewed, or your own board once it's shared.
 * Private boards have no panel; their settings are in the Playground Settings dialog.
 */
function usePanelTarget(): { id: string | null; viewing: boolean } {
  const viewingId = useUi((u) => u.viewing?.id ?? null);
  const ownShared = useCloud((c) => (c.isPublic ? c.cloudId : null));
  const signedIn = useAuth((s) => !!s.user);
  if (viewingId) return { id: viewingId, viewing: true };
  return { id: signedIn ? ownShared : null, viewing: false };
}

const field =
  "w-full rounded-control bg-surface-hover text-sm outline-none placeholder:text-ink-muted/70 focus-visible:ring-2 focus-visible:ring-brand focus:ring-2 focus:ring-brand";

/** Header button next to the board name: opens the board panel. Shows the comment count, and new comments on your own board. */
export function BoardInfoButton() {
  const { id, viewing } = usePanelTarget();
  const { open, setOpen, unseen, count } = useBoardPanel();

  // Load the counts when the board changes, and for your own board when you come back to the tab.
  // Someone's gallery board on a larger screen also opens the column, so its description and comments are there.
  useEffect(() => {
    useBoardPanel.setState({ unseen: 0, count: null });
    if (!id) return;
    let first = true;
    const check = () =>
      fetchBoardPanel(id).then(
        (p) => {
          useBoardPanel.setState({ unseen: viewing ? 0 : (p?.new_comments ?? 0), count: p?.in_gallery ? p.comment_count : null });
          if (first && viewing && p?.in_gallery && isWide()) useBoardPanel.setState({ open: true });
          first = false;
        },
        () => undefined,
      );
    void check();
    if (viewing) return;
    window.addEventListener("focus", check);
    return () => window.removeEventListener("focus", check);
  }, [id, viewing]);

  if (!id) return null;
  const label = count === null ? "Board info" : `Board info and ${count} ${count === 1 ? "comment" : "comments"}${unseen ? `, ${unseen} new` : ""}`;
  return (
    <button
      type="button"
      onClick={() => setOpen(!open)}
      aria-label={label}
      aria-pressed={open}
      {...tip(count === null ? "Board Info" : "Info & Comments", { side: "bottom" })}
      className={`press relative flex h-7 shrink-0 items-center gap-1 rounded-control px-1.5 text-[13px] font-semibold tabular-nums outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand ${open ? "bg-brand/10 text-brand" : "text-icon-solo hover:bg-ink/5 hover:text-ink"}`}
    >
      <MessageSquare size={16} strokeWidth={2.25} />
      {!!count && <span>{count}</span>}
      {unseen > 0 && <span aria-hidden className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-brand ring-2 ring-chrome" />}
    </button>
  );
}

/**
 * How a shared or gallery board reads: a summary (owner, type, description, likes) and its comments.
 * The same view for your own shared board, plus an Edit button for the Playground Settings dialog.
 * A column left of the canvas on larger screens, a sheet on phones.
 */
export function BoardPanel({ onSignIn, onEdit }: { onSignIn: () => void; onEdit: () => void }) {
  const { id, viewing } = usePanelTarget();
  const { open: wantOpen, setOpen, setUnseen, version } = useBoardPanel();
  const open = wantOpen && !!id;
  const user = useAuth((s) => s.user);
  const boardName = usePlayground((s) => s.name);
  const [info, setInfo] = useState<BoardPanelInfo | null | undefined>();
  const [comments, setComments] = useState<BoardComment[]>([]);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    if (!id) return setInfo(null);
    setFailed(false);
    try {
      const p = await fetchBoardPanel(id);
      setInfo(p);
      useBoardPanel.setState({ count: p?.in_gallery ? p.comment_count : null });
      setComments(p && (p.comments_open || (p.is_owner && p.in_gallery)) ? await fetchComments(id) : []);
    } catch {
      setFailed(true);
    }
  }, [id]);

  useEffect(() => {
    setInfo(undefined);
    setComments([]);
    if (open) void load();
  }, [open, load, user?.id]);
  useEffect(() => {
    if (open && version) void load();
    // Only when the dialog saved something.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  // The owner reading their comments clears the new-comment count.
  useEffect(() => {
    if (!open || viewing || !id || !info?.is_owner || !info.new_comments) return;
    setUnseen(0);
    void markCommentsSeen(id);
  }, [open, viewing, id, info, setUnseen]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !(e.target as HTMLElement).closest?.("input,textarea,select,[role=dialog]") && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);
  // The column changes the canvas's width. A shared board is framed again to fit; your own board keeps its zoom
  // and shifts by half the column, so whatever was in the middle stays in the middle.
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      if (!viewing) return;
    }
    if (!isWide()) return;
    if (viewing) {
      const t = setTimeout(() => usePlayground.getState().fitToContent(), 0);
      return () => clearTimeout(t);
    }
    usePlayground.getState().panBy(open ? -COLUMN_WIDTH / 2 : COLUMN_WIDTH / 2, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  useEffect(() => {
    if (!viewing || !isWide()) return;
    const t = setTimeout(() => usePlayground.getState().fitToContent(), 0);
    return () => clearTimeout(t);
  }, [viewing]);

  if (!open || !id) return null;

  const own = !viewing;

  return (
    <aside
      aria-label="Board info and comments"
      data-clarity-mask="True"
      className="max-sm:animate-enter fixed inset-x-0 bottom-0 z-40 flex max-h-[85dvh] flex-col rounded-t-panel bg-surface shadow-[var(--shadow-modal)] sm:static sm:z-auto sm:max-h-none sm:w-[300px] sm:shrink-0 sm:rounded-none sm:border-r sm:border-chrome-line sm:shadow-none"
    >
      <div className="flex items-start gap-1 border-b border-line px-4 pb-3 pt-3.5">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-semibold">{own ? boardName : (info?.name ?? boardName)}</h2>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-muted empty:hidden">
            {info?.username && <span>by @{info.username}</span>}
            {info?.playground_type && <span className="rounded-full bg-surface-hover px-2 py-0.5">{TYPE_LABELS[info.playground_type]}</span>}
            <PedalCount />
          </p>
        </div>
        {own && (
          <button
            type="button"
            onClick={onEdit}
            aria-label="Playground Settings"
            {...tip("Playground Settings", { side: "bottom" })}
            className="grid size-8 shrink-0 place-items-center rounded-control text-ink-muted outline-none hover:bg-surface-hover hover:text-ink focus-visible:ring-2 focus-visible:ring-brand"
          >
            <Pencil size={15} />
          </button>
        )}
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close"
          className="-mr-1.5 grid size-8 shrink-0 place-items-center rounded-control text-ink-muted outline-none hover:bg-surface-hover hover:text-ink focus-visible:ring-2 focus-visible:ring-brand"
        >
          <X size={16} />
        </button>
      </div>

      {failed ? (
        <p className="p-4 text-sm text-ink-muted">
          This didn't load.{" "}
          <button type="button" className="font-semibold text-brand" onClick={() => void load()}>
            Try again
          </button>
        </p>
      ) : info === undefined ? (
        <Loading />
      ) : info === null ? (
        <p className="p-4 text-sm text-ink-muted">This board isn't shared anymore.</p>
      ) : (
        <Social id={id} info={info} setInfo={setInfo} comments={comments} setComments={setComments} reload={load} onSignIn={onSignIn} onEdit={onEdit} own={own} />
      )}
    </aside>
  );
}

function Loading() {
  return (
    <div className="space-y-2 p-4" aria-hidden>
      <div className="h-3 w-full animate-pulse rounded bg-surface-hover" />
      <div className="h-3 w-2/3 animate-pulse rounded bg-surface-hover" />
    </div>
  );
}

function PedalCount() {
  const n = usePlayground((s) => s.items.filter((i) => i.kind === "pedal").length);
  return n ? <span>{`${n} ${n === 1 ? "pedal" : "pedals"}`}</span> : null;
}

/** The board's description, likes, Create a Copy (someone else's board) and comments. */
function Social({
  id,
  info,
  setInfo,
  comments,
  setComments,
  reload,
  onSignIn,
  onEdit,
  own,
}: {
  id: string;
  info: BoardPanelInfo;
  setInfo: (i: BoardPanelInfo) => void;
  comments: BoardComment[];
  setComments: (c: BoardComment[]) => void;
  reload: () => Promise<void>;
  onSignIn: () => void;
  onEdit: () => void;
  own: boolean;
}) {
  const user = useAuth((s) => s.user);
  const list = useRef<HTMLDivElement>(null);

  const like = async () => {
    if (!user) return onSignIn();
    const liked = !info.liked;
    setInfo({ ...info, liked, like_count: Math.max(0, info.like_count + (liked ? 1 : -1)) });
    try {
      setInfo({ ...info, liked, like_count: await setGalleryLike(id, liked) });
    } catch {
      setInfo(info);
    }
  };

  const remove = async (c: BoardComment) => {
    if (!window.confirm("Delete this comment?")) return;
    try {
      await deleteComment(c.id);
      setComments(comments.filter((x) => x.id !== c.id));
    } catch {
      window.alert("That comment couldn't be deleted.");
    }
  };

  const showComments = info.comments_open || (own && info.in_gallery);

  return (
    <>
      <div ref={list} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4 pt-3">
        {info.description ? (
          <p className="whitespace-pre-wrap break-words text-sm">{info.description}</p>
        ) : (
          own && (
            <button type="button" onClick={onEdit} className="text-sm text-ink-muted hover:text-ink">
              Add a description…
            </button>
          )
        )}
        <div className="mt-3 flex flex-wrap items-center gap-2 empty:hidden">
          {info.in_gallery &&
            (own ? (
              <span className="flex h-8 items-center gap-1.5 text-[13px] text-ink-muted">
                <Heart size={14} strokeWidth={2.25} />
                {info.like_count} {info.like_count === 1 ? "like" : "likes"}
              </span>
            ) : (
              <button
                type="button"
                onClick={() => void like()}
                aria-pressed={info.liked}
                className={`press flex h-8 items-center gap-1.5 rounded-full border border-line px-3 text-[13px] font-semibold transition-colors ${info.liked ? "border-danger/30 bg-danger/5 text-danger" : "text-ink-muted hover:text-ink"}`}
              >
                <Heart size={14} fill={info.liked ? "currentColor" : "none"} strokeWidth={2.25} />
                {info.like_count} {info.like_count === 1 ? "like" : "likes"}
              </button>
            ))}
          {!own && <CopyButton onSignIn={onSignIn} />}
        </div>
        {own && !info.in_gallery && (
          <p className="mt-4 border-t border-line pt-4 text-[13px] text-ink-muted">
            Shared by link. Add it to the Public Gallery (
            <button type="button" onClick={onEdit} className="font-semibold text-brand">
              Playground Settings
            </button>
            ) for likes and comments.
          </p>
        )}

        {showComments && (
          <section className="mt-5 border-t border-line pt-4" aria-label="Comments">
            <h3 className="text-sm font-semibold">
              Comments <span className="font-normal text-ink-muted">{comments.length || ""}</span>
            </h3>
            {own && info.comments_off && <p className="mb-2 text-xs text-ink-muted">Comments are off. Only you can see these.</p>}
            {comments.length === 0 ? (
              <p className="mt-2 text-sm text-ink-muted">{own ? "No comments yet." : "No comments yet. Say something nice."}</p>
            ) : (
              <ul className="mt-2 space-y-3">
                {comments.map((c) => (
                  <li key={c.id} className="group/comment">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="font-semibold">{c.username ? `@${c.username}` : "Member"}</span>
                      <span className="text-ink-muted" title={new Date(c.created_at).toLocaleString()}>
                        {timeAgo(c.created_at)}
                      </span>
                      {c.can_delete && (
                        <button
                          type="button"
                          onClick={() => void remove(c)}
                          aria-label="Delete comment"
                          className="ml-auto grid size-6 place-items-center rounded-control text-ink-muted opacity-0 outline-none hover:bg-danger/10 hover:text-danger focus-visible:opacity-100 group-hover/comment:opacity-100 [@media(hover:none)]:opacity-100"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                    <p className="mt-0.5 whitespace-pre-wrap break-words text-sm">{c.body}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>

      {info.comments_open && (
        <Composer
          id={id}
          onSignIn={onSignIn}
          onPosted={async () => {
            await reload();
            requestAnimationFrame(() => list.current?.scrollTo({ top: list.current.scrollHeight, behavior: "smooth" }));
          }}
        />
      )}
    </>
  );
}

/** Copies are a Pro feature; signed out, it asks you to sign in first. */
function CopyButton({ onSignIn }: { onSignIn: () => void }) {
  const user = useAuth((s) => s.user);
  const { billingEnabled, entitlements } = useBilling();
  const canCopy = !!user && (!billingEnabled || entitlements?.plan === "pro");
  const onClick = () => {
    if (!user) onSignIn();
    else if (!canCopy) useUi.getState().openUpgrade("copy");
    else {
      useBoardPanel.getState().setOpen(false);
      useCloud.getState().copyShared();
    }
  };
  return (
    <button type="button" onClick={onClick} className="press flex h-8 items-center gap-1.5 rounded-full border border-line px-3 text-[13px] font-semibold text-ink-muted hover:text-ink">
      <Copy size={13} strokeWidth={2.25} />
      Create a Copy
      {!canCopy && user && <span className="rounded-full bg-brand/10 px-1.5 text-[11px] font-semibold text-brand">Pro</span>}
    </button>
  );
}

function Composer({ id, onSignIn, onPosted }: { id: string; onSignIn: () => void; onPosted: () => Promise<void> }) {
  const user = useAuth((s) => s.user);
  const [text, setText] = useState("");
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user)
    return (
      <div className="border-t border-line px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:pb-3">
        <button type="button" onClick={onSignIn} className="btn-primary h-9 w-full rounded-control text-sm">
          Sign in to comment
        </button>
      </div>
    );

  const post = async () => {
    if (!text.trim() || posting) return;
    setPosting(true);
    setError(null);
    try {
      await addComment(id, text);
      setText("");
      await onPosted();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPosting(false);
    }
  };

  return (
    <form
      className="border-t border-line px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:pb-3"
      onSubmit={(e) => {
        e.preventDefault();
        void post();
      }}
    >
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, COMMENT_MAX))}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void post();
        }}
        rows={2}
        placeholder="Add a comment"
        aria-label="Add a comment"
        className={`block resize-none px-3 py-2 ${field}`}
      />
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
      <div className="mt-1.5 flex items-center justify-between">
        <span className="text-[11px] text-ink-muted">{text.length > COMMENT_MAX - 100 ? `${COMMENT_MAX - text.length} left` : ""}</span>
        <button type="submit" disabled={!text.trim() || posting} className="btn-primary h-8 rounded-[5px] px-3 text-[13px] disabled:opacity-50">
          Post
        </button>
      </div>
    </form>
  );
}
