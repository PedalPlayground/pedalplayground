import { Check, CornerDownLeft, Flame, Plus, Search, Sparkles, X } from "lucide-react";
import { tip } from "./Tooltip";
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
import { PHONE_QUERY, useMediaQuery, useVisualViewport } from "../lib/viewport";
import { thumbUrl, type Kind } from "../lib/catalog";
import { indexItem, search } from "../lib/search";
import { sizeClass, type SizeClass } from "../lib/sizes";
import { formatSize } from "../lib/units";
import type { CatalogItem } from "../lib/types";
import { useCatalog } from "../store/catalog";
import { CustomItemForm } from "./CustomItemForm";
import { usePlayground } from "../store/playground";
import { useUi } from "../store/ui";
import { plainField } from "../lib/inputProps";
import { PX_PER_INCH } from "../lib/geometry";
import { templateInfo, type PedalTemplate } from "../lib/pedalTemplates";
import { PedalArt } from "./PedalArt";
import { FEATURED_PEDALS } from "../lib/featuredPedals";
import { fetchTrending, recordGearAdd, type TrendingEntry } from "../lib/trending";

type Feed = "trending" | "new";
const FEED_KEY = "pp:gear-feed";
/** How many items Trending and What's New show. */
const FEED_SIZE = 30;
const savedFeed = (): Feed => {
  try {
    return localStorage.getItem(FEED_KEY) === "new" ? "new" : "trending";
  } catch {
    return "trending";
  }
};

/** One catalog product with its kind, so pedals and pedalboards can share a list. */
interface Entry {
  /** Unique within the list, for React keys. Names alone aren't: the catalog has a few repeated entries. */
  id: number;
  kind: Kind;
  item: CatalogItem;
  brand: string;
  name: string;
}

/** Rows rendered at once; more than this asks for a narrower search. */
const MAX_RESULTS = 60;

/** How far (px) a drag down on the drawer's handle has to go before letting go closes it. */
const SWIPE_CLOSE = 80;
/** Or how fast (px per ms) a flick has to be. */
const FLICK_CLOSE = 0.5;
const SHEET_MS = 220;

/** Custom pedal looks the Make Your Own thumbnail cycles through. */
const CUSTOM_LOOKS: { template: PedalTemplate; color: string }[] = [
  { template: "hammond", color: "#7fd8b4" },
  { template: "compact", color: "#ff6b5e" },
  { template: "modeler", color: "#6cb8f0" },
  { template: "classic", color: "#f2c14e" },
  { template: "switcher", color: "#a993f0" },
];
const LOOK_MS = 1600;

/** One custom pedal drawn to fit a 52px box. */
function CustomLook({ template, color }: { template: PedalTemplate; color: string }) {
  const t = templateInfo(template);
  const w = t.width * PX_PER_INCH;
  const h = t.height * PX_PER_INCH;
  const scale = 52 / Math.max(w, h);
  return (
    <span className="relative block" style={{ width: w * scale, height: h * scale }}>
      <span className="absolute left-0 top-0 origin-top-left" style={{ width: w, height: h, transform: `scale(${scale})` }}>
        <PedalArt template={template} jacks={t.jacks ?? undefined} w={w} h={h} color={color} label="Custom" />
      </span>
    </span>
  );
}

/** The Make Your Own thumbnail: cross-fades through a few custom pedal styles and colors (holds still for reduced motion). */
function CustomThumb() {
  const [look, setLook] = useState(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setLook((n) => (n + 1) % CUSTOM_LOOKS.length), LOOK_MS);
    return () => clearInterval(t);
  }, []);
  return (
    <span className="relative grid size-full place-items-center">
      {CUSTOM_LOOKS.map((l, i) => (
        <span
          key={i}
          className="absolute inset-0 grid place-items-center transition-opacity duration-500 ease-out"
          style={{ opacity: i === look ? 1 : 0 }}
        >
          <CustomLook {...l} />
        </span>
      ))}
    </span>
  );
}

/**
 * Adds products to the canvas; with `replace`, picks a replacement for the selected product instead.
 * Larger screens get a panel docked down the canvas's left side; phones get a bottom drawer that slides closed.
 */
