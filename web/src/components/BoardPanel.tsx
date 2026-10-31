import { Copy, Heart, MessageCircle, Pencil, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { create } from "zustand";
import {
  addComment,
  COMMENT_MAX,
  deleteComment,
  fetchBoardPanel,
  fetchComments,
  markCommentsSeen,
  setCommentsOff,
  timeAgo,
  type BoardComment,
  type BoardPanelInfo,
} from "../lib/boardSocial";
import { PLAYGROUND_TYPES, updateDetails } from "../lib/cloud";
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
  /** False once we learn the database has no panel functions yet, so the button stays hidden. */
  supported: boolean;
}

export const useBoardPanel = create<PanelState>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
  unseen: 0,
  setUnseen: (unseen) => set({ unseen }),
  supported: true,
}));

/** Function not found: the board_comments migration hasn't been run. */
const isMissingFunction = (e: unknown) => (e as { code?: string })?.code === "PGRST202";

/** The board the panel is about: the shared board being viewed, or your own saved one. */
export function usePanelBoardId(): string | null {
  const viewingId = useUi((u) => u.viewing?.id ?? null);
  const cloudId = useCloud((c) => c.cloudId);
  const signedIn = useAuth((s) => !!s.user);
  return viewingId ?? (signedIn ? cloudId : null);
}

/** Header button next to the board name: opens the info panel, with a count of new comments on your own board. */
export function BoardInfoButton() {
  const id = usePanelBoardId();
  const { open, setOpen, unseen, setUnseen, supported } = useBoardPanel();
  const viewing = useUi((u) => !!u.viewing);

  // Someone's gallery board on a larger screen: open the panel right away, so its description and comments show.
  useEffect(() => {
    if (!id || !viewing || !window.matchMedia("(min-width: 640px)").matches) return;
    fetchBoardPanel(id).then(
      (p) => p?.in_gallery && setOpen(true),
      (e) => isMissingFunction(e) && useBoardPanel.setState({ supported: false }),
    );
  }, [id, viewing, setOpen]);

  // Your own board: check for new comments when it opens and when you come back to the tab.
  useEffect(() => {
    setUnseen(0);
    if (!id || viewing) return;
    const check = () =>
      fetchBoardPanel(id).then(
        (p) => setUnseen(p?.new_comments ?? 0),
        (e) => isMissingFunction(e) && useBoardPanel.setState({ supported: false }),
      );
    void check();
    window.addEventListener("focus", check);
    return () => window.removeEventListener("focus", check);
  }, [id, viewing, setUnseen]);

  if (!id || !supported) return null;
  return (
    <button
      type="button"
      onClick={() => setOpen(!open)}
      aria-label={unseen ? `Board info, ${unseen} new ${unseen === 1 ? "comment" : "comments"}` : "Board info and comments"}
      aria-pressed={open}
      {...tip("Info & Comments", { side: "bottom" })}
      className={`press relative grid size-7 shrink-0 place-items-center rounded-control outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand ${open ? "bg-brand/10 text-brand" : "text-icon-solo hover:bg-ink/5 hover:text-ink"}`}
    >
      <MessageCircle size={16} strokeWidth={2.25} />
      {unseen > 0 && (
        <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-brand px-1 text-[10px] font-bold text-brand-ink">
          {unseen > 9 ? "9+" : unseen}
        </span>
      )}
    </button>
  );
}

/**
 * The board's description, owner, likes and comments. A side panel on larger screens, a sheet on phones.
 * Viewers can like, copy and comment; on your own board you can edit the description, turn comments off and
 * delete comments.
 */
