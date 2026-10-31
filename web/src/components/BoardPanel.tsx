import { Check, Copy, Heart, Info, Trash2, X } from "lucide-react";
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
import { DESCRIPTION_MAX, PLAYGROUND_TYPES, shareUrl, updateDetails, type PlaygroundType } from "../lib/cloud";
import { setGalleryLike } from "../lib/gallery";
import { plainField } from "../lib/inputProps";
import { useAuth } from "../store/auth";
import { useBilling } from "../store/billing";
import { useCloud } from "../store/cloud";
import { usePlayground } from "../store/playground";
import { useUi } from "../store/ui";
import { tip } from "./Tooltip";

const TYPE_LABELS = Object.fromEntries(PLAYGROUND_TYPES) as Record<string, string>;

type Tab = "details" | "comments";

interface PanelState {
  open: boolean;
  /** Your own board: which tab shows. Someone else's board has no tabs. */
  tab: Tab;
  setOpen: (open: boolean) => void;
  openTo: (tab: Tab) => void;
  setTab: (tab: Tab) => void;
  /** Owner only: comments from others they haven't seen. */
  unseen: number;
  setUnseen: (n: number) => void;
}

export const useBoardPanel = create<PanelState>((set) => ({
  open: false,
  tab: "details",
  setOpen: (open) => set({ open }),
  openTo: (tab) => set({ open: true, tab }),
  setTab: (tab) => set({ tab }),
  unseen: 0,
  setUnseen: (unseen) => set({ unseen }),
}));

/** The board the panel is about: the shared board being viewed, or your own (saved to your account, or not yet). */
function usePanelTarget(): { id: string | null; viewing: boolean } {
  const viewingId = useUi((u) => u.viewing?.id ?? null);
  const cloudId = useCloud((c) => c.cloudId);
  const signedIn = useAuth((s) => !!s.user);
  return viewingId ? { id: viewingId, viewing: true } : { id: signedIn ? cloudId : null, viewing: false };
}

const field =
  "w-full rounded-control bg-surface-hover text-sm outline-none placeholder:text-ink-muted/70 focus-visible:ring-2 focus-visible:ring-brand focus:ring-2 focus:ring-brand";
const label = "mb-1 block text-xs text-ink-muted";

/** Header button next to the board name: opens the board panel, with a count of new comments on your own board. */
export function BoardInfoButton() {
  const { id, viewing } = usePanelTarget();
  const { open, setOpen, openTo, unseen, setUnseen } = useBoardPanel();

  // Someone's gallery board on a larger screen: open the panel right away, so its description and comments show.
  useEffect(() => {
    if (!id || !viewing || !window.matchMedia("(min-width: 640px)").matches) return;
    fetchBoardPanel(id).then(
      (p) => p?.in_gallery && setOpen(true),
      () => undefined,
    );
  }, [id, viewing, setOpen]);

  // Your own board: check for new comments when it opens and when you come back to the tab.
  useEffect(() => {
    setUnseen(0);
    if (!id || viewing) return;
    const check = () =>
      fetchBoardPanel(id).then(
        (p) => setUnseen(p?.new_comments ?? 0),
        () => undefined,
      );
    void check();
    window.addEventListener("focus", check);
    return () => window.removeEventListener("focus", check);
  }, [id, viewing, setUnseen]);

  const onClick = () => {
    if (open) setOpen(false);
    else openTo(!viewing && unseen > 0 ? "comments" : "details");
  };
  const name = viewing ? "Board details and comments" : "Playground details and comments";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={unseen ? `${name}, ${unseen} new ${unseen === 1 ? "comment" : "comments"}` : name}
      aria-pressed={open}
      {...tip(viewing ? "Details & Comments" : "Edit Details & Comments", { side: "bottom" })}
      className={`press relative grid size-7 shrink-0 place-items-center rounded-control outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand ${open ? "bg-brand/10 text-brand" : "text-icon-solo hover:bg-ink/5 hover:text-ink"}`}
    >
      <Info size={16} strokeWidth={2.25} />
      {unseen > 0 && (
        <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-brand px-1 text-[10px] font-bold text-brand-ink">
          {unseen > 9 ? "9+" : unseen}
        </span>
      )}
    </button>
  );
}

/**
 * Everything about a board in one place. A side panel on larger screens, a sheet on phones.
 * Someone else's board: owner, description, likes, Create a Copy and comments.
 * Your own: a Details tab (name, type, description, share link, gallery, comments switch, delete) and a Comments tab.
 */
