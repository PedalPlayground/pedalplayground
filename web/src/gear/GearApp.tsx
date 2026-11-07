import { Search, SlidersHorizontal } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { PageHeader, type PageDialog } from "../components/PageHeader";
import { canvasImageUrl, itemTypes, thumbUrl, type Kind, type Manifest } from "../lib/catalog";
import { indexItem, search as searchItems } from "../lib/search";
import { PEDAL_TYPES } from "../lib/specs";
import { Modal } from "../components/Modal";
import { DensitySwitch, useDensity, type Density } from "../components/DensitySwitch";
import { fetchGearUsage, fetchTrending, type TrendingEntry } from "../lib/trending";
import type { CatalogItem } from "../lib/types";
import { useAuth } from "../store/auth";
import { ItemPage, itemHref } from "./ItemPage";
import { useCatalog } from "../store/catalog";

type GearSort = "az" | "new" | "used";

/** The filters live in the URL, so a brand page is just a link: /gear/?brand=Boss. */
interface Filters {
  kind: Kind;
  brand: string | null;
  /** Pedal type, as in src/lib/specs.ts ("Overdrive"). */
  type: string | null;
  query: string;
  sort: GearSort;
}

function readFilters(): Filters {
  const p = new URLSearchParams(window.location.search);
  const sort = p.get("sort");
  return {
    kind: p.get("kind") === "boards" ? "pedalboard" : "pedal",
    brand: p.get("brand") || null,
    type: p.get("type") || null,
    query: p.get("q") ?? "",
    sort: sort === "new" || sort === "used" ? sort : "az",
  };
}

/** The item whose page is open, from ?item=<image key> (with kind=boards for a board). */
function readItem(): { kind: Kind; key: string } | null {
  const p = new URLSearchParams(window.location.search);
  const key = p.get("item");
  return key ? { kind: p.get("kind") === "boards" ? "pedalboard" : "pedal", key } : null;
}

function filtersHref(f: Filters) {
  const p = new URLSearchParams();
  if (f.kind === "pedalboard") p.set("kind", "boards");
  if (f.brand) p.set("brand", f.brand);
  if (f.type) p.set("type", f.type);
  if (f.query.trim()) p.set("q", f.query.trim());
  if (f.sort !== "az") p.set("sort", f.sort);
  const qs = p.toString();
  return `${window.location.pathname}${qs ? `?${qs}` : ""}`;
}

function writeFilters(f: Filters) {
  history.replaceState(null, "", filtersHref(f));
}

const PAGE = 60;
/** Columns for each card size, from phones up (next to the sidebar from laptop width). Medium is the original. */
const GRID: Record<Density, string> = {
  large: "grid-cols-1 gap-4 min-[480px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5",
  medium: "grid-cols-2 gap-3 min-[560px]:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6",
  small: "grid-cols-3 gap-2 min-[560px]:grid-cols-4 md:grid-cols-5 xl:grid-cols-7 2xl:grid-cols-8",
};
/**
 * Pedal photos share one scale, so sizes compare at a glance: a pedal this many inches tall fills the photo area's
 * height (about three in four pedals are this size or smaller). Bigger ones are fit to it; boards always are.
 */
const FILL_INCHES = 5.2;
/** Items per shelf (trending, newest). */
const SHELF = 12;
/** New for 30 days after it joins the catalog. */
const NEW_DAYS = 30;

const chip = (on: boolean) =>
  `press h-8 shrink-0 rounded-full px-3 text-[13px] font-semibold transition-colors ${on ? "bg-ink text-surface" : "bg-surface text-ink-muted shadow-chip hover:text-ink"}`;