export function BoardPanel({ onSignIn, onEdit }: { onSignIn: () => void; onEdit: () => void }) {
  const id = usePanelBoardId();
  const { open, setOpen, setUnseen } = useBoardPanel();
  const user = useAuth((s) => s.user);
  const [info, setInfo] = useState<BoardPanelInfo | null | undefined>();
  const [comments, setComments] = useState<BoardComment[]>([]);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setFailed(false);
    try {
      const p = await fetchBoardPanel(id);
      setInfo(p);
      setComments(p && (p.comments_open || p.is_owner) ? await fetchComments(id) : []);
      if (p?.is_owner && p.new_comments) {
        setUnseen(0);
        void markCommentsSeen(id);
      }
    } catch {
      setFailed(true);
    }
  }, [id, setUnseen]);

  useEffect(() => {
    setInfo(undefined);
    setComments([]);
    if (open) void load();
  }, [open, load, user?.id]);

  // Close on Escape, and when there's no board to show.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);
  useEffect(() => {
    if (!id) setOpen(false);
  }, [id, setOpen]);

  // Larger screens: the panel covers the canvas's right edge, so Center & Fit (and this first fit) keep the board beside it.
  useEffect(() => {
    if (!open || !id || !window.matchMedia("(min-width: 640px)").matches) return;
    const pg = usePlayground.getState();
    pg.setCoverRight(340 + 12);
    if (useUi.getState().viewing) pg.fitToContent();
    return () => {
      usePlayground.getState().setCoverRight(0);
      if (useUi.getState().viewing) usePlayground.getState().fitToContent();
    };
  }, [open, id]);

  if (!open || !id) return null;

  return (
    <aside
      aria-label="Board info and comments"
      data-clarity-mask="True"
      className="animate-enter fixed inset-x-0 bottom-0 z-40 flex max-h-[80dvh] flex-col rounded-t-panel bg-surface shadow-[var(--shadow-modal)] sm:absolute sm:inset-x-auto sm:bottom-3 sm:right-3 sm:top-3 sm:max-h-none sm:w-[340px] sm:rounded-panel sm:shadow-panel"
    >
      <div className="flex items-start gap-2 border-b border-line px-4 pb-3 pt-3.5">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-semibold">{info?.name ?? usePlayground.getState().name}</h2>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-muted">
            {info?.username && <span>by @{info.username}</span>}
            {info?.playground_type && <span className="rounded-full bg-surface-hover px-2 py-0.5">{TYPE_LABELS[info.playground_type]}</span>}
            <PedalCount />
          </p>
        </div>
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
        <div className="space-y-2 p-4" aria-hidden>
          <div className="h-3 w-full animate-pulse rounded bg-surface-hover" />
          <div className="h-3 w-2/3 animate-pulse rounded bg-surface-hover" />
        </div>
      ) : info === null ? (
        <p className="p-4 text-sm text-ink-muted">This board isn't shared anymore.</p>
      ) : (
        <PanelBody id={id} info={info} setInfo={setInfo} comments={comments} setComments={setComments} reload={load} onSignIn={onSignIn} onEdit={onEdit} />
      )}
    </aside>
  );
}

function PedalCount() {
  const n = usePlayground((s) => s.items.filter((i) => i.kind === "pedal").length);
  return n ? <span>{`${n} ${n === 1 ? "pedal" : "pedals"}`}</span> : null;
}

