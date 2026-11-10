import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { PLAYGROUND_TYPES, type PlaygroundSummary } from "../lib/cloud";
import { handoffHref } from "../lib/handoff";
import { trackPage } from "../lib/analytics";
import { supabase } from "../lib/supabase";
import { useHasBoards } from "../lib/useHasBoards";
import { PageHeader, type PageDialog } from "../components/PageHeader";
import { LabeledSelect } from "../components/LabeledSelect";
import { DensitySwitch, useDensity, type Density } from "../components/DensitySwitch";
import { Meta } from "../components/Meta";
import { tip } from "../components/Tooltip";
import { useAuth } from "../store/auth";
import { useCloud } from "../store/cloud";
import { useBoardAllowance } from "../store/billing";

/** The same columns per card size as the Gallery, so the two pages' cards match. */
const GRID: Record<Density, string> = {
  large: "grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4",
  medium: "grid-cols-1 gap-4 min-[480px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5",
  small: "grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6",
};

const chip = (on: boolean) =>
  `press h-8 shrink-0 rounded-full px-3 text-[13px] font-semibold transition-colors ${on ? "bg-ink text-surface" : "bg-surface text-ink-muted shadow-chip hover:text-ink"}`;

type Sort = "edited" | "new" | "name";
type Show = "all" | "private" | "shared" | "gallery";

const SHOW: [Show, string][] = [
  ["all", "All"],
  ["private", "Private"],
  ["shared", "Shared"],
  ["gallery", "In Gallery"],
];

const TYPE_LABELS = Object.fromEntries(PLAYGROUND_TYPES) as Record<string, string>;

/** Who can see a board: in the Gallery, shared by link, or just you. */
const status = (p: PlaygroundSummary): Show => (p.in_gallery ? "gallery" : p.is_public ? "shared" : "private");