/** The gear catalog at /gear/: every pedal and pedalboard, by brand, with search and sorting. */
export function GearApp() {
  const init = useAuth((s) => s.init);
  const manifest = useCatalog((s) => s.manifest);
  const error = useCatalog((s) => s.error);
  const [dialog, setDialog] = useState<PageDialog>(null);
  const [initial] = useState(readFilters);
  const [kind, setKind] = useState<Kind>(initial.kind);
  const [brand, setBrand] = useState<string | null>(initial.brand);
  const [type, setType] = useState<string | null>(initial.type);
  /** Phones and tablets: the filters open in a sheet. */
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [density, setDensity] = useDensity("gear");
  const [query, setQuery] = useState(initial.query);
  const [search, setSearch] = useState(initial.query);
  const [sort, setSort] = useState<GearSort>(initial.sort);
  const [usage, setUsage] = useState<Map<string, number>>(new Map());
  const [shown, setShown] = useState(PAGE);
  const [open, setOpen] = useState(readItem);
  /** Where the grid was scrolled when an item opened, to return to on Back. */
  const gridScroll = useRef(0);
  /** True once this visit opened an item from the grid, so Back can be the browser's back. */
  const pushed = useRef(false);
  const sentinel = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(init, [init]);
  // PageHeader loads the catalog too; this is the same promise.
  useEffect(() => void useCatalog.getState().load(), []);
  useEffect(() => void fetchGearUsage().then(setUsage), []);
  const [trending, setTrending] = useState<TrendingEntry[]>([]);
  useEffect(() => void fetchTrending().then(setTrending), []);

  // Search as you type, after a short pause.
  useEffect(() => {
    const t = setTimeout(() => setSearch(query), 200);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    // An item's page owns the URL while it's open.
    if (readItem()) return;
    writeFilters({ kind, brand, type, query: search, sort });
    setShown(PAGE);
    scroller.current?.scrollTo({ top: 0 });
  }, [kind, brand, type, search, sort]);

  // The browser's back and forward move between the grid and item pages.
  useEffect(() => {
    const onPop = () => {
      const next = readItem();
      setOpen(next);
      const f = readFilters();
      setKind(f.kind);
      if (!next) {
        setBrand(f.brand);
        setType(f.type);
        setQuery(f.query);
        setSearch(f.query);
        setSort(f.sort);
        requestAnimationFrame(() => scroller.current?.scrollTo({ top: gridScroll.current }));
      } else scroller.current?.scrollTo({ top: 0 });
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const openItem = (k: Kind, item: CatalogItem) => {
    if (!open) gridScroll.current = scroller.current?.scrollTop ?? 0;
    history.pushState(null, "", itemHref(k, item));
    pushed.current = true;
    setOpen({ kind: k, key: item.image });
    scroller.current?.scrollTo({ top: 0 });
  };

  const closeItem = () => {
    if (pushed.current) return history.back();
    // Opened from a link: there's no grid behind it, so start one.
    setOpen(null);
    writeFilters({ kind, brand, type, query: search, sort });
  };

  /** A brand link on an item page: that brand's grid, as a new history step. */
  const brandFromItem = (b: string) => {
    const k = open?.kind ?? kind;
    history.pushState(null, "", filtersHref({ kind: k, brand: b, type: null, query: "", sort }));
    setType(null);
    setOpen(null);
    setKind(k);
    pickBrand(b);
    setShown(PAGE);
    scroller.current?.scrollTo({ top: 0 });
  };

  const all = useMemo(() => (manifest ? (kind === "pedal" ? manifest.pedals : manifest.pedalboards) : []), [manifest, kind]);

  /** Brands for the picker, with how many items each has, A–Z. */
  const brands = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of all) counts.set(item.brand, (counts.get(item.brand) ?? 0) + 1);
    return [...counts].sort((a, b) => a[0].localeCompare(b[0]));
  }, [all]);

  // A typed or old link may not match the catalog's spelling (?brand=boss for "BOSS"): use the catalog's.
  useEffect(() => {
    if (!brand || !brands.length || brands.some(([b]) => b === brand)) return;
    const match = brands.find(([b]) => b.toLowerCase() === brand.toLowerCase());
    if (match) setBrand(match[0]);
  }, [brand, brands]);

  /** Types for the Type list, with counts, in the order of src/lib/specs.ts. Empty until the catalog has types. */
  const types = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of all) if (!brand || item.brand === brand) for (const t of itemTypes(item)) counts.set(t, (counts.get(t) ?? 0) + 1);
    return PEDAL_TYPES.filter((t) => counts.has(t)).map((t) => [t, counts.get(t)!] as [string, number]);
  }, [all, brand]);

  const index = useMemo(() => all.map(indexItem), [all]);

  const { items, partial } = useMemo(() => {
    const scoped = brand || type ? index.filter((e) => (!brand || e.item.brand === brand) && (!type || itemTypes(e.item).includes(type))) : index;
    const found = searchItems(scoped, search);
    // A search ranks by match; sorting only reorders the full list.
    if (search.trim()) return found;
    const list = [...found.items];
    if (sort === "new") list.sort((a, b) => (b.added ?? "").localeCompare(a.added ?? ""));
    if (sort === "used") list.sort((a, b) => (usage.get(`${kind}:${b.image}`) ?? 0) - (usage.get(`${kind}:${a.image}`) ?? 0));
    return { items: list, partial: false };
  }, [index, brand, type, search, sort, usage, kind]);

  // Show the next page when the bottom of the grid scrolls into view.
  useEffect(() => {
    const el = sentinel.current;
    if (!el || shown >= items.length) return;
    const io = new IntersectionObserver((e) => e[0].isIntersecting && setShown((n) => n + PAGE), { root: scroller.current, rootMargin: "800px" });
    io.observe(el);
    return () => io.disconnect();
  }, [shown, items.length]);

  const newSince = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - NEW_DAYS);
    return d.toISOString().slice(0, 10);
  }, []);

  const openEntry = useMemo(() => {
    if (!open || !manifest) return null;
    return (open.kind === "pedal" ? manifest.pedals : manifest.pedalboards).find((c) => c.image === open.key) ?? null;
  }, [open, manifest]);

  const pickBrand = (b: string | null) => {
    setBrand(b);
    setQuery("");
    setSearch("");
  };

  /** The shelves over the full list (no brand or search): trending, newest, and the most used brands. */
  const browsing = !brand && !type && !search.trim();
  const shelves = useMemo(() => {
    if (!manifest || !browsing) return null;
    const byKey = new Map(all.map((c) => [c.image, c]));
    const hot = trending
      .filter((t) => t.kind === kind)
      .map((t) => byKey.get(t.image))
      .filter((c): c is CatalogItem => !!c)
      .slice(0, SHELF);
    const fresh = [...all]
      .filter((c) => c.added)
      .sort((a, b) => b.added!.localeCompare(a.added!))
      .slice(0, SHELF);
    const brandUse = new Map<string, number>();
    for (const c of all) {
      const n = usage.get(`${kind}:${c.image}`);
      if (n) brandUse.set(c.brand, (brandUse.get(c.brand) ?? 0) + n);
    }
    const topBrands = [...brandUse].sort((a, b) => b[1] - a[1]).slice(0, 16).map(([b]) => b);
    return { hot, fresh, topBrands };
  }, [manifest, browsing, all, trending, kind, usage]);

  const card = (c: CatalogItem) => (
    <GearCard key={c.image} item={c} kind={kind} manifest={manifest!} isNew={!!c.added && c.added >= newSince} onBrand={pickBrand} onOpen={openItem} />
  );

  const noun = kind === "pedal" ? "pedals" : "pedalboards";
  const total = items.length.toLocaleString("en-US");

  const clearFilters = () => {
    pickBrand(null);
    setType(null);
  };
  /** Filters on, for the badge on the phone's Filters button. */
  const activeFilters = (brand ? 1 : 0) + (type ? 1 : 0);

  const searchBox = (
    <label className="relative block">
      <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-icon" />
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={brand ? `Search ${brand}` : `Search ${noun}`}
        aria-label={`Search ${noun}`}
        className="h-9 w-full rounded-control border border-chrome-line bg-surface pl-9 pr-3 text-sm outline-none focus:border-brand"
      />
    </label>
  );

  const filterPanel = (
    <FilterPanel
      kind={kind}
      setKind={(k) => {
        setKind(k);
        // Few pedal brands make boards, and boards have no types: start over.
        clearFilters();
      }}
      sort={sort}
      setSort={setSort}
      types={types}
      type={type}
      setType={setType}
      brands={brands}
      brand={brand}
      setBrand={pickBrand}
      onClear={activeFilters ? clearFilters : undefined}
    />
  );

  // Pages other than the playground scroll inside their own container (the playground locks page scrolling).
  return (
    <div ref={scroller} className="h-dvh overflow-y-auto overscroll-contain bg-page font-sans text-ink">
      <PageHeader current="gear" dialog={dialog} setDialog={setDialog} />

      {open && (
        <main id="content" className="page-main mx-auto max-w-[1600px] px-4 pb-16 pt-6">
          {openEntry && manifest ? (
            <ItemPage
              kind={open.kind}
              item={openEntry}
              manifest={manifest}
              usage={usage}
              onBack={closeItem}
              onBrand={brandFromItem}
              card={(c) => (
                <GearCard key={c.image} item={c} kind={open.kind} manifest={manifest} isNew={!!c.added && c.added >= newSince} onBrand={brandFromItem} onOpen={openItem} />
              )}
            />
          ) : (
            manifest && (
              <p className="mx-auto mt-12 max-w-sm text-center text-sm text-ink-muted">
                That item isn't in the catalog.{" "}
                <button type="button" className="font-semibold text-brand" onClick={closeItem}>
                  Browse all gear
                </button>
              </p>
            )
          )}
        </main>
      )}

      {/* Kept while an item is open, so its filters and loaded cards are there on Back. */}
      <main id={open ? undefined : "content"} className={`page-main mx-auto max-w-[1600px] px-4 pb-16 pt-8 ${open ? "hidden" : ""}`}>
        {brand ? (
          <>
            <button type="button" onClick={() => pickBrand(null)} className="text-[13px] font-semibold text-brand hover:underline">
              All brands
            </button>
            <h1 className="mt-1 text-2xl font-bold tracking-[-0.01em]">{brand}</h1>
          </>
        ) : (
          <h1 className="text-2xl font-bold tracking-[-0.01em]">{type ?? "Gear"}</h1>
        )}
        <p className="mt-1 text-sm text-ink-muted">
          {manifest
            ? brand || type
              ? `${total} ${type && brand ? `${type.toLowerCase()} ` : ""}${noun}${brand ? ` from ${brand}` : ""} in the catalog.`
              : `Every pedal and pedalboard in the catalog: ${manifest.pedals.length.toLocaleString("en-US")} pedals and ${manifest.pedalboards.length.toLocaleString("en-US")} boards from ${new Set(manifest.pedals.map((p) => p.brand)).size.toLocaleString("en-US")} brands.`
            : "Every pedal and pedalboard in the catalog."}
        </p>

        <div className="mt-6 lg:grid lg:grid-cols-[240px_minmax(0,1fr)] lg:items-start lg:gap-8">
          {/* Laptops and up: the filters in a sidebar that stays in view while the grid scrolls. */}
          <aside aria-label="Filters" className="hidden lg:sticky lg:top-[4.5rem] lg:-mx-1 lg:block lg:max-h-[calc((100dvh-6rem)/var(--page-zoom,1))] lg:overflow-y-auto lg:px-1 lg:pb-4">
            {searchBox}
            {filterPanel}
          </aside>

          <div className="min-w-0">
            {/* Phones and tablets: search, with the rest of the filters behind a button. */}
            <div className="flex gap-2 lg:hidden">
              <div className="min-w-0 flex-1">{searchBox}</div>
              <button
                type="button"
                onClick={() => setFiltersOpen(true)}
                className="press relative flex h-9 shrink-0 items-center gap-1.5 rounded-control border border-chrome-line bg-surface px-3 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                <SlidersHorizontal size={15} />
                Filters
                {activeFilters > 0 && (
                  <span className="grid size-5 place-items-center rounded-full bg-brand text-[11px] font-semibold text-brand-ink">{activeFilters}</span>
                )}
              </button>
            </div>
            {filtersOpen && (
              <Modal title="Filters" closeX onClose={() => setFiltersOpen(false)}>
                {filterPanel}
                <button
                  type="button"
                  onClick={() => setFiltersOpen(false)}
                  className="btn-primary press mt-4 h-10 w-full rounded-control text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-brand"
                >
                  Show {total} {items.length === 1 ? noun.slice(0, -1) : noun}
                </button>
              </Modal>
            )}

        {shelves && (
          <>
            {shelves.topBrands.length > 0 && (
              <Shelf title="Popular brands">
                {shelves.topBrands.map((b) => (
                  <button key={b} type="button" className={chip(false)} onClick={() => pickBrand(b)}>
                    {b}
                  </button>
                ))}
              </Shelf>
            )}
            {shelves.hot.length > 0 && <Shelf title="Trending this month">{shelves.hot.map((c) => <div key={c.image} className="w-40 shrink-0 sm:w-44">{card(c)}</div>)}</Shelf>}
            {shelves.fresh.length > 0 && (
              <Shelf
                title="New in the catalog"
                action={
                  sort !== "new" && (
                    <button type="button" onClick={() => setSort("new")} className="text-[13px] font-semibold text-brand hover:underline">
                      See all new
                    </button>
                  )
                }
              >
                {shelves.fresh.map((c) => <div key={c.image} className="w-40 shrink-0 sm:w-44">{card(c)}</div>)}
              </Shelf>
            )}
          </>
        )}

        {/* What's listed, and the card size. */}
        <div className={`flex min-h-8 items-center justify-between gap-3 ${shelves ? "mt-10" : "mt-4"}`}>
          {shelves ? (
            <h2 className="text-lg font-bold tracking-[-0.01em]">All {noun}</h2>
          ) : (
            <p className="text-sm text-ink-muted">
              {search.trim() && manifest && items.length
                ? partial
                  ? `Nothing matched every word. Here are ${total} close matches.`
                  : `${total} ${items.length === 1 ? noun.slice(0, -1) : noun} found.`
                : null}
            </p>
          )}
          <DensitySwitch value={density} onChange={setDensity} />
        </div>

        <div className={`mt-3 grid ${GRID[density]}`}>
          {manifest
            ? items.slice(0, shown).map((item) => (
                <GearCard
                  key={item.image}
                  item={item}
                  kind={kind}
                  manifest={manifest}
                  isNew={!!item.added && item.added >= newSince}
                  onBrand={pickBrand}
                  onOpen={openItem}
                />
              ))
            : !error && Array.from({ length: 12 }, (_, i) => <CardSkeleton key={i} />)}
        </div>
        <div ref={sentinel} />

        {error && (
          <p className="mt-10 text-center text-sm text-ink-muted">
            The catalog didn't load.{" "}
            <button type="button" className="font-semibold text-brand" onClick={() => void useCatalog.getState().load()}>
              Try again
            </button>
          </p>
        )}
        {manifest && items.length === 0 && (
          <p className="mx-auto mt-12 max-w-sm text-center text-sm text-ink-muted">
            No {noun} match. Try another search or{" "}
            <button type="button" className="font-semibold text-brand" onClick={clearFilters}>
              clear the filters
            </button>
            .
          </p>
        )}
          </div>
        </div>
      </main>
    </div>
  );
}

