import { ArrowLeft, Search, SlidersHorizontal, TrendingUp } from "lucide-react";
import { tip } from "../components/Tooltip";
import { useEffect, useMemo, useRef, useState } from "react";
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
import { nameLink, squiggleRule } from "../components/RoleBadge";
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
/** Items per list (trending, newest) before they're mixed into the bento. */
const SHELF = 12;
/**
 * The Trending and new bento: 11 tiles whose sizes fill the grid exactly (dense packing). Four columns: a big tile and
 * two tall ones (4 full rows). Two columns: only the big tile spans (7 rows).
 */
const BENTO_COUNT = 11;
const BENTO = ["col-span-2 row-span-2", "sm:row-span-2", "", "", "sm:row-span-2", "", "", "", "", "", ""];
/** Brands beside the bento: two columns of eight on laptops. */
const BRAND_TILES = 16;

interface BentoPick {
  item: CatalogItem;
  why: "trending" | "new";
}
/** New for 30 days after it joins the catalog. */
const NEW_DAYS = 30;

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
  /** Pedal types for the Type list, with counts (within the chosen brand), in the order of src/lib/specs.ts. */
  const types = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of manifest?.pedals ?? []) if (!brand || item.brand === brand) for (const t of itemTypes(item)) counts.set(t, (counts.get(t) ?? 0) + 1);
    return PEDAL_TYPES.filter((t) => counts.has(t)).map((t) => [t, counts.get(t)!] as [string, number]);
  }, [manifest, brand]);
  /** How many pedals and pedalboards (within the chosen brand), for the top and bottom of the Type list. */
  const kindCounts = useMemo(() => {
    const n = (list: CatalogItem[]) => (brand ? list.filter((c) => c.brand === brand).length : list.length);
    return { pedal: n(manifest?.pedals ?? []), pedalboard: n(manifest?.pedalboards ?? []) };
  }, [manifest, brand]);

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
    // Each brand shown with its most added item's photo.
    const brandPhoto = new Map<string, { item: CatalogItem; n: number }>();
    for (const c of all) {
      const n = usage.get(`${kind}:${c.image}`) ?? 0;
      const best = brandPhoto.get(c.brand);
      if (n && (!best || n > best.n)) brandPhoto.set(c.brand, { item: c, n });
    }
    const topBrands = [...brandUse]
      .sort((a, b) => b[1] - a[1])
      .slice(0, BRAND_TILES)
      .map(([b]) => ({ brand: b, item: brandPhoto.get(b)!.item }));
    // Trending and new, taking turns, each item once.
    const picks: BentoPick[] = [];
    const seen = new Set<string>();
    for (let n = 0; n < Math.max(hot.length, fresh.length) && picks.length < BENTO_COUNT; n++) {
      for (const [item, why] of [[hot[n], "trending"], [fresh[n], "new"]] as const) {
        if (item && !seen.has(item.image) && picks.length < BENTO_COUNT) {
          seen.add(item.image);
          picks.push({ item, why });
        }
      }
    }
    return { topBrands, picks };
  }, [manifest, browsing, all, trending, kind, usage]);


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
      <Search size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-icon" />
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={brand ? `Search ${brand}` : `Search ${noun}`}
        aria-label={`Search ${noun}`}
        className="h-11 w-full rounded-control border border-chrome-line bg-surface pl-10 pr-3 text-[15px] outline-none focus:ring-2 focus:ring-brand"
      />
    </label>
  );

  const filterPanel = (
    <FilterPanel
      kind={kind}
      kindCounts={kindCounts}
      types={types}
      type={type}
      // Pedals, a pedal type, or pedalboards: one list. Boards have no types, and few pedal brands make boards.
      onType={(k, t) => {
        if (k !== kind) {
          setKind(k);
          pickBrand(null);
        }
        setType(t);
      }}
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
        <main id="content" className="page-main isolate mx-auto max-w-[1600px] px-4 pb-16 pt-6">
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
      <main id={open ? undefined : "content"} className={`page-main isolate mx-auto max-w-[1600px] px-4 pb-16 pt-8 ${open ? "hidden" : ""}`}>
        {/* The heading, with a big search beside it (under it on phones). */}
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between md:gap-8">
          <div className="min-w-0">
            {brand && (
              <button type="button" onClick={() => pickBrand(null)} className="mb-1 flex items-center gap-1 text-[13px] font-semibold text-brand">
                <ArrowLeft size={14} strokeWidth={2.5} />
                <span className="underline-offset-2 hover:underline">All brands</span>
              </button>
            )}
            <h1 className="text-2xl font-bold tracking-[-0.01em]">{brand ?? type ?? "Gear"}</h1>
            <p className="mt-1 text-sm text-ink-muted">
              {manifest
                ? brand || type
                  ? `${total} ${type && brand ? `${type.toLowerCase()} ` : ""}${noun}${brand ? ` from ${brand}` : ""} in the catalog.`
                  : `Every pedal and pedalboard in the catalog: ${manifest.pedals.length.toLocaleString("en-US")} pedals and ${manifest.pedalboards.length.toLocaleString("en-US")} boards from ${new Set(manifest.pedals.map((p) => p.brand)).size.toLocaleString("en-US")} brands.`
                : "Every pedal and pedalboard in the catalog."}
            </p>
          </div>
          <div className="w-full md:max-w-md">{searchBox}</div>
        </div>

        {/* Trending and new beside Popular brands, across the full width (stacked below laptop width). The brand column
            stretches to the bento's height, its tiles sharing the rows evenly. */}
        {shelves && (
          <div className="mt-8 grid gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] xl:gap-6">
            {shelves.picks.length > 0 && (
              <section>
                <div className="flex items-center justify-between gap-3">
                  <h2 className={`min-w-0 flex-1 text-lg font-bold tracking-[-0.01em] ${squiggleRule}`}>Trending and new</h2>
                  {sort !== "new" && (
                    <button type="button" onClick={() => setSort("new")} className="text-[13px] font-semibold text-brand hover:underline">
                      See all new
                    </button>
                  )}
                </div>
                {/* Bento: tiles of a few sizes, packed densely. Photo first, name only; the full cards are below. */}
                <div className="mt-3 grid grid-flow-dense auto-rows-[8.5rem] grid-cols-2 gap-3 sm:grid-cols-4 2xl:auto-rows-[10rem]">
                  {shelves.picks.map((p, i) => (
                    <BentoTile key={`${p.why}:${p.item.image}`} pick={p} kind={kind} manifest={manifest!} size={BENTO[i % BENTO.length]} onOpen={openItem} />
                  ))}
                </div>
              </section>
            )}
            {shelves.topBrands.length > 0 && (
              <section className="flex flex-col">
                <h2 className={`text-lg font-bold tracking-[-0.01em] ${squiggleRule}`}>Popular brands</h2>
                <div className="mt-3 grid flex-1 auto-rows-[3.5rem] grid-cols-2 gap-2 sm:grid-cols-4 xl:auto-rows-fr xl:grid-cols-2">
                  {shelves.topBrands.map(({ brand: b, item }, i) => (
                    // Phones show the top eight.
                    <BrandTile key={b} brand={b} item={item} kind={kind} manifest={manifest!} onPick={() => pickBrand(b)} className={i >= 8 ? "max-sm:hidden" : ""} />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}

        {/* The grid, with the filters beside it from laptop width. */}
        <div className={`${shelves ? "mt-12" : "mt-8"} lg:grid lg:grid-cols-[240px_minmax(0,1fr)] lg:items-start lg:gap-8`}>
          {/* Laptops and up: the filters in a sidebar that stays in view while the grid scrolls. */}
          <aside aria-label="Filters" className="hidden lg:sticky lg:top-[4.5rem] lg:-mx-1 lg:-mt-1 lg:block lg:pt-1 lg:max-h-[calc((100dvh-6rem)/var(--page-zoom,1))] lg:overflow-y-auto lg:px-1 lg:pb-4">
            {filterPanel}
          </aside>

          <div className="min-w-0">
            {/* What's listed, then the controls: Filters (phones and tablets), sort and card size. */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              {/* Phones: the card size shares the heading's row, so Filters and sort fit on the next. */}
              <div className="flex min-w-0 flex-1 items-center gap-3 max-sm:basis-full">
                <div className="min-w-0 flex-1">
                {shelves ? (
                  <h2 className={`text-lg font-bold tracking-[-0.01em] ${squiggleRule}`}>All {noun}</h2>
                ) : (
                  <p className="text-sm text-ink-muted">
                    {manifest && items.length
                      ? search.trim()
                        ? partial
                          ? `Nothing matched every word. Here are ${total} close matches.`
                          : `${total} ${items.length === 1 ? noun.slice(0, -1) : noun} found.`
                        : `${total} ${items.length === 1 ? noun.slice(0, -1) : noun}`
                      : null}
                  </p>
                )}
                </div>
                <div className="sm:hidden">
                  <DensitySwitch value={density} onChange={setDensity} />
                </div>
              </div>
              <button
                type="button"
                onClick={() => setFiltersOpen(true)}
                className="press relative flex h-8 shrink-0 items-center gap-1.5 rounded-control bg-soft px-2.5 text-[13px] font-semibold outline-none hover:bg-soft-hover focus-visible:ring-2 focus-visible:ring-brand lg:hidden"
              >
                <SlidersHorizontal size={14} />
                Filters
                {activeFilters > 0 && (
                  <span className="grid size-[18px] place-items-center rounded-full bg-brand text-[11px] font-semibold text-brand-ink">{activeFilters}</span>
                )}
              </button>
              <div role="radiogroup" aria-label="Sort" className={`${segmented} shrink-0`}>
                {(
                  [
                    ["az", "A–Z"],
                    ["new", "Newest"],
                    ["used", "Most used"],
                  ] as const
                ).map(([v, label]) => (
                  <button key={v} type="button" role="radio" aria-checked={sort === v} onClick={() => setSort(v)} className={`${segment(sort === v)} px-2.5`}>
                    {label}
                  </button>
                ))}
              </div>
              <div className="max-sm:hidden">
                <DensitySwitch value={density} onChange={setDensity} />
              </div>
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

            <div className={`mt-4 grid ${GRID[density]}`}>
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
      <div className="relative aspect-[4/3] w-full border-b border-chrome-line">
        {/* Absolute, so a tall photo can't stretch the card. */}
        <div className="absolute inset-x-[10%] inset-y-[7%] flex items-center justify-center [container-type:size]">
          {src && <img src={src} srcSet={srcSet} sizes="(min-width: 768px) 15vw, 45vw" alt="" loading="lazy" style={style} className="object-contain" />}
        </div>
        {isNew && <MarkIcon why="new" />}
      </div>
      <div className="flex flex-1 flex-col px-3 pb-3 pt-2.5">
        {/* Name first, then brand. The whole card opens the item (the link stretches over it); the brand button sits above. */}
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
        <button
          type="button"
          onClick={() => onBrand(item.brand)}
          className={`relative z-10 self-start truncate pb-1 pt-0.5 text-left text-xs font-medium text-ink-muted outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-brand`}
        >
          <span className={nameLink}>{item.brand}</span>
        </button>
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
  kindCounts,
  types,
  type,
  onType,
  brands,
  brand,
  setBrand,
  onClear,
}: {
  kind: Kind;
  kindCounts: Record<Kind, number>;
  types: [string, number][];
  type: string | null;
  onType: (kind: Kind, type: string | null) => void;
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
  const count = (n: number) => <span className="shrink-0 text-xs tabular-nums text-ink-muted">{n.toLocaleString("en-US")}</span>;
  return (
    <div className="flex flex-col gap-5 pt-1">
      {/* Every pedal, a pedal type, or pedalboards. */}
      <div>
        <h3 className={filterHeading}>Type</h3>
        <div role="radiogroup" aria-label="Type" className="grid gap-0.5">
          <button type="button" role="radio" aria-checked={kind === "pedal" && type === null} onClick={() => onType("pedal", null)} className={listRow(kind === "pedal" && type === null)}>
            <span className="truncate">All pedals</span>
            {count(kindCounts.pedal)}
          </button>
          {types.map(([t, n]) => {
            const on = kind === "pedal" && type === t;
            return (
              <button key={t} type="button" role="radio" aria-checked={on} onClick={() => onType("pedal", on ? null : t)} className={`${listRow(on)} pl-4`}>
                <span className="truncate">{t}</span>
                {count(n)}
              </button>
            );
          })}
          {kindCounts.pedalboard > 0 && (
            <button
              type="button"
              role="radio"
              aria-checked={kind === "pedalboard"}
              onClick={() => onType("pedalboard", null)}
              className={`${listRow(kind === "pedalboard")} mt-1`}
            >
              <span className="truncate">Pedalboards</span>
              {count(kindCounts.pedalboard)}
            </button>
          )}
        </div>
      </div>

      {/* The brand list scrolls on its own; past it, the whole sidebar scrolls. */}
      <div>
        <h3 className={filterHeading}>Brand</h3>
        <input
          type="search"
          value={find}
          onChange={(e) => setFind(e.target.value)}
          placeholder={`Find a brand (${brands.length.toLocaleString("en-US")})`}
          aria-label="Find a brand"
          className="mb-1.5 h-8 w-full rounded-control border border-chrome-line bg-surface px-2.5 text-[13px] outline-none focus:ring-2 focus:ring-brand"
        />
        <div role="radiogroup" aria-label="Brand" className="-m-1 grid max-h-72 gap-0.5 overflow-y-auto p-1">
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

/** New (the word NEW, small and bold, in flamingo) or Trending (a tangerine arrow): a colored mark in a card's corner. */
function MarkIcon({ why }: { why: "new" | "trending" }) {
  if (why === "new")
    return (
      <span className="absolute left-2.5 top-2.5 z-10 text-[10px] font-bold leading-[17px] text-guide">NEW</span>
    );
  return (
    <span role="img" aria-label="Trending" {...tip("Trending")} className="absolute left-2.5 top-2.5 z-10 flex text-tangerine">
      <TrendingUp size={17} strokeWidth={2.5} aria-hidden />
    </span>
  );
}

/** One bento tile: the photo, fit to the tile, and just the name, with a small Trending or New icon. */
function BentoTile({
  pick,
  kind,
  manifest,
  size,
  onOpen,
}: {
  pick: BentoPick;
  kind: Kind;
  manifest: Manifest;
  size: string;
  onOpen: (kind: Kind, item: CatalogItem) => void;
}) {
  const { item, why } = pick;
  const thumb = thumbUrl(manifest, kind, item.image);
  const full = canvasImageUrl(manifest, kind, item.image);
  return (
    <a
      href={itemHref(kind, item)}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        e.preventDefault();
        onOpen(kind, item);
      }}
      aria-label={`${item.brand} ${item.name}, ${why === "new" ? "new" : "trending"}`}
      className={`group relative flex flex-col overflow-hidden rounded-panel bg-card ring-chrome-line outline-none transition-shadow hover:ring-1 focus-visible:ring-2 focus-visible:ring-brand ${size}`}
    >
      <span className="relative min-h-0 flex-1">
        {thumb && (
          <img
            src={thumb}
            srcSet={full ? `${thumb} 128w, ${full} ${kind === "pedal" ? 1200 : 2400}w` : undefined}
            sizes="(min-width: 640px) 25vw, 50vw"
            alt=""
            loading="lazy"
            className="absolute inset-x-[10%] inset-y-[8%] size-[80%] object-contain transition-transform duration-300 group-hover:scale-[1.03]"
          />
        )}
      </span>
      <span className="flex items-center gap-1.5 px-3 pb-2.5">
        <span className="min-w-0 truncate text-xs font-semibold">{item.name}</span>
      </span>
      <MarkIcon why={why} />
    </a>
  );
}

/** A brand beside the bento: a small photo of its most added item, then its name. Opens the brand's page. */
function BrandTile({
  brand,
  item,
  kind,
  manifest,
  onPick,
  className = "",
}: {
  brand: string;
  item: CatalogItem;
  kind: Kind;
  manifest: Manifest;
  onPick: () => void;
  className?: string;
}) {
  const thumb = thumbUrl(manifest, kind, item.image);
  return (
    <button
      type="button"
      onClick={onPick}
      className={`group flex min-h-0 items-center gap-2.5 overflow-hidden rounded-panel bg-card px-2.5 text-left ring-chrome-line outline-none transition-shadow hover:ring-1 focus-visible:ring-2 focus-visible:ring-brand ${className}`}
    >
      <span className="grid size-9 shrink-0 place-items-center">
        {thumb && <img src={thumb} alt="" loading="lazy" className="max-h-9 max-w-9 object-contain transition-transform duration-300 group-hover:scale-105" />}
      </span>
      <span className="min-w-0 truncate text-[13px] font-semibold">{brand}</span>
    </button>
  );
}


const fmt = (n: number) => String(Math.round(n * 100) / 100);

function CardSkeleton() {
  return (
    <div className="overflow-hidden rounded-panel bg-card" aria-hidden>
      <div className="aspect-[4/3] w-full animate-pulse border-b border-chrome-line bg-surface-hover" />
      <div className="space-y-2 px-3 pb-3 pt-2.5">
        <div className="h-3 w-1/2 animate-pulse rounded-inner bg-surface-hover" />
        <div className="h-3.5 w-3/4 animate-pulse rounded-inner bg-surface-hover" />
      </div>
    </div>
  );
}
