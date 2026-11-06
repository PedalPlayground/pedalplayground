import { Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { PageHeader, type PageDialog } from "../components/PageHeader";
import { thumbUrl, type Kind, type Manifest } from "../lib/catalog";
import { indexItem, search as searchItems } from "../lib/search";
import { fetchGearUsage } from "../lib/trending";
import type { CatalogItem } from "../lib/types";
import { useAuth } from "../store/auth";
import { ItemPage, itemHref } from "./ItemPage";
import { useCatalog } from "../store/catalog";

type GearSort = "az" | "new" | "used";

/** The filters live in the URL, so a brand page is just a link: /gear/?brand=Boss. */
interface Filters {
  kind: Kind;
  brand: string | null;
  query: string;
  sort: GearSort;
}

function readFilters(): Filters {
  const p = new URLSearchParams(window.location.search);
  const sort = p.get("sort");
  return {
    kind: p.get("kind") === "boards" ? "pedalboard" : "pedal",
    brand: p.get("brand") || null,
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
  if (f.query.trim()) p.set("q", f.query.trim());
  if (f.sort !== "az") p.set("sort", f.sort);
  const qs = p.toString();
  return `${window.location.pathname}${qs ? `?${qs}` : ""}`;
}

function writeFilters(f: Filters) {
  history.replaceState(null, "", filtersHref(f));
}

const PAGE = 60;
/** Pedals are drawn at one shared scale, so you can compare sizes at a glance (boards are fit to the card). */
const PX_PER_INCH = 16;
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

  // Search as you type, after a short pause.
  useEffect(() => {
    const t = setTimeout(() => setSearch(query), 200);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    // An item's page owns the URL while it's open.
    if (readItem()) return;
    writeFilters({ kind, brand, query: search, sort });
    setShown(PAGE);
    scroller.current?.scrollTo({ top: 0 });
  }, [kind, brand, search, sort]);

  // The browser's back and forward move between the grid and item pages.
  useEffect(() => {
    const onPop = () => {
      const next = readItem();
      setOpen(next);
      const f = readFilters();
      setKind(f.kind);
      if (!next) {
        setBrand(f.brand);
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
    writeFilters({ kind, brand, query: search, sort });
  };

  /** A brand link on an item page: that brand's grid, as a new history step. */
  const brandFromItem = (b: string) => {
    const k = open?.kind ?? kind;
    history.pushState(null, "", filtersHref({ kind: k, brand: b, query: "", sort }));
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

  const index = useMemo(() => all.map(indexItem), [all]);

  const { items, partial } = useMemo(() => {
    const scoped = brand ? index.filter((e) => e.item.brand === brand) : index;
    const found = searchItems(scoped, search);
    // A search ranks by match; sorting only reorders the full list.
    if (search.trim()) return found;
    const list = [...found.items];
    if (sort === "new") list.sort((a, b) => (b.added ?? "").localeCompare(a.added ?? ""));
    if (sort === "used") list.sort((a, b) => (usage.get(`${kind}:${b.image}`) ?? 0) - (usage.get(`${kind}:${a.image}`) ?? 0));
    return { items: list, partial: false };
  }, [index, brand, search, sort, usage, kind]);

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

  const noun = kind === "pedal" ? "pedals" : "pedalboards";
  const total = items.length.toLocaleString("en-US");

  // Pages other than the playground scroll inside their own container (the playground locks page scrolling).
  return (
    <div ref={scroller} className="h-dvh overflow-y-auto overscroll-contain bg-chrome font-sans text-ink">
      <PageHeader current="gear" dialog={dialog} setDialog={setDialog} />

      {open && (
        <main className="mx-auto max-w-6xl px-4 pb-16 pt-6">
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
      <main className={`mx-auto max-w-6xl px-4 pb-16 pt-8 ${open ? "hidden" : ""}`}>
        {brand ? (
          <>
            <button type="button" onClick={() => pickBrand(null)} className="text-[13px] font-semibold text-brand hover:underline">
              All brands
            </button>
            <h1 className="mt-1 text-2xl font-bold tracking-[-0.01em]">{brand}</h1>
          </>
        ) : (
          <h1 className="text-2xl font-bold tracking-[-0.01em]">Gear</h1>
        )}
        <p className="mt-1 text-sm text-ink-muted">
          {manifest
            ? brand
              ? `${total} ${noun} from ${brand} in the catalog.`
              : `Every pedal and pedalboard in the catalog: ${manifest.pedals.length.toLocaleString("en-US")} pedals and ${manifest.pedalboards.length.toLocaleString("en-US")} boards from ${new Set(manifest.pedals.map((p) => p.brand)).size.toLocaleString("en-US")} brands.`
            : "Every pedal and pedalboard in the catalog."}
        </p>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
          <label className="relative block sm:w-72">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-icon" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={brand ? `Search ${brand}` : `Search ${noun}`}
              aria-label={`Search ${noun}`}
              className="h-9 w-full rounded-control border border-line bg-surface pl-9 pr-3 text-sm outline-none focus:border-brand"
            />
          </label>
          <div className="flex items-center gap-2">
            <div role="group" aria-label="Kind" className="flex gap-2">
              <button type="button" className={chip(kind === "pedal")} aria-pressed={kind === "pedal"} onClick={() => setKind("pedal")}>
                Pedals
              </button>
              <button
                type="button"
                className={chip(kind === "pedalboard")}
                aria-pressed={kind === "pedalboard"}
                onClick={() => {
                  setKind("pedalboard");
                  // Few pedal brands make boards, so start the boards over from every brand.
                  pickBrand(null);
                }}
              >
                Boards
              </button>
            </div>
            <select
              value={brand ?? ""}
              onChange={(e) => pickBrand(e.target.value || null)}
              aria-label="Brand"
              className="h-9 min-w-0 flex-1 rounded-control border border-line bg-surface px-2.5 text-sm outline-none focus:border-brand sm:w-48 sm:flex-none"
            >
              <option value="">All brands</option>
              {brands.map(([b, n]) => (
                <option key={b} value={b}>
                  {b} ({n})
                </option>
              ))}
            </select>
          </div>
          <div role="radiogroup" aria-label="Sort" className="flex shrink-0 self-start rounded-control bg-ink/[0.06] p-0.5 sm:ml-auto sm:self-auto">
            {(
              [
                ["az", "A–Z"],
                ["new", "Newest"],
                ["used", "Most used"],
              ] as const
            ).map(([v, label]) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={sort === v}
                onClick={() => setSort(v)}
                className={`h-7 rounded-[3px] px-2.5 text-xs font-semibold transition-colors ${sort === v ? "bg-surface text-ink shadow-sm" : "text-ink-muted hover:text-ink"}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {search.trim() && manifest && (
          <p className="mt-4 text-sm text-ink-muted">
            {items.length
              ? partial
                ? `Nothing matched every word. Here are ${total} close matches.`
                : `${total} ${items.length === 1 ? noun.slice(0, -1) : noun} found.`
              : null}
          </p>
        )}

        <div className="mt-6 grid grid-cols-2 gap-3 min-[560px]:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
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
            No {noun} match{brand ? ` in ${brand}` : ""}. Try another search{brand ? " or brand" : ""}.
          </p>
        )}
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
  // Pedals keep their real size against each other; anything too big for the card (and every board) is fit to it.
  const style =
    kind === "pedal"
      ? { width: item.width * PX_PER_INCH, height: item.height * PX_PER_INCH, maxWidth: "100%", maxHeight: "100%" }
      : { width: "100%", height: "100%" };
  return (
    <article className="group relative flex flex-col overflow-hidden rounded-panel bg-surface shadow-panel transition-shadow focus-within:ring-2 focus-within:ring-brand hover:shadow-[0_8px_28px_rgb(16_18_27/0.14),0_0_0_1px_rgb(16_18_27/0.05)]">
      <div className="relative aspect-[4/3] w-full bg-canvas">
        {/* Absolute, so a tall photo can't stretch the card. */}
        <div className="absolute inset-3 flex items-center justify-center">
          {src && <img src={src} alt="" loading="lazy" style={style} className="object-contain" />}
        </div>
        {isNew && <span className="absolute left-2 top-2 rounded-full bg-brand px-2 py-0.5 text-[11px] font-semibold text-white">New</span>}
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

const fmt = (n: number) => String(Math.round(n * 100) / 100);

function CardSkeleton() {
  return (
    <div className="overflow-hidden rounded-panel bg-surface shadow-panel" aria-hidden>
      <div className="aspect-[4/3] w-full animate-pulse bg-surface-hover" />
      <div className="space-y-2 px-3 pb-3 pt-2.5">
        <div className="h-3 w-1/2 animate-pulse rounded bg-surface-hover" />
        <div className="h-3.5 w-3/4 animate-pulse rounded bg-surface-hover" />
      </div>
    </div>
  );
}