/** "Edited Oct 27", or with the year once it's not this year (same as the My Boards menu). */
function edited(iso: string) {
  const d = new Date(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return `Edited ${d.toLocaleDateString(undefined, { month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) })}`;
}

const readUrl = () => {
  const p = new URLSearchParams(window.location.search);
  const sort = p.get("sort");
  const show = p.get("show");
  return {
    sort: (sort === "new" || sort === "name" ? sort : "edited") as Sort,
    show: (SHOW.some(([v]) => v === show) ? show : "all") as Show,
    query: p.get("q") ?? "",
  };
};

function boardsHref(f: { sort: Sort; show: Show; query: string }) {
  const p = new URLSearchParams();
  if (f.show !== "all") p.set("show", f.show);
  if (f.sort !== "edited") p.set("sort", f.sort);
  if (f.query.trim()) p.set("q", f.query.trim());
  const qs = p.toString();
  return `${window.location.pathname}${qs ? `?${qs}` : ""}`;
}

/** My Boards at /boards/: the signed-in person's own boards, laid out like the Gallery. */
export function BoardsApp() {
  useEffect(() => trackPage("My Boards"), []);
  const init = useAuth((s) => s.init);
  const ready = useAuth((s) => s.ready);
  const user = useAuth((s) => s.user);
  const cloudEnabled = useAuth((s) => s.cloudEnabled);
  const { list, cloudId, refreshList, remove } = useCloud();
  const hasLocalBoard = useHasBoards();
  /** Free plan: "2/4" saved boards. */
  const allowance = useBoardAllowance(user ? list.length : 0);
  const [dialog, setDialog] = useState<PageDialog>(null);
  const [initial] = useState(readUrl);
  const [sort, setSort] = useState<Sort>(initial.sort);
  const [show, setShow] = useState<Show>(initial.show);
  const [query, setQuery] = useState(initial.query);
  const [density, setDensity] = useDensity("boards");
  /** Which account the list was last loaded for (undefined: not loaded yet). */
  const [loadedFor, setLoadedFor] = useState<string | null | undefined>(undefined);
  const [failed, setFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(init, [init]);

  useEffect(() => {
    if (!ready) return;
    let live = true;
    setFailed(false);
    void refreshList().then(() => {
      if (!live) return;
      setFailed(!!user && !!useCloud.getState().error && useCloud.getState().list.length === 0);
      setLoadedFor(user?.id ?? null);
    });
    return () => {
      live = false;
    };
  }, [ready, user?.id, refreshList]);
  const loading = !ready || (!!user && loadedFor !== user.id);

  // Filters live in the address, so Back steps through them; typing only updates it.
  const lastView = useRef<{ sort: Sort; show: Show } | null>(null);
  useEffect(() => {
    const href = boardsHref({ sort, show, query });
    const prev = lastView.current;
    lastView.current = { sort, show };
    if (href === window.location.pathname + window.location.search) return;
    if (prev && (prev.sort !== sort || prev.show !== show)) history.pushState(null, "", href);
    else history.replaceState(null, "", href);
  }, [sort, show, query]);
  useEffect(() => {
    const onPop = () => {
      const f = readUrl();
      setSort(f.sort);
      setShow(f.show);
      setQuery(f.query);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const mine = user ? list : [];
  const boards = useMemo(() => {
    const q = query.trim().toLowerCase();
    const shown = mine.filter((p) => (show === "all" || status(p) === show) && (!q || p.name.toLowerCase().includes(q)));
    if (sort === "name") return [...shown].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
    if (sort === "new") return [...shown].sort((a, b) => (b.created_at ?? b.updated_at).localeCompare(a.created_at ?? a.updated_at));
    return shown; // the list comes newest edit first
  }, [mine, show, query, sort]);

  const deleteBoard = async (p: PlaygroundSummary) => {
    const open = p.id === cloudId ? " It's open on the playground, so the canvas there will be cleared." : "";
    if (!window.confirm(`Delete "${p.name}"? This can't be undone.${open}`)) return;
    setError(null);
    try {
      await remove(p.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete that playground.");
    }
  };

  const signedOut = ready && !user;
  const filtering = !!query.trim() || show !== "all";

  // The playground locks page scrolling (body overflow: hidden), so this page scrolls inside its own container.
  return (
    <div className="h-dvh overflow-y-auto overscroll-contain bg-page font-sans text-ink">
      <PageHeader current="boards" dialog={dialog} setDialog={setDialog} />

      <main id="content" className="page-main isolate mx-auto max-w-[1600px] px-4 pb-16 pt-8">
        {/* No hero here (Trav, 2026-11-10): the heading with your count, then search and New Playground. */}
        <header className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <h1 className="flex items-baseline gap-2.5 text-[28px] font-bold leading-tight tracking-[-0.02em]">
            My Boards
            {/* Filtered: how many match. Otherwise the free plan's "2/4", or just the count. */}
            {!loading && mine.length > 0 && (
              <span className="text-base font-medium tabular-nums tracking-normal text-ink-muted" {...(!filtering && allowance ? tip("Saved boards on the Free plan") : {})}>
                {filtering ? boards.length : (allowance ?? mine.length)}
              </span>
            )}
          </h1>
          <div className="ml-auto flex w-full items-center gap-2.5 sm:w-auto">
            {!signedOut && mine.length > 0 && (
              // On the page itself, so a white field with a hairline (see Form backgrounds in docs/ui-conventions.md).
              <label className="relative block min-w-0 flex-1 sm:w-64 sm:flex-none">
                <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-icon" />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search your boards"
                  aria-label="Search your boards"
                  className="h-9 w-full rounded-control border border-chrome-line bg-surface pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-brand"
                />
              </label>
            )}
            <a
              href={user ? handoffHref({ kind: "new" }) : "/"}
              className="btn-primary press flex h-9 shrink-0 items-center gap-1.5 rounded-control px-3.5 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-brand max-sm:ml-auto"
            >
              <Plus size={16} strokeWidth={2.5} />
              {user ? "New Playground" : "Start Building"}
            </a>
          </div>
        </header>

        {signedOut ? (
          <div className="mx-auto mt-16 flex max-w-sm flex-col items-center text-center">
            <h2 className="text-lg font-bold tracking-[-0.01em]">Sign in to see your boards</h2>
            <p className="mt-1.5 text-sm text-ink-muted">
              {cloudEnabled
                ? "Boards you save to your account show up here. Signed out, your board stays in this browser."
                : "Saving boards to an account isn't available on this copy of the site."}
            </p>
            <div className="mt-5 flex items-center gap-2.5">
              {cloudEnabled && (
                <>
                  <button type="button" onClick={() => setDialog("account")} className="btn-primary press h-9 rounded-control px-4 text-sm font-semibold">
                    Sign In
                  </button>
                  <button
                    type="button"
                    onClick={() => setDialog("register")}
                    className="press h-9 rounded-control bg-soft px-4 text-sm font-semibold text-ink hover:bg-soft-hover active:bg-soft-active"
                  >
                    Create Account
                  </button>
                </>
              )}
            </div>
            {hasLocalBoard && (
              <a href="/" className="mt-4 text-sm font-semibold text-brand hover:underline">
                Open the board in this browser
              </a>
            )}
          </div>
        ) : (
          <>
            {/* Who can see it, then sort and card size (like the Gallery's bar). Hidden with no boards. */}
            <div className={`mt-6 ${!loading && mine.length === 0 ? "hidden" : "flex"} flex-wrap items-center gap-x-4 gap-y-3`}>
              <div
                className="pointer-events-none -mx-4 -my-1 flex gap-2 overflow-x-auto px-4 py-1 max-sm:order-last max-sm:basis-[calc(100%+2rem)] sm:-mx-1 sm:px-1 [&>*]:pointer-events-auto"
                role="group"
                aria-label="Who can see it"
              >
                {SHOW.map(([v, label]) => (
                  <button key={v} type="button" className={chip(show === v)} aria-pressed={show === v} onClick={() => setShow(v === show && v !== "all" ? "all" : v)}>
                    {label}
                  </button>
                ))}
              </div>
              <div className="ml-auto flex items-center gap-6">
                <LabeledSelect
                  label="Sort by"
                  value={sort}
                  options={[
                    ["edited", "Last edited"],
                    ["new", "Newest"],
                    ["name", "Name"],
                  ]}
                  onChange={setSort}
                />
                <DensitySwitch value={density} onChange={setDensity} />
              </div>
            </div>

            {error && (
              <div role="status" className="mt-5 flex items-center justify-between gap-3 rounded-panel bg-card px-3 py-2 text-[13px]">
                <span>{error}</span>
                <button type="button" className="text-ink-muted hover:text-ink" onClick={() => setError(null)} aria-label="Dismiss">
                  ×
                </button>
              </div>
            )}

            <div className={`mt-6 grid ${GRID[density]}`}>
              {!loading &&
                boards.map((p) => (
                  <BoardCard key={p.id} board={p} open={p.id === cloudId} compact={density === "small"} onDelete={() => void deleteBoard(p)} />
                ))}
              {loading && Array.from({ length: 8 }, (_, i) => <CardSkeleton key={i} />)}
            </div>

            {!loading && failed && (
              <p className="mt-10 text-center text-sm text-ink-muted">
                Your boards didn't load.{" "}
                <button
                  type="button"
                  className="font-semibold text-brand"
                  onClick={() => {
                    setLoadedFor(undefined);
                    void refreshList().then(() => {
                      setFailed(!!useCloud.getState().error && useCloud.getState().list.length === 0);
                      setLoadedFor(user?.id ?? null);
                    });
                  }}
                >
                  Try again
                </button>
              </p>
            )}
            {!supabase && <p className="mt-10 text-center text-sm text-ink-muted">Saved boards aren't available on this copy of the site.</p>}
            {!loading && !failed && supabase && boards.length === 0 && (
              <div className="mx-auto mt-12 flex max-w-sm flex-col items-center text-center">
                {filtering && mine.length > 0 ? (
                  <p className="text-sm text-ink-muted">No boards match. Try another search or filter.</p>
                ) : (
                  <>
                    <h2 className="text-lg font-bold tracking-[-0.01em]">No boards yet</h2>
                    <p className="mt-1.5 text-sm text-ink-muted">Start one and it saves here as you build.</p>
                    <a
                      href={handoffHref({ kind: "new" })}
                      className="btn-primary press mt-5 flex h-9 items-center gap-1.5 rounded-control px-4 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-brand"
                    >
                      <Plus size={16} strokeWidth={2.5} />
                      New Playground
                    </a>
                  </>
                )}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

/** A card's small icon button over the photo (the Gallery's Report and Hide use the same). */
const cardAction =
  "flex size-6 items-center justify-center rounded-control outline-none hover:bg-soft focus-visible:ring-2 focus-visible:ring-brand";

/** One of your boards, drawn like a Gallery card: photo, name, then when it was edited and who can see it. */
function BoardCard({ board, open, compact, onDelete }: { board: PlaygroundSummary; open: boolean; compact?: boolean; onDelete: () => void }) {
  const seen = status(board);
  const type = board.playground_type ? TYPE_LABELS[board.playground_type] : null;
  return (
    <article className="group relative flex flex-col overflow-hidden rounded-panel bg-card transition-colors hover:bg-card-hover focus-within:ring-2 focus-within:ring-brand">
      <div className="aspect-[8/5] w-full shrink-0 border-b border-chrome-line p-3">
        {board.thumbnail && <img src={board.thumbnail} alt="" loading="lazy" className="size-full object-contain" />}
      </div>
      <div className="flex flex-1 flex-col gap-1 px-3.5 pb-3.5 pt-3">
        <div className="flex items-start justify-between gap-2">
          {/* The whole card opens the board on the playground (the link stretches over it); the buttons sit above. */}
          <h2 className="line-clamp-1 text-sm font-semibold">
            <a href={handoffHref({ kind: "open", id: board.id })} className="outline-none after:absolute after:inset-0">
              {board.name}
            </a>
          </h2>
          {seen !== "private" && (
            <span className="shrink-0 text-xs font-medium text-ink-muted">{seen === "gallery" ? "In Gallery" : "Shared"}</span>
          )}
        </div>
        <div className="truncate text-xs text-ink-muted">
          <Meta parts={[open ? "Open now" : edited(board.updated_at), !compact && type]} />
        </div>
      </div>
      {/* Small icon buttons in the photo's top right corner, shown on hover (always on touch screens). */}
      <span className="absolute right-1.5 top-1.5 z-10 flex gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100">
        <a
          href={handoffHref({ kind: "edit", id: board.id })}
          aria-label={`Settings for ${board.name}`}
          {...tip("Playground Settings")}
          className={`${cardAction} text-icon hover:text-ink`}
        >
          <Pencil size={13} strokeWidth={2} />
        </a>
        <button type="button" onClick={onDelete} aria-label={`Delete ${board.name}`} {...tip("Delete")} className={`${cardAction} text-danger`}>
          <Trash2 size={13} strokeWidth={2} />
        </button>
      </span>
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