function PanelBody({
  id,
  info,
  setInfo,
  comments,
  setComments,
  reload,
  onSignIn,
  onEdit,
}: {
  id: string;
  info: BoardPanelInfo;
  setInfo: (i: BoardPanelInfo) => void;
  comments: BoardComment[];
  setComments: (c: BoardComment[]) => void;
  reload: () => Promise<void>;
  onSignIn: () => void;
  onEdit: () => void;
}) {
  const user = useAuth((s) => s.user);
  const list = useRef<HTMLDivElement>(null);
  const showComments = info.comments_open || (info.is_owner && info.in_gallery);

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

  return (
    <>
      <div ref={list} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4 pt-3">
        {info.is_owner ? (
          <DescriptionEditor id={id} info={info} setInfo={setInfo} />
        ) : (
          info.description && <p className="whitespace-pre-wrap break-words text-sm">{info.description}</p>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {info.in_gallery && (
            <button
              type="button"
              onClick={() => void like()}
              aria-pressed={info.liked}
              disabled={info.is_owner}
              className={`press flex h-8 items-center gap-1.5 rounded-full border border-line px-3 text-[13px] font-semibold transition-colors disabled:cursor-default ${info.liked ? "border-danger/30 bg-danger/5 text-danger" : "text-ink-muted enabled:hover:text-ink"}`}
            >
              <Heart size={14} fill={info.liked ? "currentColor" : "none"} strokeWidth={2.25} />
              {info.like_count} {info.like_count === 1 ? "like" : "likes"}
            </button>
          )}
          {!info.is_owner && <CopyButton onSignIn={onSignIn} />}
        </div>

        {info.is_owner && (
          <OwnerSettings id={id} info={info} setInfo={setInfo} onEdit={onEdit} onChanged={() => void reload()} />
        )}

        {showComments && (
          <section className="mt-5 border-t border-line pt-4" aria-label="Comments">
            <h3 className="text-sm font-semibold">
              Comments <span className="font-normal text-ink-muted">{comments.length || ""}</span>
            </h3>
            {info.is_owner && info.comments_off && (
              <p className="mt-1 text-xs text-ink-muted">Comments are off. Only you can see these.</p>
            )}
            {comments.length === 0 ? (
              <p className="mt-2 text-sm text-ink-muted">{info.is_owner ? "No comments yet." : "No comments yet. Say something nice."}</p>
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

function DescriptionEditor({ id, info, setInfo }: { id: string; info: BoardPanelInfo; setInfo: (i: BoardPanelInfo) => void }) {
  const [text, setText] = useState(info.description ?? "");
  const [saving, setSaving] = useState(false);
  const changed = text.trim() !== (info.description ?? "").trim();
  const save = async () => {
    setSaving(true);
    try {
      await updateDetails(id, { description: text, type: info.playground_type });
      setInfo({ ...info, description: text.trim() || null });
    } catch {
      window.alert("The description didn't save. Try again.");
    } finally {
      setSaving(false);
    }
  };
  return (
    <div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, 500))}
        rows={3}
        placeholder="Add a description: what it's for, signal chain notes, anything people should know."
        aria-label="Description"
        className="w-full resize-none rounded-control border border-line bg-surface px-3 py-2 text-sm outline-none placeholder:text-ink-muted focus:border-brand"
      />
      {changed && (
        <div className="mt-1.5 flex justify-end gap-2">
          <button type="button" className="h-8 rounded-[5px] px-3 text-[13px] font-semibold text-ink-muted hover:text-ink" onClick={() => setText(info.description ?? "")}>
            Cancel
          </button>
          <button type="button" disabled={saving} className="btn-primary h-8 rounded-[5px] px-3 text-[13px] disabled:opacity-50" onClick={() => void save()}>
            Save
          </button>
        </div>
      )}
    </div>
  );
}

function OwnerSettings({
  id,
  info,
  setInfo,
  onEdit,
  onChanged,
}: {
  id: string;
  info: BoardPanelInfo;
  setInfo: (i: BoardPanelInfo) => void;
  onEdit: () => void;
  onChanged: () => void;
}) {
  if (!info.in_gallery)
    return (
      <div className="mt-4 rounded-control bg-surface-hover px-3 py-2.5 text-[13px]">
        <p className="text-ink-muted">Likes and comments are for boards in the Public Gallery.</p>
        <button type="button" onClick={onEdit} className="mt-1.5 flex items-center gap-1.5 font-semibold text-brand">
          <Pencil size={12} strokeWidth={2.5} />
          Add it in Edit Playground
        </button>
      </div>
    );
  const toggle = async () => {
    const off = !info.comments_off;
    setInfo({ ...info, comments_off: off, comments_open: !off });
    try {
      await setCommentsOff(id, off);
      onChanged();
    } catch {
      setInfo(info);
    }
  };
  return (
    <button type="button" role="switch" aria-checked={!info.comments_off} onClick={() => void toggle()} className="mt-4 flex w-full items-center justify-between gap-3 text-left text-sm">
      <span>
        <span className="block">Allow comments</span>
        <span className="block text-xs text-ink-muted">{info.comments_off ? "Comments are hidden from everyone but you." : "Anyone signed in can comment."}</span>
      </span>
      <span className={`relative inline-flex h-[18px] w-8 shrink-0 rounded-full transition-colors duration-200 ${info.comments_off ? "bg-ink/15" : "bg-brand"}`}>
        <span className={`absolute left-0.5 top-0.5 size-3.5 rounded-full bg-white shadow-sm transition-transform duration-200 ease-out ${info.comments_off ? "" : "translate-x-3.5"}`} />
      </span>
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
        className="w-full resize-none rounded-control border border-line bg-surface px-3 py-2 text-sm outline-none placeholder:text-ink-muted focus:border-brand"
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
