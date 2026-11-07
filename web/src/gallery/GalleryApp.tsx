import { Heart, MessageCircle, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { PLAYGROUND_TYPES, type PlaygroundType } from "../lib/cloud";
import { boardUrl, fetchGalleryBoards, searchedUser, GALLERY_PAGE_SIZE, readGalleryReturn, saveGalleryReturn, setGalleryHidden, setGalleryLike, type GalleryBoard, type GallerySort } from "../lib/gallery";
import { supabase } from "../lib/supabase";
import { PageHeader, type PageDialog } from "../components/PageHeader";
import { useIsEditor } from "../lib/useIsEditor";
import { moderationError } from "../lib/moderation";
import { useRestriction } from "../store/standing";
import { useAuth } from "../store/auth";
import { tip } from "../components/Tooltip";
import { RoleBadges, teamRole, nameLink } from "../components/RoleBadge";
import { DensitySwitch, useDensity, type Density } from "../components/DensitySwitch";

const TYPE_LABELS: Record<PlaygroundType, string> = {
  guitar: "Guitar",
  bass: "Bass",
  synth: "Synth",
  collection: "Collection",
  other: "Other",
};

/** Columns for each card size, from phones up. Medium is the original grid. */
const GRID: Record<Density, string> = {
  large: "grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4",
  medium: "grid-cols-1 gap-4 min-[480px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5",
  small: "grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6",
};

const chip = (on: boolean) =>
  `press h-8 shrink-0 rounded-full px-3 text-[13px] font-semibold transition-colors ${on ? "bg-ink text-surface" : "bg-surface text-ink-muted shadow-chip hover:text-ink"}`;

/** The public gallery at /gallery/: boards whose owners turned on "Show in Public Gallery", newest or most liked first. */
export function GalleryApp() {
  /** Coming back from a board: start where you left off (read once). */
  const [returning] = useState(() => readGalleryReturn(true));
  const init = useAuth((s) => s.init);
  const user = useAuth((s) => s.user);
  const ready = useAuth((s) => s.ready);
  const [sort, setSort] = useState<GallerySort>(returning?.sort ?? "new");
  /** A short message over the boards (e.g. likes are off during a timeout). */
  const [note, setNote] = useState<string | null>(null);
  const restriction = useRestriction();
  /** The header's account dialogs; liking while signed out opens sign-in too. */
  const [dialog, setDialog] = useState<PageDialog>(null);
  const [type, setType] = useState<PlaygroundType | null>(returning?.type ?? null);
  // ?user=name (a username link) opens the gallery filtered to that person's boards.
  const [linkedUser] = useState(() => new URLSearchParams(window.location.search).get("user"));
  /** One person's boards (from a username link), kept apart from the search box so the box stays empty. */
  const [byUser, setByUser] = useState<string | null>(() => linkedUser ?? searchedUser(returning?.query ?? ""));
  const typed = linkedUser || searchedUser(returning?.query ?? "") ? "" : (returning?.query ?? "");
  const [query, setQuery] = useState(typed);
  const [search, setSearch] = useState(typed);
  /** What the gallery is filtered by: the person, or what's typed ("@name" typed still works). */
  const q = byUser ? `@${byUser}` : search;
  const filteredUser = byUser ?? searchedUser(search);
  const [boards, setBoards] = useState<GalleryBoard[]>([]);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [failed, setFailed] = useState(false);
  const editor = useIsEditor();
  const [density, setDensity] = useDensity("gallery");
  const [hidden, setHidden] = useState<GalleryBoard | null>(null);
  const request = useRef(0);
  const sentinel = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  /** The first load after coming back fetches as many boards as were showing, then scrolls to where you were. */
  const restore = useRef(returning);
  /** Applied once the restored boards are on the page. */
  const pendingScroll = useRef<number | null>(null);
  useEffect(() => {
    if (pendingScroll.current === null || !boards.length) return;
    const top = pendingScroll.current;
    pendingScroll.current = null;
    requestAnimationFrame(() => scroller.current?.scrollTo({ top }));
  }, [boards]);

  useEffect(init, [init]);

  // Search as you type, after a short pause.
  useEffect(() => {
    const t = setTimeout(() => setSearch(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  const load = async (reset: boolean) => {
    if (!supabase) return setLoading(false);
    const id = ++request.current;
    setLoading(true);
    setFailed(false);
    try {
      // Kept until a load that used it finishes: an effect re-run (sign-in settling, dev double-run) can cancel this one.
      const saved = restore.current;
      const back = reset && saved && saved.sort === sort && saved.type === type && saved.query === q ? saved : null;
      let page: GalleryBoard[];
      let full: boolean;
      if (back) {
        // The server sends at most 60 a request, so refill what was showing in steps.
        page = [];
        full = true;
        while (full && page.length < Math.max(GALLERY_PAGE_SIZE, back.count)) {
          const step = await fetchGalleryBoards({ type, search: q, sort, offset: page.length, limit: 60 });
          page.push(...step);
          full = step.length === 60;
        }
      } else {
        page = await fetchGalleryBoards({ type, search: q, sort, offset: reset ? 0 : boards.length });
        // One person's boards come in a single batch.
        full = !searchedUser(q) && page.length === GALLERY_PAGE_SIZE;
      }
      if (id !== request.current) return;
      setBoards((b) => (reset ? page : [...b, ...page]));
      setMore(full);
      if (back) {
        restore.current = null;
        pendingScroll.current = back.scroll;
      }
    } catch {
      if (id === request.current) setFailed(true);
    } finally {
      if (id === request.current) setLoading(false);
    }
  };

  // Waits for the session, so each board's heart shows whether this viewer likes it.
  useEffect(() => {
    if (!ready) return;
    setBoards([]);
    setMore(false);
    void load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, type, q, sort, user?.id]);

  // Load the next page when the bottom of the grid scrolls into view.
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !more || loading) return;
    const io = new IntersectionObserver((e) => e[0].isIntersecting && void load(false), { rootMargin: "600px" });
    io.observe(el);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [more, loading, boards]);

  const hide = async (b: GalleryBoard) => {
    await setGalleryHidden(b.id, true);
    setBoards((list) => list.filter((x) => x.id !== b.id));
    setHidden(b);
  };
  const undoHide = async () => {
    if (!hidden) return;
    await setGalleryHidden(hidden.id, false);
    setHidden(null);
    void load(true);
  };

  const toggleLike = async (b: GalleryBoard) => {
    if (!user) return setDialog("account");
    if (restriction.restricted) return setNote(moderationError("account_restricted", restriction.until));
    const liked = !b.liked;
    const patch = (fields: Partial<GalleryBoard>) => setBoards((list) => list.map((x) => (x.id === b.id ? { ...x, ...fields } : x)));
    // Show it right away, then settle on the server's count.
    patch({ liked, like_count: Math.max(0, b.like_count + (liked ? 1 : -1)) });
    try {
      patch({ liked, like_count: await setGalleryLike(b.id, liked) });
    } catch {
      patch({ liked: b.liked, like_count: b.like_count });
    }
  };

  const filtering = !!q.trim() || type !== null;

  // The playground locks page scrolling (body overflow: hidden), so this page scrolls inside its own container.
  return (
    <div ref={scroller} className="h-dvh overflow-y-auto overscroll-contain bg-page font-sans text-ink">
      {/* The same header as the playground. */}
      <PageHeader current="gallery" dialog={dialog} setDialog={setDialog} />

      {/* Opening a board saves this spot, so its "Back to Gallery" returns here. */}
      <main id="content"
        className="page-main isolate mx-auto max-w-[1600px] px-4 pb-16 pt-8"
        onClickCapture={(e) => {
          if (!(e.target as HTMLElement).closest('a[href^="/?p="]')) return;
          saveGalleryReturn({ sort, type, query: q, count: boards.length, scroll: scroller.current?.scrollTop ?? 0 });
        }}
      >
        <h1 className="text-2xl font-bold tracking-[-0.01em]">Gallery</h1>
        <p className="mt-1 text-sm text-ink-muted">Pedalboards shared by the community. Open one to look around or make it your own.</p>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
          <label className="relative block sm:w-72">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-icon" />
            <input
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                // Typing starts a new search over everyone's boards.
                setByUser(null);
              }}
              placeholder="Search boards or people"
              aria-label="Search the gallery"
              className="h-9 w-full rounded-control border border-chrome-line bg-surface pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-brand"
            />
          </label>
          {/* Scrolls sideways on phones. A scroller clips what's outside it, so it gets room around the chips for their
              shadows (padding, undone by negative margins so nothing moves); that room doesn't take clicks. */}
          <div
            className="pointer-events-none -mx-4 -my-1 flex gap-2 overflow-x-auto px-4 py-1 sm:-mx-1 sm:px-1 [&>*]:pointer-events-auto"
            role="group"
            aria-label="Board type"
          >
            <button type="button" className={chip(type === null)} aria-pressed={type === null} onClick={() => setType(null)}>
              All
            </button>
            {PLAYGROUND_TYPES.map(([t]) => (
              <button key={t} type="button" className={chip(type === t)} aria-pressed={type === t} onClick={() => setType(type === t ? null : t)}>
                {TYPE_LABELS[t]}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 self-start sm:ml-auto sm:self-auto">
          <div role="radiogroup" aria-label="Sort" className="flex shrink-0 rounded-control bg-soft p-0.5">
            {(
              [
                ["new", "Newest"],
                ["liked", "Most liked"],
              ] as const
            ).map(([v, label]) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={sort === v}
                onClick={() => setSort(v)}
                className={`h-7 rounded-inner px-2.5 text-xs font-semibold transition-colors ${sort === v ? "bg-surface text-ink" : "text-ink-muted hover:text-ink"}`}
              >
                {label}
              </button>
            ))}
          </div>
          <DensitySwitch value={density} onChange={setDensity} />
          </div>
        </div>

        {filteredUser && (
          <p className="mt-4 text-sm text-ink-muted">
            Boards by <span className="font-semibold text-ink">{filteredUser}</span>
            <button
              type="button"
              onClick={() => {
                setByUser(null);
                setQuery("");
                setSearch("");
              }}
              className="ml-3 font-semibold text-brand hover:underline"
            >
              Show everyone
            </button>
          </p>
        )}
        {note && (
          <div role="status" className="mt-5 flex items-center justify-between gap-3 rounded-panel bg-card px-3 py-2 text-[13px]">
            <span>{note}</span>
            <button type="button" className="text-ink-muted hover:text-ink" onClick={() => setNote(null)} aria-label="Dismiss">
              ×
            </button>
          </div>
        )}

        {hidden && (
          <div role="status" className="mt-5 flex items-center justify-between gap-3 rounded-panel bg-card px-3 py-2 text-[13px]">
            <span>
              Hid “{hidden.name}” from the gallery. Its share link still works.
            </span>
            <button type="button" className="font-semibold text-brand" onClick={() => void undoHide()}>
              Undo
            </button>
          </div>
        )}

        <div className={`mt-6 grid ${GRID[density]}`}>
          {boards.map((b) => (
            <BoardCard
              compact={density === "small"}
              key={b.id}
              board={b}
              onLike={() => void toggleLike(b)}
              onHide={editor ? () => void hide(b) : undefined}
              onUser={(name) => {
                setByUser(name);
                setQuery("");
                setSearch("");
                scroller.current?.scrollTo({ top: 0, behavior: "smooth" });
              }}
            />
          ))}
          {loading && Array.from({ length: boards.length ? 4 : 8 }, (_, i) => <CardSkeleton key={`s${i}`} />)}
        </div>
        <div ref={sentinel} />

        {!loading && failed && (
          <p className="mt-10 text-center text-sm text-ink-muted">
            The gallery didn't load.{" "}
            <button type="button" className="font-semibold text-brand" onClick={() => void load(boards.length === 0)}>
              Try again
            </button>
          </p>
        )}
        {!supabase && <p className="mt-10 text-center text-sm text-ink-muted">The gallery isn't available on this copy of the site.</p>}
        {!loading && !failed && supabase && boards.length === 0 && (
          <p className="mx-auto mt-12 max-w-sm text-center text-sm text-ink-muted">
            {filtering
              ? "No boards match. Try another search or type."
              : "No boards yet. To share yours, turn on Show in Public Gallery in its Playground Settings."}
          </p>
        )}
      </main>
    </div>
  );
}

function BoardCard({
  board,
  onLike,
  onHide,
  onUser,
  compact,
}: {
  board: GalleryBoard;
  onLike: () => void;
  onHide?: () => void;
  onUser: (username: string) => void;
  /** Small cards leave out the type tag and the description. */
  compact?: boolean;
}) {
  const pedals = board.pedal_count ? `${board.pedal_count} ${board.pedal_count === 1 ? "pedal" : "pedals"}` : null;
  const pill =
    "press relative z-10 flex h-7 items-center gap-1 rounded-full bg-surface/90 px-2.5 text-xs font-semibold shadow-chip backdrop-blur transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand";
  return (
    <article className="group relative flex flex-col overflow-hidden rounded-panel bg-card ring-chrome-line transition-shadow focus-within:ring-2 focus-within:ring-brand hover:ring-1">
      <div className="aspect-[8/5] w-full border-b border-chrome-line p-3">
        {board.thumbnail && <img src={board.thumbnail} alt="" loading="lazy" className="size-full object-contain" />}
      </div>
      <div className="flex flex-1 flex-col gap-1 px-3.5 pb-3.5 pt-3">
        <div className="flex items-start justify-between gap-2">
          {/* The whole card opens the board (the link stretches over it); the buttons on it sit above. */}
          <h2 className="line-clamp-1 text-sm font-semibold">
            <a href={boardUrl(board.slug)} className="outline-none after:absolute after:inset-0">
              {board.name}
            </a>
          </h2>
          {board.playground_type && !compact && (
            <span className="shrink-0 rounded-full bg-soft px-2 py-0.5 text-xs text-ink-muted">{TYPE_LABELS[board.playground_type]}</span>
          )}
        </div>
        {(board.username || pedals) && (
          <p className="flex items-center gap-2.5 text-xs text-ink-muted">
            {board.username && (
              <button
                type="button"
                onClick={() => onUser(board.username!)}
                {...tip(`Boards by ${board.username}`)}
                className={`relative z-10 rounded-inner font-medium outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-brand ${nameLink}`}
              >
                {board.username}
              </button>
            )}
            {teamRole(board.username) && (
              <span className="relative z-10 -ml-1.5 flex">
                <RoleBadges username={board.username} />
              </span>
            )}
            {pedals}
          </p>
        )}
        {board.description && !compact && <p className="mt-1 line-clamp-2 text-[13px] text-ink-muted">{board.description}</p>}
      </div>
      <div className="pointer-events-none absolute inset-x-2 top-0 flex aspect-[8/5] items-end justify-end gap-1.5 pb-2">
        {board.comment_count !== undefined && (
          <a
            href={`${boardUrl(board.slug)}#comments`}
            aria-label={`${board.comment_count} ${board.comment_count === 1 ? "comment" : "comments"} on ${board.name}`}
            {...tip("Comments")}
            className={`${pill} pointer-events-auto text-ink-muted hover:text-ink`}
          >
            <MessageCircle size={14} strokeWidth={2.25} />
            {board.comment_count > 0 && <span className="tabular-nums">{board.comment_count}</span>}
          </a>
        )}
        <button
          type="button"
          onClick={onLike}
          aria-pressed={board.liked}
          aria-label={`${board.liked ? "Unlike" : "Like"} ${board.name}, ${board.like_count} ${board.like_count === 1 ? "like" : "likes"}`}
          {...tip(board.liked ? "Unlike" : "Like")}
          className={`${pill} pointer-events-auto ${board.liked ? "text-danger" : "text-ink-muted hover:text-ink"}`}
        >
          <Heart size={14} fill={board.liked ? "currentColor" : "none"} strokeWidth={2.25} />
          {board.like_count > 0 && <span className="tabular-nums">{board.like_count}</span>}
        </button>
      </div>
      {onHide && (
        <button
          type="button"
          onClick={onHide}
          className="absolute right-2 top-2 z-10 rounded-control bg-surface/90 px-2 py-1 text-xs font-semibold text-danger opacity-0 shadow-chip transition-opacity focus:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100"
        >
          Hide
        </button>
      )}
    </article>
  );
}

function CardSkeleton() {
  return (
    <div className="overflow-hidden rounded-panel bg-card" aria-hidden>
      <div className="aspect-[8/5] w-full animate-pulse border-b border-chrome-line bg-surface-hover" />
      <div className="space-y-2 px-3.5 pb-4 pt-3">
        <div className="h-3.5 w-2/3 animate-pulse rounded-inner bg-surface-hover" />
        <div className="h-3 w-1/3 animate-pulse rounded-inner bg-surface-hover" />
      </div>
    </div>
  );
}