export function BoardPanel({ onSignIn }: { onSignIn: () => void }) {
  const { id, viewing } = usePanelTarget();
  const { open, setOpen, tab, setTab, setUnseen } = useBoardPanel();
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
      setComments(p && (p.comments_open || p.is_owner) ? await fetchComments(id) : []);
    } catch {
      setFailed(true);
    }
  }, [id]);

  useEffect(() => {
    setInfo(undefined);
    setComments([]);
    if (open) void load();
  }, [open, load, user?.id]);

  // The owner reading their comments clears the new-comment count.
  useEffect(() => {
    if (!open || viewing || tab !== "comments" || !id || !info?.is_owner || !info.new_comments) return;
    setUnseen(0);
    void markCommentsSeen(id);
  }, [open, viewing, tab, id, info, setUnseen]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !(e.target as HTMLElement).closest?.("input,textarea,select") && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);
  // Moving between boards keeps the panel only while there's a board to show.
  useEffect(() => {
    if (viewing && !id) setOpen(false);
  }, [id, viewing, setOpen]);

  // Larger screens: the panel covers the canvas's right edge, so Center & Fit (and this first fit) keep the board beside it.
  useEffect(() => {
    if (!open || !window.matchMedia("(min-width: 640px)").matches) return;
    const pg = usePlayground.getState();
    pg.setCoverRight(340 + 12);
    if (useUi.getState().viewing) pg.fitToContent();
    return () => {
      usePlayground.getState().setCoverRight(0);
      if (useUi.getState().viewing) usePlayground.getState().fitToContent();
    };
  }, [open, id]);

  if (!open) return null;

  const own = !viewing;
  const unseenCount = info?.is_owner ? info.new_comments : 0;
  const tabButton = (t: Tab, text: React.ReactNode) => (
    <button
      type="button"
      role="tab"
      aria-selected={tab === t}
      onClick={() => setTab(t)}
      className={`-mb-px flex h-9 items-center gap-1.5 border-b-2 px-1 text-[13px] font-semibold transition-colors ${tab === t ? "border-ink text-ink" : "border-transparent text-ink-muted hover:text-ink"}`}
    >
      {text}
    </button>
  );

  return (
    <aside
      aria-label={own ? "Playground details and comments" : "Board details and comments"}
      data-clarity-mask="True"
      className="animate-enter fixed inset-x-0 bottom-0 z-40 flex max-h-[85dvh] flex-col rounded-t-panel bg-surface shadow-[var(--shadow-modal)] sm:absolute sm:inset-x-auto sm:bottom-3 sm:right-3 sm:top-3 sm:max-h-none sm:w-[340px] sm:rounded-panel sm:shadow-panel"
    >
      <div className={`flex items-start gap-2 px-4 pt-3.5 ${own ? "" : "border-b border-line pb-3"}`}>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-semibold">{own ? boardName : (info?.name ?? boardName)}</h2>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-muted empty:hidden">
            {!own && info?.username && <span>by @{info.username}</span>}
            {!own && info?.playground_type && <span className="rounded-full bg-surface-hover px-2 py-0.5">{TYPE_LABELS[info.playground_type]}</span>}
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

      {own && id && (
        <div role="tablist" className="mt-2 flex gap-4 border-b border-line px-4">
          {tabButton("details", "Details")}
          {tabButton(
            "comments",
            <>
              Comments
              {unseenCount > 0 ? (
                <span className="rounded-full bg-brand px-1.5 text-[11px] font-bold text-brand-ink">{unseenCount}</span>
              ) : (
                info?.comment_count ? <span className="font-normal text-ink-muted">{info.comment_count}</span> : null
              )}
            </>,
          )}
        </div>
      )}

      {failed ? (
        <p className="p-4 text-sm text-ink-muted">
          This didn't load.{" "}
          <button type="button" className="font-semibold text-brand" onClick={() => void load()}>
            Try again
          </button>
        </p>
      ) : own && (!id || tab === "details") ? (
        id && info === undefined ? <Loading /> : <OwnerDetails id={id} info={info ?? null} reload={load} />
      ) : info === undefined ? (
        <Loading />
      ) : info === null ? (
        <p className="p-4 text-sm text-ink-muted">This board isn't shared anymore.</p>
      ) : (
        <Social id={id!} info={info} setInfo={setInfo} comments={comments} setComments={setComments} reload={load} onSignIn={onSignIn} own={own} />
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

/** A labelled on/off switch row. */
function Switch({ on, title, hint, onClick, disabled }: { on: boolean; title: string; hint: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={onClick}
      className="flex w-full items-start justify-between gap-4 rounded-control text-left outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-60"
    >
      <span>
        <span className="block text-sm">{title}</span>
        <span className="block text-xs text-ink-muted">{hint}</span>
      </span>
      <span className={`relative mt-0.5 inline-flex h-[18px] w-8 shrink-0 rounded-full transition-colors duration-200 ${on ? "bg-brand" : "bg-ink/15"}`}>
        <span className={`absolute left-0.5 top-0.5 size-3.5 rounded-full bg-white shadow-sm transition-transform duration-200 ease-out ${on ? "translate-x-3.5" : ""}`} />
      </span>
    </button>
  );
}

/**
 * Your own board's settings, which used to live in the Edit Playground dialog. Name, type and description save
 * with a Save button; the switches and share link take effect right away. A board that isn't saved to an account
 * yet only has its name.
 */
function OwnerDetails({ id, info, reload }: { id: string | null; info: BoardPanelInfo | null; reload: () => Promise<void> }) {
  const cloud = useCloud();
  const openName = usePlayground((s) => s.name);
  const startDescription = info?.description ?? "";
  const startType = (info?.playground_type ?? null) as PlaygroundType | null;
  const [name, setName] = useState(openName);
  const [description, setDescription] = useState(startDescription);
  const [type, setType] = useState<PlaygroundType | null>(startType);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const slug = cloud.isPublic ? cloud.slug : null;

  // Picks up a rename made elsewhere (like the playground menu) while nothing here is being edited.
  useEffect(() => setName(openName), [openName]);

  const dirty = name.trim() !== openName || (!!info && (description.trim() !== startDescription.trim() || type !== startType));

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      if (name.trim() !== openName) {
        const err = await cloud.rename(name);
        if (err) return setError(err);
      }
      if (id && info && (description.trim() !== startDescription.trim() || type !== startType)) {
        await updateDetails(id, { description, type });
        await reload();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save those changes.");
    } finally {
      setBusy(false);
    }
  };
  const cancel = () => {
    setName(openName);
    setDescription(startDescription);
    setType(startType);
    setError(null);
  };

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't work. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!id || !window.confirm(`Delete "${openName}"? This can't be undone. The canvas will be cleared.`)) return;
    await run(() => cloud.remove(id));
    useBoardPanel.getState().setOpen(false);
  };

  return (
    <>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 pb-4 pt-3">
        <div>
          <label className={label} htmlFor="bp-name">
            Name
          </label>
          <input
            id="bp-name"
            value={name}
            maxLength={120}
            {...plainField}
            autoCapitalize="words"
            enterKeyHint="done"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && dirty && void save()}
            className={`h-9 px-3 ${field}`}
          />
        </div>

        {!id ? (
          <p className="text-[13px] text-ink-muted">Sign in to save this playground, then you can describe it, share it and add it to the Public Gallery.</p>
        ) : (
          info && (
            <>
              <div>
                <label className={label} htmlFor="bp-type">
                  Playground Type
                </label>
                <select
                  id="bp-type"
                  value={type ?? ""}
                  onChange={(e) => setType((e.target.value || null) as PlaygroundType | null)}
                  className={`h-9 px-2.5 ${field} ${type ? "" : "text-ink-muted"}`}
                >
                  <option value="">Choose a type…</option>
                  {PLAYGROUND_TYPES.map(([value, text]) => (
                    <option key={value} value={value} className="text-ink">
                      {text}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={`${label} flex justify-between`} htmlFor="bp-description">
                  Description
                  {description.length > DESCRIPTION_MAX - 100 && (
                    <span>
                      {description.length}/{DESCRIPTION_MAX}
                    </span>
                  )}
                </label>
                <textarea
                  id="bp-description"
                  value={description}
                  maxLength={DESCRIPTION_MAX}
                  rows={3}
                  {...plainField}
                  placeholder="What's this board for? Gear notes, power, anything."
                  onChange={(e) => setDescription(e.target.value)}
                  className={`block resize-none px-3 py-2 ${field}`}
                />
              </div>

              <div className="space-y-3 border-t border-line pt-4">
                <div>
                  <span className={label}>Share Link</span>
                  {slug ? (
                    <button
                      type="button"
                      aria-label="Copy share link"
                      onClick={() => {
                        void navigator.clipboard?.writeText(shareUrl(slug));
                        setCopied(true);
                        setTimeout(() => setCopied(false), 1500);
                      }}
                      {...tip(copied ? "Copied" : "Copy Link")}
                      className={`flex h-9 items-center gap-2 px-3 text-left ${field}`}
                    >
                      <span className="min-w-0 flex-1 truncate">{shareUrl(slug)}</span>
                      {copied ? <Check size={14} className="shrink-0 text-brand" /> : <Copy size={14} className="shrink-0 text-ink-muted" />}
                    </button>
                  ) : (
                    <button type="button" disabled={busy} onClick={() => void run(() => cloud.share())} className={`flex h-9 items-center px-3 text-left text-brand disabled:opacity-60 ${field}`}>
                      Create Share Link
                    </button>
                  )}
                </div>
                <Switch
                  on={info.in_gallery}
                  disabled={busy}
                  title="Show in Public Gallery"
                  hint={info.in_gallery ? "Anyone can find it in the gallery, like it and open their own copy." : "Only people you send the share link to can see it."}
                  onClick={() => void run(() => cloud.setInGallery(id, !info.in_gallery))}
                />
                {info.in_gallery && (
                  <Switch
                    on={!info.comments_off}
                    disabled={busy}
                    title="Allow Comments"
                    hint={info.comments_off ? "Comments are hidden from everyone but you." : "Anyone signed in can comment."}
                    onClick={() => void run(() => setCommentsOff(id, !info.comments_off))}
                  />
                )}
              </div>
            </>
          )
        )}

        {error && <p className="text-sm text-danger">{error}</p>}

        {id && (
          <div className="border-t border-line pt-3">
            <button type="button" onClick={() => void remove()} className="h-8 text-sm text-danger outline-none hover:underline focus-visible:underline">
              Delete Playground
            </button>
          </div>
        )}
      </div>

      {dirty && (
        <div className="flex justify-end gap-2 border-t border-line px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:pb-3">
          <button type="button" onClick={cancel} className="h-9 rounded-control px-3 text-sm text-ink-muted hover:bg-surface-hover">
            Cancel
          </button>
          <button type="button" onClick={() => void save()} disabled={busy || !name.trim()} className="btn-primary h-9 px-3 disabled:opacity-60">
            Save
          </button>
        </div>
      )}
    </>
  );
}

/** Someone else's board (owner, description, likes, copy, comments), or your own board's Comments tab. */
function Social({
  id,
  info,
  setInfo,
  comments,
  setComments,
  reload,
  onSignIn,
  own,
}: {
  id: string;
  info: BoardPanelInfo;
  setInfo: (i: BoardPanelInfo) => void;
  comments: BoardComment[];
  setComments: (c: BoardComment[]) => void;
  reload: () => Promise<void>;
  onSignIn: () => void;
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

  if (own && !info.in_gallery)
    return (
      <div className="px-4 py-4 text-sm">
        <p className="text-ink-muted">Likes and comments are for boards in the Public Gallery.</p>
        <button type="button" onClick={() => useBoardPanel.getState().setTab("details")} className="mt-2 font-semibold text-brand">
          Add it in Details
        </button>
      </div>
    );

  const showComments = info.comments_open || own;

  return (
    <>
      <div ref={list} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4 pt-3">
        {own ? (
          <p className="mb-3 flex items-center gap-1.5 text-[13px] text-ink-muted">
            <Heart size={13} strokeWidth={2.25} />
            {info.like_count} {info.like_count === 1 ? "like" : "likes"} in the gallery
          </p>
        ) : (
          <>
            {info.description && <p className="whitespace-pre-wrap break-words text-sm">{info.description}</p>}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {info.in_gallery && (
                <button
                  type="button"
                  onClick={() => void like()}
                  aria-pressed={info.liked}
                  className={`press flex h-8 items-center gap-1.5 rounded-full border border-line px-3 text-[13px] font-semibold transition-colors ${info.liked ? "border-danger/30 bg-danger/5 text-danger" : "text-ink-muted hover:text-ink"}`}
                >
                  <Heart size={14} fill={info.liked ? "currentColor" : "none"} strokeWidth={2.25} />
                  {info.like_count} {info.like_count === 1 ? "like" : "likes"}
                </button>
              )}
              <CopyButton onSignIn={onSignIn} />
            </div>
          </>
        )}

        {showComments && (
          <section className={own ? "" : "mt-5 border-t border-line pt-4"} aria-label="Comments">
            {!own && (
              <h3 className="text-sm font-semibold">
                Comments <span className="font-normal text-ink-muted">{comments.length || ""}</span>
              </h3>
            )}
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