function GearCard({
  item,
  kind,
  manifest,
  isNew,
  onBrand,
  onOpen,
}: {
  item: CatalogItem;
  kind: Kind;
  manifest: Manifest;
  isNew: boolean;
  onBrand: (brand: string) => void;
  onOpen: (kind: Kind, item: CatalogItem) => void;
}) {
  const src = thumbUrl(manifest, kind, item.image);
  // The 128px thumbnail is soft once the photo fills a bigger card: the browser takes the full image when it needs it.
  const full = canvasImageUrl(manifest, kind, item.image);
  const srcSet = full ? `${src} 128w, ${full} ${kind === "pedal" ? 1200 : 2400}w` : undefined;
  // Pedals keep their real size against each other (see FILL_INCHES); boards are fit to the card.
  const style =
    kind === "pedal"
      ? {
          // cqh: a hundredth of the photo area's height, so the scale follows the card size.
          width: `${(item.width / FILL_INCHES) * 100}cqh`,
          height: `${(item.height / FILL_INCHES) * 100}cqh`,
          maxWidth: "100%",
          maxHeight: "100%",
        }
      : { width: "100%", height: "100%" };
  return (
    <article className="group relative flex flex-col overflow-hidden rounded-panel bg-card ring-chrome-line transition-shadow focus-within:ring-2 focus-within:ring-brand hover:ring-1">
      <div className="relative aspect-[4/3] w-full bg-canvas">
        {/* Absolute, so a tall photo can't stretch the card. */}
        <div className="absolute inset-2 flex items-center justify-center [container-type:size]">
          {src && <img src={src} srcSet={srcSet} sizes="(min-width: 768px) 15vw, 45vw" alt="" loading="lazy" style={style} className="object-contain" />}
        </div>
        {isNew && <span className="absolute left-2 top-2 rounded-full bg-brand px-2 py-0.5 text-[11px] font-semibold text-brand-ink">New</span>}
      </div>
      <div className="flex flex-1 flex-col px-3 pb-3 pt-2.5">
        <button
          type="button"
          onClick={() => onBrand(item.brand)}
          className="relative z-10 self-start truncate text-left text-xs font-medium text-ink-muted outline-none hover:text-ink hover:underline focus-visible:ring-2 focus-visible:ring-brand"
        >
          {item.brand}
        </button>
        {/* The whole card opens the item (the link stretches over it); the brand button sits above. */}
        <h2 className="line-clamp-2 text-[13px] font-semibold leading-snug">
          <a
            href={itemHref(kind, item)}
            onClick={(e) => {
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
              e.preventDefault();
              onOpen(kind, item);
            }}
            className="outline-none after:absolute after:inset-0"
          >
            {item.name}
          </a>
        </h2>
        <p className="mt-auto pt-1 text-xs tabular-nums text-ink-muted">
          {fmt(item.width)}″ × {fmt(item.height)}″
        </p>
      </div>
    </article>
  );
}