export function SearchPanel({ onClose: close, replace = false, edit = false }: { onClose: () => void; replace?: boolean; edit?: boolean }) {
  const phone = useMediaQuery(PHONE_QUERY);
  const { height: visibleHeight, keyboard } = useVisualViewport();

  // The docked panel (larger screens) tells the canvas how much of its left edge it covers, so new gear lands clear of it.
  const dockRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = dockRef.current;
    const setCover = usePlayground.getState().setCoverLeft;
    if (phone || !el) return;
    const measure = () => setCover(el.offsetLeft + el.offsetWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => {
      ro.disconnect();
      setCover(0);
    };
  }, [phone]);

  // Phones slide the drawer away before unmounting it.
  const [closing, setClosing] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(closeTimer.current), []);
  const onClose = useCallback(() => {
    if (!phone) return close();
    (document.activeElement as HTMLElement | null)?.blur(); // drop the keyboard as the drawer leaves
    setClosing(true);
    clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(close, SHEET_MS);
  }, [phone, close]);

  // Swipe down on the handle to close.
  const [drag, setDrag] = useState<number | null>(null);
  const dragStart = useRef({ y: 0, t: 0 });
  const onHandleDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragStart.current = { y: e.clientY, t: performance.now() };
    setDrag(0);
  };
  const onHandleMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (drag !== null) setDrag(Math.max(0, e.clientY - dragStart.current.y));
  };
  const onHandleUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (drag === null) return;
    const dy = Math.max(0, e.clientY - dragStart.current.y);
    const speed = dy / Math.max(1, performance.now() - dragStart.current.t);
    setDrag(null);
    if (dy > SWIPE_CLOSE || speed > FLICK_CLOSE) onClose();
  };

  const { manifest: catalog, error, load } = useCatalog();
  const [query, setQuery] = useState("");
  const searchInput = useRef<HTMLInputElement>(null);
  const deferredQuery = useDeferredValue(query);
  const units = useUi((u) => u.units);
  const addCatalogItem = usePlayground((p) => p.addCatalogItem);
  const replaceItem = usePlayground((p) => p.replaceItem);
  const target = usePlayground((p) =>
    (replace || edit) && p.selected.length === 1 ? p.items.find((i) => i.id === p.selected[0] && (!edit || i.custom)) : undefined,
  );

  // Filters are optional: no kind picked means pedals and pedalboards together. Replacing keeps to the same kind.
  const [kindFilter, setKindFilter] = useState<Kind | null>(null);
  const kind: Kind | null = target ? target.kind : kindFilter;
  const [sizes, setSizes] = useState<SizeClass[]>([]);
  const filtered = kindFilter !== null || sizes.length > 0;
  const clearFilters = () => {
    setKindFilter(null);
    setSizes([]);
  };

  // The custom item form, opened from the Custom button or from an empty search (prefilled with what was typed).
  const [custom, setCustom] = useState<{ name: string; kind: Kind } | null>(null);

  // Replacing and editing need exactly one selected product; close if that stops being true.
  useEffect(() => {
    if ((replace || edit) && !target) onClose();
  }, [replace, edit, target, onClose]);

  useEffect(() => {
    void load();
  }, [load]);

  // Pedals and pedalboards in one alphabetical list, indexed once for search.
  const index = useMemo(() => {
    if (!catalog) return [];
    const all: Omit<Entry, "id">[] = [];
    // Skip exact repeats (same product, size and image), which the catalog has a few of.
    const seen = new Set<string>();
    for (const [kind, list] of [["pedal", catalog.pedals], ["pedalboard", catalog.pedalboards]] as const) {
      for (const item of list) {
        const sig = [kind, item.brand, item.name, item.width, item.height, item.image].join("|");
        if (seen.has(sig)) continue;
        seen.add(sig);
        all.push({ kind, item, brand: item.brand, name: item.name });
      }
    }
    all.sort((a, b) => a.brand.localeCompare(b.brand) || a.name.localeCompare(b.name));
    return all.map((e, id) => ({ ...indexItem({ ...e, id }), size: sizeClass(e.kind, e.item.width) }));
  }, [catalog]);

  const { items: hits, partial } = useMemo(() => {
    const pool = index.filter((e) => (!kind || e.item.kind === kind) && (sizes.length === 0 || sizes.includes(e.size)));
    return search(pool, deferredQuery);
  }, [index, kind, sizes, deferredQuery]);

  // Before any search or filter, the list shows Trending (most added lately) or What's New (newest in the catalog).
  const browsing = !target && !deferredQuery.trim() && !filtered;
  const [feed, setFeed] = useState<Feed>(savedFeed);
  const chooseFeed = (f: Feed) => {
    setFeed(f);
    try {
      localStorage.setItem(FEED_KEY, f);
    } catch {
      /* storage unavailable */
    }
  };
  const [trending, setTrending] = useState<TrendingEntry[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    void fetchTrending().then((t) => !cancelled && setTrending(t));
    return () => {
      cancelled = true;
    };
  }, []);
  const feedEntries = useMemo((): Entry[] => {
    if (!browsing) return [];
    const entries = index.map((e) => e.item);
    const byKey = new Map(entries.map((e) => [`${e.kind}|${e.item.image}`, e]));
    if (feed === "new") {
      return entries
        .filter((e) => e.item.added)
        .sort((a, b) => b.item.added!.localeCompare(a.item.added!) || a.brand.localeCompare(b.brand) || a.name.localeCompare(b.name))
        .slice(0, FEED_SIZE);
    }
    // Until enough adds are recorded, Trending tops up with the featured classics.
    const picks = (trending ?? []).map((t) => byKey.get(`${t.kind}|${t.image}`)).filter((e): e is Entry => !!e);
    for (const key of FEATURED_PEDALS) {
      if (picks.length >= FEED_SIZE) break;
      const e = byKey.get(`pedal|${key}`);
      if (e && !picks.includes(e)) picks.push(e);
    }
    return picks.slice(0, FEED_SIZE);
  }, [browsing, feed, index, trending]);

  const results = browsing ? feedEntries : hits.slice(0, MAX_RESULTS);

  // Brief "Added" confirmation on the row just tapped. Phones then close the panel, which covers the middle of the
  // canvas where new items land.
  const [added, setAdded] = useState<string | null>(null);
  const addedTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(addedTimer.current), []);
  const add = (entry: Entry, key: string) => {
    addCatalogItem(entry.kind, entry.item);
    recordGearAdd(entry.kind, entry.item.image);
    setAdded(key);
    clearTimeout(addedTimer.current);
    addedTimer.current = setTimeout(() => (phone ? onClose() : setAdded(null)), phone ? 600 : 1200);
  };

  const pick = (entry: Entry) => {
    if (target) {
      replaceItem(target.id, entry.item);
      recordGearAdd(entry.kind, entry.item.image);
      onClose();
    } else add(entry, String(entry.id));
  };

  // Keyboard: the top result starts highlighted, so Enter adds it as soon as you see it. Arrows move the highlight.
  const [highlight, setActive] = useState(0);
  useEffect(() => setActive(0), [deferredQuery, kind, sizes, feed]);
  const active = results.length === 0 ? -1 : Math.min(highlight, results.length - 1);
  useEffect(() => {
    // Keep the highlighted row in view, but don't scroll the list back to the top on every new search.
    if (active > 0) document.getElementById(`search-row-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [active]);
  const onSearchKey = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (results.length === 0) return;
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive(Math.min(results.length - 1, Math.max(0, active + step)));
    } else if (e.key === "Enter") {
      const entry = results[active];
      if (!entry) return;
      e.preventDefault();
      pick(entry);
    }
  };

  // Tapping a chip shouldn't take focus from the search field, which would drop the phone keyboard.
  const keepFocus = (e: ReactMouseEvent) => e.preventDefault();

  const typed = query.trim();
  const showCustom = edit || custom !== null;

  // Make your own: for gear that isn't in the catalog. Pictured as custom pedals in a few styles.
  const makeOwn = (
    <button
      tabIndex={-1}
      onClick={() => setCustom({ name: typed.slice(0, 40), kind: kindFilter ?? "pedal" })}
      className="flex w-full items-center gap-3 rounded-control p-2 text-left transition-colors hover:bg-surface-hover active:bg-chrome-line"
    >
      <span className="size-16 shrink-0 overflow-hidden rounded-control bg-canvas">
        <CustomThumb />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium leading-snug">Make Your Own</span>
        <span className="block text-xs text-ink-muted">Add a pedal/pedalboard with custom dimensions</span>
      </span>
    </button>
  );

  const body = (
    <>
      {/* Title and close, then (except when editing a custom item) the shaded search field. */}
      <div className="flex items-center gap-2 px-4 pb-1 pt-3">
        <h2 className="flex-1 truncate text-base font-semibold tracking-[-0.01em]">
          {edit
            ? target?.kind === "pedalboard"
              ? "Edit Custom Pedalboard"
              : "Edit Custom Pedal"
            : target
              ? `Replace ${target.label}`
              : "Add Gear"}
        </h2>
        <button aria-label="Close" {...tip("Close")} onClick={onClose} className="press -mr-1.5 grid size-7 place-items-center rounded-control text-ink-muted hover:bg-surface-hover hover:text-ink active:bg-chrome-line">
          <X size={16} />
        </button>
      </div>
      {/* Hidden while making a custom item; Back to Search brings it back. */}
      {!edit && !showCustom && (
        <div className="px-3 pb-1 pt-1.5">
          <label className="flex h-9 items-center gap-2 rounded-control bg-surface-hover px-3 focus-within:ring-2 focus-within:ring-brand">
            <Search size={16} className="shrink-0 text-ink-muted" />
            <input
              ref={searchInput}
              autoFocus
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setCustom(null); // typing goes back to the results
              }}
              onKeyDown={onSearchKey}
              role="combobox"
              aria-label="Search pedals and pedalboards"
              aria-expanded={!showCustom}
              aria-controls="search-results"
              aria-activedescendant={active >= 0 ? `search-row-${active}` : undefined}
              aria-autocomplete="list"
              {...plainField}
              autoCapitalize="none"
              enterKeyHint="search"
              placeholder="Search pedals and pedalboards"
              className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-muted max-sm:text-base"
            />
          </label>
        </div>
      )}
      {!edit && !custom && (
        browsing && (
          // Sort for the list shown before searching: most added lately, or newest in the catalog.
          <div role="radiogroup" aria-label="Sort" className="flex items-center gap-1 px-3 pt-2">
            {(
              [
                ["trending", "Trending", <Flame key="t" size={14} strokeWidth={2.25} />],
                ["new", "New", <Sparkles key="n" size={14} strokeWidth={2.25} />],
              ] as const
            ).map(([id, label, icon]) => (
              <button
                key={id}
                role="radio"
                aria-checked={feed === id}
                onClick={() => chooseFeed(id)}
                className={`press flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[13px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand ${
                  feed === id ? "bg-brand/10 text-brand" : "text-ink-muted hover:bg-surface-hover hover:text-ink"
                }`}
              >
                {icon}
                {label}
              </button>
            ))}
          </div>
        )
      )}
      {showCustom ? (
        <div className="min-h-0 flex-1">
          <CustomItemForm
            key={custom ? `${custom.kind}:${custom.name}` : "edit"}
            onDone={onClose}
            onBack={edit ? undefined : () => setCustom(null)}
            item={edit ? target : undefined}
            initialKind={custom?.kind}
            initialName={custom?.name}
          />
        </div>
      ) : (
      <>
      <ul id="search-results" role="listbox" className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
        {!catalog && !error && <li className="p-3 text-sm text-ink-muted">Loading catalog…</li>}
        {/* Phones: the first row. Larger screens dock it at the bottom of the panel instead. */}
        {!target && phone && <li role="presentation">{makeOwn}</li>}
        {error && <li className="p-3 text-sm text-danger">{error}</li>}
        {catalog && !browsing && (hits.length === 0 || partial) && (
          <li className={`animate-enter flex flex-col items-center gap-3 px-3 text-center [--enter-y:4px] ${partial ? "pb-3 pt-2" : "py-6"}`}>
            <p className="text-sm text-ink-muted">
              {typed ? (
                <>
                  No matches for <span className="font-medium text-ink">“{typed}”</span>
                  {filtered && " with these filters"}
                  {partial && ". Close matches below."}
                </>
              ) : (
                "Nothing matches these filters"
              )}
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {filtered && !partial && (
                <button onMouseDown={keepFocus} onClick={clearFilters} className="press h-8 rounded-control border border-line px-3 text-sm hover:bg-surface-hover">
                  Clear Filters
                </button>
              )}
              {!target && (
                <button
                  onClick={() => setCustom({ name: kindFilter === "pedalboard" ? "" : typed.slice(0, 40), kind: kindFilter ?? "pedal" })}
                  className="flex h-8 max-w-full items-center gap-1 px-3 text-sm btn-primary"
                >
                  <Plus size={15} strokeWidth={2.25} className="shrink-0" />
                  <span className="truncate">
                    {kindFilter === "pedalboard" ? "Make a Custom Pedalboard" : typed ? `Create “${typed}” as a Custom Pedal` : "Make a Custom Pedal"}
                  </span>
                </button>
              )}
            </div>
          </li>
        )}
        {results.map((entry, row) => {
          const { item } = entry;
          const key = String(entry.id);
          const isAdded = added === key;
          return (
          <li key={key} role="presentation">
            <button
              id={`search-row-${row}`}
              role="option"
              aria-selected={row === active}
              tabIndex={-1}
              onClick={() => pick(entry)}
              className={`flex w-full items-center gap-3 rounded-control p-2 text-left transition-colors ${
                isAdded ? "bg-brand/10" : row === active ? "pointer-fine:bg-surface-hover" : "hover:bg-surface-hover active:bg-chrome-line"
              }`}
            >
              <img
                src={thumbUrl(catalog, entry.kind, item.image) ?? undefined}
                alt=""
                loading="lazy"
                className="size-16 shrink-0 rounded-control bg-canvas object-contain p-1"
              />
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{item.name}</span>
                <span className="block truncate text-xs text-ink-muted">
                  {item.brand} · {formatSize(item.width, item.height, units)}
                  {!kind && entry.kind === "pedalboard" && " · Pedalboard"}
                </span>
              </span>
              {row === active && !isAdded && (
                <kbd className="ml-auto flex shrink-0 items-center gap-1 pr-1 font-sans text-xs tracking-normal text-ink-muted pointer-coarse:hidden">
                  <CornerDownLeft size={13} />
                  Enter
                </kbd>
              )}
              {isAdded && (
                <span className="animate-enter ml-auto flex shrink-0 items-center gap-1 pr-1 text-[13px] font-semibold text-brand [--enter-y:4px]">
                  <Check size={16} strokeWidth={2.5} />
                  Added
                </span>
              )}
            </button>
          </li>
          );
        })}
        {!browsing && hits.length > MAX_RESULTS && (
          <li className="px-2 pb-1 pt-2 text-center text-xs text-ink-muted">
            Showing {MAX_RESULTS} of {hits.length.toLocaleString()}. Keep typing or add a filter to narrow it down.
          </li>
        )}
      </ul>
      {/* Floats over the end of the list like a lifted result; the list fades out behind it. */}
      {!target && !phone && (
        <div className="relative px-2 pb-2">
          <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-8 h-8 bg-gradient-to-t from-surface to-transparent" />
          <div className="rounded-control bg-surface-hover shadow-[0_2px_12px_rgb(0_0_0/0.12)] [&>button:hover]:bg-ink/10">{makeOwn}</div>
        </div>
      )}
      </>
      )}
    </>
  );

  if (!phone) {
    // Docked down the canvas's whole left side, so gear lands in view to its right. Narrow enough to clear the
    // centered toolbar on a 1024px-wide screen.
    return (
      <div
        ref={dockRef}
        role="dialog"
        aria-label={edit ? "Edit" : replace ? "Replace" : "Add Gear"}
        className="animate-dock absolute bottom-3 left-3 top-3 z-40 flex w-[min(280px,calc(100%-1.5rem))] flex-col overflow-hidden rounded-panel bg-surface shadow-panel"
      >
        {body}
      </div>
    );
  }

  // Phone drawer. Sits above the keyboard when it's open, and leaves the header in view.
  const offset = closing ? "100%" : `${drag ?? 0}px`;
  return createPortal(
    <div className="fixed inset-0 z-40">
      <div
        className="animate-fade absolute inset-0 bg-[rgb(10_11_16/0.65)]"
        style={{ opacity: closing ? 0 : 1 - (drag ?? 0) / 400, transition: drag === null ? `opacity ${SHEET_MS}ms ease-out` : "none" }}
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-label={edit ? "Edit" : replace ? "Replace" : "Add Gear"}
        className="animate-sheet absolute inset-x-0 flex flex-col rounded-t-[16px] bg-surface shadow-[0_-4px_24px_rgb(0_0_0/0.12)]"
        style={{
          bottom: keyboard,
          height: Math.min(visibleHeight * 0.72, visibleHeight - 56),
          paddingBottom: keyboard ? 0 : "env(safe-area-inset-bottom)",
          transform: `translateY(${offset})`,
          transition: drag === null ? `transform ${SHEET_MS}ms cubic-bezier(0.2, 0.8, 0.2, 1)` : "none",
        }}
      >
        <div
          className="flex h-6 shrink-0 cursor-grab touch-none items-center justify-center"
          onPointerDown={onHandleDown}
          onPointerMove={onHandleMove}
          onPointerUp={onHandleUp}
          onPointerCancel={onHandleUp}
          aria-hidden
        >
          <span className="h-1 w-9 rounded-full bg-line" />
        </div>
        {body}
      </div>
    </div>,
    document.body,
  );
}
