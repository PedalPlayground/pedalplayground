import { EyeOff, Flag, Heart, MessageCircle, Plus, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { fetchShared, PLAYGROUND_TYPES, type PlaygroundType } from "../lib/cloud";
import { boardUrl, fetchGalleryBoards, searchedUser, GALLERY_PAGE_SIZE, readGalleryReturn, saveGalleryReturn, setGalleryHidden, setGalleryLike, type GalleryBoard, type GallerySort } from "../lib/gallery";
import { supabase } from "../lib/supabase";
import { drawLayout } from "../lib/thumbnail";
import { PageHeader, type PageDialog } from "../components/PageHeader";
import { ReportDialog } from "../components/ReportDialog";
import { useIsModerator } from "../lib/useIsEditor";
import { moderationError } from "../lib/moderation";
import { useRestriction } from "../store/standing";
import { useAuth } from "../store/auth";
import { tip } from "../components/Tooltip";
import { RoleBadges, teamRole, nameLink } from "../components/RoleBadge";
import { LabeledSelect } from "../components/LabeledSelect";
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

/** Explore's filters from its address. Missing means not set (the saved spot or the default applies). */
function readGalleryUrl(): { type?: PlaygroundType | null; sort?: GallerySort; user: string | null; query?: string } {
  const p = new URLSearchParams(window.location.search);
  const t = p.get("type");
  const sort = p.get("sort");
  return {
    type: t && PLAYGROUND_TYPES.some(([v]) => v === t) ? (t as PlaygroundType) : undefined,
    sort: sort === "liked" || sort === "new" ? sort : undefined,
    user: p.get("user"),
    query: p.get("q") ?? undefined,
  };
}

function galleryHref(f: { type: PlaygroundType | null; sort: GallerySort; user: string | null; query: string }) {
  const p = new URLSearchParams();
  if (f.user) p.set("user", f.user);
  if (f.type) p.set("type", f.type);
  if (f.sort !== "new") p.set("sort", f.sort);
  if (f.query.trim()) p.set("q", f.query.trim());
  const qs = p.toString();
  return `${window.location.pathname}${qs ? `?${qs}` : ""}`;
}

/** The public gallery at /gallery/: boards whose owners turned on "Show in Public Gallery", newest or most liked first. */
export function GalleryApp() {
  /** Coming back from a board: start where you left off (read once). */
  const [returning] = useState(() => readGalleryReturn(true));
  /** Filters in this page's address (?type, ?sort, ?user, ?q), which win over the saved spot. */
  const [fromUrl] = useState(readGalleryUrl);
  const init = useAuth((s) => s.init);
  const user = useAuth((s) => s.user);
  const ready = useAuth((s) => s.ready);
  const myName = useAuth((s) => s.username);
  /** The board being reported, while the Report dialog is open. */
  const [reporting, setReporting] = useState<GalleryBoard | null>(null);
  const [sort, setSort] = useState<GallerySort>(fromUrl.sort ?? returning?.sort ?? "new");
  /** A short message over the boards (e.g. likes are off during a timeout). */
  const [note, setNote] = useState<string | null>(null);
  const restriction = useRestriction();
  /** The header's account dialogs; liking while signed out opens sign-in too. */
  const [dialog, setDialog] = useState<PageDialog>(null);
  const [type, setType] = useState<PlaygroundType | null>(fromUrl.type !== undefined ? fromUrl.type : (returning?.type ?? null));
  // ?user=name (a username link) opens the gallery filtered to that person's boards.
  const [linkedUser] = useState(() => fromUrl.user);
  /** One person's boards (from a username link), kept apart from the search box so the box stays empty. */
  const [byUser, setByUser] = useState<string | null>(() => linkedUser ?? searchedUser(returning?.query ?? ""));
  const typed = fromUrl.query ?? (linkedUser || searchedUser(returning?.query ?? "") ? "" : (returning?.query ?? ""));
  const [query, setQuery] = useState(typed);
  const [search, setSearch] = useState(typed);
  /** What the gallery is filtered by: the person, or what's typed ("@name" typed still works). */
  const q = byUser ? `@${byUser}` : search;
  const filteredUser = byUser ?? searchedUser(search);
  const [boards, setBoards] = useState<GalleryBoard[]>([]);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [failed, setFailed] = useState(false);
  // Moderators (and editors) can hide boards from the Gallery.
  const editor = useIsModerator();
  const [density, setDensity] = useDensity("gallery");
  /** The most liked board, drawn big in the hero. */
  const [heroBoard, setHeroBoard] = useState<GalleryBoard | null>(null);
  useEffect(() => {
    if (!supabase) return;
    void fetchGalleryBoards({ type: null, search: "", sort: "liked", offset: 0, limit: 1 }).then(
      (b) => setHeroBoard(b[0] ?? null),
      () => undefined,
    );
  }, []);
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

  // The filters live in the address, so Back and Forward step through them. A new type, sort or person is a new
  // history step; typing in the search just updates the address.
  const lastView = useRef<{ type: PlaygroundType | null; sort: GallerySort; byUser: string | null } | null>(null);
  useEffect(() => {
    const href = galleryHref({ type, sort, user: byUser, query: search });
    const prev = lastView.current;
    lastView.current = { type, sort, byUser };
    if (href === window.location.pathname + window.location.search) return;
    const sameView = prev && prev.type === type && prev.sort === sort && prev.byUser === byUser;
    if (prev && !sameView) history.pushState(null, "", href);
    else history.replaceState(null, "", href);
  }, [type, sort, byUser, search]);
  useEffect(() => {
    const onPop = () => {
      const f = readGalleryUrl();
      setType(f.type ?? null);
      setSort(f.sort ?? "new");
      setByUser(f.user);
      setQuery(f.query ?? "");
      setSearch(f.query ?? "");
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

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
      {reporting && <ReportDialog kind="board" target={reporting.id} what={reporting.name} onClose={() => setReporting(null)} />}

      {/* Opening a board saves this spot, so its "Back to Gallery" returns here. */}
      <main id="content"
        className="page-main isolate mx-auto max-w-[1600px] px-4 pb-16 pt-8"
        onClickCapture={(e) => {
          if (!(e.target as HTMLElement).closest('a[href^="/?p="]')) return;
          saveGalleryReturn({ sort, type, query: q, count: boards.length, scroll: scroller.current?.scrollTop ?? 0 });
        }}
      >
        {/* The top of the page, like Gear's: a compact hero band with the heading and a big search, and a few of the
            most liked board drawn big off its right edge (laptops and up). */}
        <header className="relative isolate overflow-hidden rounded-container bg-[color-mix(in_srgb,var(--color-brand)_9%,var(--color-card))] px-5 py-6 sm:px-8 sm:py-8">
          <div className="relative z-10 max-w-xl">
            <h1 className="text-[28px] font-bold leading-tight tracking-[-0.02em] sm:text-3xl">Gallery</h1>
            <p className="mt-1.5 text-sm text-ink-muted">Pedalboards shared by the community. Open one to look around or make it your own.</p>
            {/* The pitch: build your own, or find boards. */}
            <div className="mt-5 flex w-full max-w-lg flex-wrap items-center gap-2.5">
            <a
              href="/"
              className="btn-primary press flex h-11 shrink-0 items-center gap-1.5 rounded-control px-4 text-[15px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <Plus size={18} strokeWidth={2.5} />
              Start Building
            </a>
            <label className="relative block min-w-[12rem] flex-1">
              <Search size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-icon" />
              <input
                type="search"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  // Typing starts a new search over everyone's boards.
                  setByUser(null);
                }}
                placeholder="Search boards or people"
                aria-label="Search boards or people"
                className="h-11 w-full rounded-control bg-surface pl-10 pr-3 text-[15px] outline-none focus:ring-2 focus:ring-brand"
              />
            </label>
            </div>
          </div>
          {heroBoard && <HeroBoard board={heroBoard} />}
        </header>

        {/* What's listed, the board types, then sort and card size, across the full width (like Gear's bar). */}
        <div className="mt-10 flex flex-wrap items-center gap-x-4 gap-y-3">
          <h2 className="text-lg font-bold tracking-[-0.01em]">{type ? `${TYPE_LABELS[type]} boards` : filteredUser ? "Their boards" : search.trim() ? "Results" : "All boards"}</h2>
          {/* Scrolls sideways on phones. A scroller clips what's outside it, so it gets room around the chips for their
              shadows (padding, undone by negative margins so nothing moves); that room doesn't take clicks. */}
          <div
            className="pointer-events-none -mx-4 -my-1 flex gap-2 overflow-x-auto px-4 py-1 max-sm:order-last max-sm:basis-[calc(100%+2rem)] sm:-mx-1 sm:px-1 [&>*]:pointer-events-auto"
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
          <div className="ml-auto flex items-center gap-6">
            <LabeledSelect
              label="Sort by"
              value={sort}
              options={[
                ["new", "Newest"],
                ["liked", "Most liked"],
              ]}
              onChange={setSort}
            />
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
              // Anyone can report someone else's board; signed out, it asks them to sign in first.
              onReport={b.username && b.username === myName ? undefined : () => (user ? setReporting(b) : setDialog("account"))}
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

/** A card's small icon button over the photo (Report, Hide). */
const cardAction =
  "flex size-6 items-center justify-center rounded-control outline-none hover:bg-soft focus-visible:ring-2 focus-visible:ring-brand";

function BoardCard({
  board,
  onLike,
  onHide,
  onReport,
  onUser,
  compact,
}: {
  board: GalleryBoard;
  onLike: () => void;
  onHide?: () => void;
  onReport?: () => void;
  onUser: (username: string) => void;
  /** Small cards leave out the type tag and the description. */
  compact?: boolean;
}) {
  const pedals = board.pedal_count ? `${board.pedal_count} ${board.pedal_count === 1 ? "pedal" : "pedals"}` : null;
  /** Comments and likes: a bare icon and count in the meta row, like Gear's new and hot marks (no pill). */
  const count =
    "press relative z-10 -mx-1 flex items-center gap-1 rounded-inner px-1 py-0.5 text-xs font-medium tabular-nums outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand";
  return (
    <article className="group relative flex flex-col overflow-hidden rounded-panel bg-card transition-colors hover:bg-card-hover focus-within:ring-2 focus-within:ring-brand">
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
          {/* Likes, and comments when there are any, where the type tag used to be. */}
          <span className="flex shrink-0 items-center gap-3 text-ink-muted">
            {!!board.comment_count && (
              <a
                href={`${boardUrl(board.slug)}#comments`}
                aria-label={`${board.comment_count} ${board.comment_count === 1 ? "comment" : "comments"} on ${board.name}`}
                {...tip("Comments")}
                className={`${count} hover:text-ink`}
              >
                <MessageCircle size={13} strokeWidth={2.25} />
                {board.comment_count}
              </a>
            )}
            <button
              type="button"
              onClick={onLike}
              aria-pressed={board.liked}
              aria-label={`${board.liked ? "Unlike" : "Like"} ${board.name}, ${board.like_count} ${board.like_count === 1 ? "like" : "likes"}`}
              {...tip(board.liked ? "Unlike" : "Like")}
              className={`${count} ${board.liked ? "text-danger" : "hover:text-ink"}`}
            >
              <Heart size={13} fill={board.liked ? "currentColor" : "none"} strokeWidth={2.25} />
              {board.like_count > 0 && board.like_count}
            </button>
                    </span>
        </div>
        <div className="flex items-center gap-2.5 text-xs text-ink-muted">
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
        </div>
        {board.description && !compact && <p className="mt-1 line-clamp-2 text-[13px] text-ink-muted">{board.description}</p>}
      </div>
      {(onHide || onReport) && (
        // Small icon buttons in the photo's top right corner, shown on hover (always on touch screens).
        <span className="absolute right-1.5 top-1.5 z-10 flex gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100">
          {onHide && (
            <button type="button" onClick={onHide} aria-label="Hide from the Gallery" {...tip("Hide from the Gallery")} className={`${cardAction} text-danger`}>
              <EyeOff size={13} strokeWidth={2} />
            </button>
          )}
          {onReport && (
            <button type="button" onClick={onReport} aria-label="Report Board" {...tip("Report Board")} className={`${cardAction} text-icon hover:text-ink`}>
              <Flag size={13} strokeWidth={2} />
            </button>
          )}
        </span>
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

/** The hero's picture: the most liked board drawn large from its layout, cropped by the band's right and bottom edges. */
function HeroBoard({ board }: { board: GalleryBoard }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    let live = true;
    void fetchShared(board.slug)
      .then(async (pg) => {
        const el = canvas.current;
        if (!live || !pg || !el) return;
        await drawLayout(el, pg.doc.items);
        if (live) setDrawn(true);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [board.slug]);
  return (
    <div className="absolute inset-y-0 right-0 hidden w-[46%] lg:block">
      <canvas
        ref={canvas}
        width={1600}
        height={1000}
        aria-hidden
        className={`absolute -right-[4%] top-6 w-full drop-shadow-[0_10px_24px_rgb(16_18_27/0.22)] transition-opacity duration-500 ${drawn ? "opacity-100" : "opacity-0"}`}
      />
      {drawn && (
        <a
          href={boardUrl(board.slug)}
          className="absolute bottom-4 right-4 z-10 flex max-w-[80%] items-center gap-1.5 rounded-full bg-surface px-3 py-1.5 text-xs shadow-chip outline-none hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-brand"
        >
          <Heart size={12} strokeWidth={2.5} className="shrink-0 text-brand" />
          <span className="shrink-0 text-ink-muted">Most liked</span>
          <span className="truncate font-semibold">{board.name}</span>
        </a>
      )}
    </div>
  );
}