const filterHeading = "mb-1.5 text-xs font-semibold uppercase tracking-[0.04em] text-ink-muted";
const segmented = "flex rounded-control bg-soft p-0.5";
const segment = (on: boolean) =>
  `h-7 flex-1 whitespace-nowrap rounded-inner px-1.5 text-xs font-semibold transition-colors ${on ? "bg-surface text-ink" : "text-ink-muted hover:text-ink"}`;
const listRow = (on: boolean) =>
  `flex w-full items-center justify-between gap-2 rounded-control px-2 py-1.5 text-left text-[13px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand ${
    on ? "bg-soft font-semibold text-ink" : "text-ink-muted hover:bg-soft hover:text-ink"
  }`;

/** Pedals or boards, sort, type and brand: the sidebar on laptops, the Filters sheet on phones and tablets. */
function FilterPanel({
  kind,
  setKind,
  sort,
  setSort,
  types,
  type,
  setType,
  brands,
  brand,
  setBrand,
  onClear,
}: {
  kind: Kind;
  setKind: (k: Kind) => void;
  sort: GearSort;
  setSort: (s: GearSort) => void;
  types: [string, number][];
  type: string | null;
  setType: (t: string | null) => void;
  brands: [string, number][];
  brand: string | null;
  setBrand: (b: string | null) => void;
  onClear?: () => void;
}) {
  const [find, setFind] = useState("");
  const shownBrands = useMemo(() => {
    const q = find.trim().toLowerCase();
    return q ? brands.filter(([b]) => b.toLowerCase().includes(q)) : brands;
  }, [brands, find]);
  return (
    <div className="flex flex-col gap-5 pt-4 lg:pt-5">
      <div className="grid gap-4">
        <div>
          <h3 className={filterHeading}>Show</h3>
          <div role="radiogroup" aria-label="Show" className={segmented}>
            {(
              [
                ["pedal", "Pedals"],
                ["pedalboard", "Boards"],
              ] as const
            ).map(([v, label]) => (
              <button key={v} type="button" role="radio" aria-checked={kind === v} onClick={() => setKind(v)} className={segment(kind === v)}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <h3 className={filterHeading}>Sort</h3>
          <div role="radiogroup" aria-label="Sort" className={segmented}>
            {(
              [
                ["az", "A–Z"],
                ["new", "Newest"],
                ["used", "Most used"],
              ] as const
            ).map(([v, label]) => (
              <button key={v} type="button" role="radio" aria-checked={sort === v} onClick={() => setSort(v)} className={segment(sort === v)}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {types.length > 0 && (
        <div>
          <h3 className={filterHeading}>Type</h3>
          <div role="radiogroup" aria-label="Type" className="grid gap-0.5">
            <button type="button" role="radio" aria-checked={type === null} onClick={() => setType(null)} className={listRow(type === null)}>
              All types
            </button>
            {types.map(([t, n]) => (
              <button key={t} type="button" role="radio" aria-checked={type === t} onClick={() => setType(type === t ? null : t)} className={listRow(type === t)}>
                <span className="truncate">{t}</span>
                <span className="shrink-0 text-xs tabular-nums text-ink-muted">{n.toLocaleString("en-US")}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* The brand list scrolls on its own; past it, the whole sidebar scrolls. */}
      <div>
        <h3 className={filterHeading}>Brand</h3>
        <input
          type="search"
          value={find}
          onChange={(e) => setFind(e.target.value)}
          placeholder={`Find a brand (${brands.length.toLocaleString("en-US")})`}
          aria-label="Find a brand"
          className="mb-1.5 h-8 w-full rounded-control border border-chrome-line bg-surface px-2.5 text-[13px] outline-none focus:border-brand"
        />
        <div role="radiogroup" aria-label="Brand" className="-mx-1 grid max-h-72 gap-0.5 overflow-y-auto px-1">
          {!find.trim() && (
            <button type="button" role="radio" aria-checked={brand === null} onClick={() => setBrand(null)} className={listRow(brand === null)}>
              All brands
            </button>
          )}
          {shownBrands.map(([b, n]) => (
            <button key={b} type="button" role="radio" aria-checked={brand === b} onClick={() => setBrand(brand === b ? null : b)} className={listRow(brand === b)}>
              <span className="truncate">{b}</span>
              <span className="shrink-0 text-xs tabular-nums text-ink-muted">{n.toLocaleString("en-US")}</span>
            </button>
          ))}
          {shownBrands.length === 0 && <p className="px-2 py-1.5 text-[13px] text-ink-muted">No brands match.</p>}
        </div>
      </div>

      {onClear && (
        <button type="button" onClick={onClear} className="self-start text-[13px] font-semibold text-brand hover:underline">
          Clear filters
        </button>
      )}
    </div>
  );
}

/** A titled row that scrolls sideways. A scroller clips what's outside it, so it gets room for the cards' shadows
 * (padding, undone by negative margins so nothing moves); that room doesn't take clicks. */
function Shelf({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="mt-8">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-bold tracking-[-0.01em]">{title}</h2>
        {action}
      </div>
      <div className="pointer-events-none -mx-4 mt-3 flex gap-3 overflow-x-auto px-4 pb-3 pt-1 [&>*]:pointer-events-auto">{children}</div>
    </section>
  );
}

const fmt = (n: number) => String(Math.round(n * 100) / 100);

function CardSkeleton() {
  return (
    <div className="overflow-hidden rounded-panel bg-card" aria-hidden>
      <div className="aspect-[4/3] w-full animate-pulse bg-surface-hover" />
      <div className="space-y-2 px-3 pb-3 pt-2.5">
        <div className="h-3 w-1/2 animate-pulse rounded-inner bg-surface-hover" />
        <div className="h-3.5 w-3/4 animate-pulse rounded-inner bg-surface-hover" />
      </div>
    </div>
  );
}
