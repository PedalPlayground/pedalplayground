import { Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Logo } from "../components/Logo";
import { PLAYGROUND_TYPES, type PlaygroundType } from "../lib/cloud";
import { isEditor } from "../lib/editorApi";
import { boardUrl, fetchGalleryBoards, GALLERY_PAGE_SIZE, setGalleryHidden, type GalleryBoard } from "../lib/gallery";
import { supabase } from "../lib/supabase";
import { useAuth } from "../store/auth";
import { useCatalog } from "../store/catalog";

const TYPE_LABELS: Record<PlaygroundType, string> = {
  guitar: "Guitar",
  bass: "Bass",
  synth: "Synth",
  collection: "Collection",
  other: "Other",
};

const chip = (on: boolean) =>
  `press h-8 shrink-0 rounded-full px-3 text-[13px] font-semibold transition-colors ${on ? "bg-ink text-surface" : "bg-surface text-ink-muted shadow-panel hover:text-ink"}`;

/** The public gallery at /gallery/: boards whose owners turned on "Show in Public Gallery", newest first. */
export function GalleryApp() {
  const init = useAuth((s) => s.init);
  const user = useAuth((s) => s.user);
  const [type, setType] = useState<PlaygroundType | null>(null);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [boards, setBoards] = useState<GalleryBoard[]>([]);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [failed, setFailed] = useState(false);
  const [editor, setEditor] = useState(false);
  const [hidden, setHidden] = useState<GalleryBoard | null>(null);
  const request = useRef(0);
  const sentinel = useRef<HTMLDivElement>(null);

  useEffect(init, [init]);
  useEffect(() => void useCatalog.getState().load(), []);
  useEffect(() => {
    if (!user) return setEditor(false);
    isEditor().then(setEditor, () => setEditor(false));
  }, [user]);

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
      const page = await fetchGalleryBoards({ type, search, after: reset ? undefined : boards[boards.length - 1] });
      if (id !== request.current) return;
      setBoards((b) => (reset ? page : [...b, ...page]));
      setMore(page.length === GALLERY_PAGE_SIZE);
    } catch {
      if (id === request.current) setFailed(true);
    } finally {
      if (id === request.current) setLoading(false);
    }
  };

  useEffect(() => {
    setBoards([]);
    setMore(false);
    void load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, search]);

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

  const filtering = !!search.trim() || type !== null;

  return (
    <div className="min-h-dvh bg-chrome font-sans text-ink">
      <header className="sticky top-0 z-10 border-b border-chrome-line bg-chrome/95 backdrop-blur">
        <div className="mx-auto flex h-12 max-w-6xl items-center gap-3 px-4">
          <a href="/" aria-label="Pedal Playground" className="shrink-0">
            <Logo />
          </a>
          <a href="/" className="btn-primary ml-auto inline-flex h-9 items-center rounded-control px-3 text-sm">
            Open Playground
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-16 pt-8">
        <h1 className="text-2xl font-bold tracking-[-0.01em]">Gallery</h1>
        <p className="mt-1 text-sm text-ink-muted">Pedalboards shared by the community. Open one to look around, or make your own copy.</p>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
          <label className="relative block sm:w-72">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-icon" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search boards or people"
              aria-label="Search the gallery"
              className="h-9 w-full rounded-control border border-line bg-surface pl-9 pr-3 text-sm outline-none focus:border-brand"
            />
          </label>
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0 sm:pb-0" role="group" aria-label="Board type">
            <button type="button" className={chip(type === null)} aria-pressed={type === null} onClick={() => setType(null)}>
              All
            </button>
            {PLAYGROUND_TYPES.map(([t]) => (
              <button key={t} type="button" className={chip(type === t)} aria-pressed={type === t} onClick={() => setType(type === t ? null : t)}>
                {TYPE_LABELS[t]}
              </button>
            ))}
          </div>
        </div>

        {hidden && (
          <div role="status" className="mt-5 flex items-center justify-between gap-3 rounded-lg border border-line bg-surface px-3 py-2 text-[13px]">
            <span>
              Hid “{hidden.name}” from the gallery. Its share link still works.
            </span>
            <button type="button" className="font-semibold text-brand" onClick={() => void undoHide()}>
              Undo
            </button>
          </div>
        )}

        <div className="mt-6 grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
          {boards.map((b) => (
            <BoardCard key={b.id} board={b} onHide={editor ? () => void hide(b) : undefined} />
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
              : "No boards here yet. Add yours from the playground: open Edit Playground and turn on Show in Public Gallery."}
          </p>
        )}
      </main>
    </div>
  );
}

function BoardCard({ board, onHide }: { board: GalleryBoard; onHide?: () => void }) {
  const meta = [
    board.username ? `@${board.username}` : null,
    board.pedal_count ? `${board.pedal_count} ${board.pedal_count === 1 ? "pedal" : "pedals"}` : null,
  ].filter(Boolean);
  return (
    <article className="group relative flex flex-col overflow-hidden rounded-panel bg-surface shadow-panel transition-shadow hover:shadow-[0_8px_28px_rgb(16_18_27/0.14),0_0_0_1px_rgb(16_18_27/0.05)]">
      <a href={boardUrl(board.slug)} className="flex flex-1 flex-col outline-none focus-visible:ring-2 focus-visible:ring-brand">
        <div className="aspect-[8/5] w-full bg-canvas">
          {board.thumbnail && <img src={board.thumbnail} alt="" loading="lazy" className="size-full object-contain" />}
        </div>
        <div className="flex flex-1 flex-col gap-1 px-3.5 pb-3.5 pt-3">
          <div className="flex items-start justify-between gap-2">
            <h2 className="line-clamp-1 text-sm font-semibold">{board.name}</h2>
            {board.playground_type && (
              <span className="shrink-0 rounded-full bg-surface-hover px-2 py-0.5 text-xs text-ink-muted">{TYPE_LABELS[board.playground_type]}</span>
            )}
          </div>
          {meta.length > 0 && <p className="text-xs text-ink-muted">{meta.join(" · ")}</p>}
          {board.description && <p className="mt-1 line-clamp-2 text-[13px] text-ink-muted">{board.description}</p>}
        </div>
      </a>
      {onHide && (
        <button
          type="button"
          onClick={onHide}
          className="absolute right-2 top-2 rounded-control bg-surface/90 px-2 py-1 text-xs font-semibold text-danger opacity-0 shadow-panel transition-opacity focus:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100"
        >
          Hide
        </button>
      )}
    </article>
  );
}

function CardSkeleton() {
  return (
    <div className="overflow-hidden rounded-panel bg-surface shadow-panel" aria-hidden>
      <div className="aspect-[8/5] w-full animate-pulse bg-surface-hover" />
      <div className="space-y-2 px-3.5 pb-4 pt-3">
        <div className="h-3.5 w-2/3 animate-pulse rounded bg-surface-hover" />
        <div className="h-3 w-1/3 animate-pulse rounded bg-surface-hover" />
      </div>
    </div>
  );
}
