import { ArrowLeft, Search, SlidersHorizontal, TrendingUp } from "lucide-react";
import { tip } from "../components/Tooltip";
import { useEffect, useMemo, useRef, useState } from "react";
import { PageHeader, type PageDialog } from "../components/PageHeader";
import { fetchGalleryBoards } from "../lib/gallery";
import { canvasImageUrl, itemTypes, thumbUrl, type Kind, type Manifest } from "../lib/catalog";
import { indexItem, search as searchItems } from "../lib/search";
import { PEDAL_TYPES } from "../lib/specs";
import { Modal } from "../components/Modal";
import { Meta } from "../components/Meta";
import { DensitySwitch, useDensity, type Density } from "../components/DensitySwitch";
import { fetchGearUsage, fetchHot, type HotEntry, type TrendingEntry } from "../lib/trending";
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
/** How many of the hottest items get the hot mark on full cards. */
const HOT_MARKED = 40;
/** The month's most added items (after accessories and staple types) that sit out of Hot, as everyday staples. */
const STAPLE_COUNT = 30;
/** Where the hero's photos sit: big ones cropped by the band's right and bottom edges, in a loose fan. */
const HERO_SPOTS = [
  "right-[3%] top-[16%] h-[115%] w-[28%] rotate-[4deg]",
  "right-[34%] top-[26%] h-[105%] w-[26%] -rotate-[5deg]",
  "right-[63%] top-[34%] h-[95%] w-[24%] rotate-[3deg]",
];
/** Types that are staples by nature, left out of Hot. */
const STAPLE_TYPES = new Set(["Tuner", "Volume / Expression", "Utility"]);
/** Board accessories and wireless systems, left out of Hot. */
const ACCESSORY = /\b(mount|connector|coupler|cable|patch|zip|velcro|riser|bracket|power supply|wireless)\b/i;
/** Switchers, loopers of loops, buffers and the like: fine gear, dull photos. Kept out of the hero and brand tiles. */
const PLAIN = /\b(a\/?b(\/?y)?|aby|switch(er)?|loop(er)? switch|buffer|junction|router|splitter|tuner|di|mute)\b/i;
const showy = (c: CatalogItem) => !/placeholder/i.test(c.image) && !STAPLE_TYPES.has(c.type ?? "") && !ACCESSORY.test(c.name) && !PLAIN.test(c.name);
/**
 * The Trending gear bento: 8 tiles whose sizes fill the grid exactly (dense packing). Four columns: a big tile, a tall
 * one and six singles (3 full rows). Two columns: the tall one is single and the last tile hides (5 rows).
 */
const BENTO_COUNT = 8;
const BENTO = ["col-span-2 row-span-2", "sm:row-span-2", "", "", "", "", "", "max-sm:hidden"];
/**
 * Newly added: one row under the bento whose tiles line up with its columns. Twelve on laptops (three per bento column),
 * eight on tablets (two per column), and three rows of four on phones.
 */
const NEWLY_COUNT = 12;
/**
 * Big mass-market makers, left out of the brand tiles so they feature smaller, well-loved brands (they're still in the
 * brand filter). Lowercase.
 */
const MASS_BRANDS = new Set([
  "boss", "electro-harmonix", "mxr", "dunlop", "tc electronic", "ibanez", "line 6", "behringer", "digitech", "zoom",
  "joyo", "mooer", "nux", "donner", "harley benton", "hotone", "m-vave", "valeton", "flamma", "caline", "ammoon",
  "kmise", "rowin", "biyang", "fender", "vox", "korg", "yamaha", "danelectro", "dod", "ik multimedia", "peterson",
  "ernie ball", "shure", "rockboard", "pedaltrain", "voodoo lab", "truetone", "cioks", "mosky", "sonicake", "amazon basics",
]);
/**
 * Flashy boutique makers with great photos. They lead Brands to know (in this order, then by how much they're used)
 * and fill the hero's photos when no filter is on.
 */
const FEATURED_BRANDS = [
  "OBNE", "Spaceman", "Cornerstone", "Chase Bliss", "EAE", "Meris", "GFI System", "Eventide",
  "Fairfield Circuitry", "Hologram Electronics", "Empress", "Source Audio", "Poly Effects", "Morningstar",
  "Death By Audio", "Montreal Assembly", "Drolo", "Matthews Effects", "Beetronics", "Red Panda", "Benson",
  "Jackson Audio", "Origin Effects", "Vemuram", "Collision Devices", "Gamechanger Audio", "Dr Scientist", "SolidGoldFX",
  "Caroline", "KMA", "Rainger FX", "Pine Box Customs", "Wren And Cuff", "Strymon", "EarthQuaker",
  "Walrus Audio", "Mask Audio Electronics", "Hungry Robot", "JPTR FX", "Anasounds", "Fuzzrocious",
];
/** Trav's own picks (boutique, then high tech), always first in Brands to know. */
const LEAD_BRANDS = 8;
/** Brands beside the bento: two columns of eight on laptops. */
const BRAND_TILES = 16;


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
  const [hotList, setHotList] = useState<{ rising: HotEntry[]; monthTop: TrendingEntry[] }>({ rising: [], monthTop: [] });
  useEffect(() => void fetchHot().then(setHotList), []);

  // Search as you type, after a short pause.
  useEffect(() => {
    const t = setTimeout(() => setSearch(query), 200);
    return () => clearTimeout(t);
  }, [query]);

  /** The filters last written to the URL, to tell a new view (a history step) from more typing (no step). */
  const lastFilters = useRef<Filters | null>(null);
  useEffect(() => {
    // An item's page owns the URL while it's open.
    if (readItem()) return;
    const f = { kind, brand, type, query: search, sort };
    const href = filtersHref(f);
    const prev = lastFilters.current;
    lastFilters.current = f;
    if (href !== window.location.pathname + window.location.search) {
      // A different brand, type, kind or sort is a new view, so Back returns to the last one. Search text just updates
      // the address as you type.
      // (A brand respelled to the catalog's casing isn't a new view either.)
      const typingOnly =
        prev && prev.kind === f.kind && prev.brand?.toLowerCase() === f.brand?.toLowerCase() && prev.type === f.type && prev.sort === f.sort;
      if (prev && !typingOnly) history.pushState(null, "", href);
      else writeFilters(f);
    }
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

  /**
   * Hot gear in this list's kind: rising adds (see fetchHot), minus gear that's a staple by nature (tuners, volume
   * pedals, utilities) and board accessories (mounts, connectors, cables).
   */
  const hotItems = useMemo(() => {
    const byKey = new Map(all.map((c) => [c.image, c]));
    const ok = (c: CatalogItem | undefined): c is CatalogItem => !!c && !STAPLE_TYPES.has(c.type ?? "") && !ACCESSORY.test(c.name);
    // The month's most added real gear in this kind: everyday staples, so they sit out.
    const staples = new Set(
      hotList.monthTop
        .filter((e) => e.kind === kind)
        .map((e) => byKey.get(e.image))
        .filter(ok)
        .slice(0, STAPLE_COUNT)
        .map((c) => c.image),
    );
    // Newer gear gets a lift: added to the catalog in the last year counts 1.6x, in the last three years 1.3x.
    const now = Date.now();
    const recency = (c: CatalogItem) => {
      const age = c.added ? (now - Date.parse(c.added)) / (365 * 864e5) : Infinity;
      return age <= 1 ? 1.6 : age <= 3 ? 1.3 : 1;
    };
    return hotList.rising
      .filter((h) => h.kind === kind && !staples.has(h.image))
      .map((h) => ({ c: byKey.get(h.image), score: h.score }))
      .filter((h): h is { c: CatalogItem; score: number } => ok(h.c))
      .map((h) => ({ c: h.c, score: h.score * recency(h.c) }))
      .sort((a, b) => b.score - a.score)
      .map((h) => h.c);
  }, [hotList, all, kind]);
  /** A few photos for the hero: the brand's most added, or the hottest (of the chosen type), else the most added. */
  const heroPicks = useMemo(() => {
    const used = (c: CatalogItem) => usage.get(`${kind}:${c.image}`) ?? 0;
    // Unfiltered, the next hottest after the ones in the bento, so the hero doesn't repeat it.
    if (brand || type) {
      return (brand ? [...items].sort((a, b) => used(b) - used(a)) : items).slice(0, 14);
    }
    // Unfiltered: the most added pedal from each featured boutique brand, in the list's order.
    const best = new Map<string, CatalogItem>();
    for (const c of items) {
      const b = best.get(c.brand);
      if (FEATURED_BRANDS.includes(c.brand) && showy(c) && (!b || used(c) > used(b))) best.set(c.brand, c);
    }
    const picks = FEATURED_BRANDS.map((b) => best.get(b)).filter((c): c is CatalogItem => !!c);
    return (picks.length ? picks : items).slice(0, 14);
  }, [brand, type, items, hotItems, usage, kind]);
  /** The hot set for marking full cards. */
  const hotKeys = useMemo(() => new Set(hotItems.slice(0, HOT_MARKED).map((c) => c.image)), [hotItems]);

  /** The shelves over the full list (no brand or search): hot, newest, and the most used brands. */
  const browsing = !brand && !type && !search.trim();
  const shelves = useMemo(() => {
    if (!manifest || !browsing) return null;
    const hot = hotItems.slice(0, BENTO_COUNT);
    const fresh = [...all]
      .filter((c) => c.added)
      .sort((a, b) => b.added!.localeCompare(a.added!))
      .slice(0, BENTO_COUNT);
    // Trending gear: hot and new taking turns, each item once. The next newest fill the Newly added row.
    const picks: { item: CatalogItem; why: "hot" | "new" }[] = [];
    const seen = new Set<string>();
    for (let n = 0; n < BENTO_COUNT && picks.length < BENTO_COUNT; n++) {
      for (const [item, why] of [[hot[n], "hot"], [fresh[n], "new"]] as const) {
        if (item && !seen.has(item.image) && picks.length < BENTO_COUNT) {
          seen.add(item.image);
          picks.push({ item, why });
        }
      }
    }
    const newly = [...all]
      .filter((c) => c.added && !seen.has(c.image))
      .sort((a, b) => b.added!.localeCompare(a.added!))
      .slice(0, NEWLY_COUNT);
    // Brands to explore: well-loved makers, not the mass-market names. Adds over the last year and month (each list
    // is the top 100 items), weighed against how many items the brand has, so a smaller catalog of favorites counts.
    const monthAdds = new Map(hotList.monthTop.filter((e) => e.kind === kind).map((e) => [e.image, Number(e.adds)]));
    const brandUse = new Map<string, number>();
    const brandItems = new Map<string, number>();
    for (const c of all) {
      brandItems.set(c.brand, (brandItems.get(c.brand) ?? 0) + 1);
      const n = (usage.get(`${kind}:${c.image}`) ?? 0) + (monthAdds.get(c.image) ?? 0);
      if (n && !MASS_BRANDS.has(c.brand.toLowerCase())) brandUse.set(c.brand, (brandUse.get(c.brand) ?? 0) + n);
    }
    for (const [b, n] of brandUse) brandUse.set(b, n / Math.sqrt(brandItems.get(b) ?? 1));
    // Each brand shown with its most added item's photo.
    const brandPhoto = new Map<string, { item: CatalogItem; n: number }>();
    for (const c of all) {
      const n = (usage.get(`${kind}:${c.image}`) ?? 0) + (monthAdds.get(c.image) ?? 0);
      const best = brandPhoto.get(c.brand);
      if (n && showy(c) && (!best || n > best.n)) brandPhoto.set(c.brand, { item: c, n });
    }
    // Brands with no recent adds still get a photo: their newest item.
    for (const c of all) {
      const best = brandPhoto.get(c.brand);
      if (!best || (best.n === 0 && showy(c) && (!showy(best.item) || (c.added ?? "") > (best.item.added ?? "")))) brandPhoto.set(c.brand, { item: c, n: best?.n ?? 0 });
    }
    // The named picks first, then the rest of the featured list by use, then anyone else well used.
    const featured = FEATURED_BRANDS.filter((b) => brandPhoto.has(b));
    const byUse = (x: string, y: string) => (brandUse.get(y) ?? 0) - (brandUse.get(x) ?? 0);
    const order = [
      ...featured.slice(0, LEAD_BRANDS),
      ...featured.slice(LEAD_BRANDS).sort(byUse),
      ...[...brandUse.keys()].filter((b) => !featured.includes(b)).sort(byUse),
    ];
    const topBrands = order
      .slice(0, BRAND_TILES)
      .map((b) => ({ brand: b, item: brandPhoto.get(b)!.item, count: brandItems.get(b) ?? 0 }));
    return { topBrands, picks, newly };
  }, [manifest, browsing, all, hotItems, hotList, kind, usage]);


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
        placeholder={brand ? `Search ${brand} gear` : "Search for gear"}
        aria-label={brand ? `Search ${brand} gear` : "Search for gear"}
        className="h-11 w-full rounded-control bg-surface pl-10 pr-3 text-[15px] outline-none focus:ring-2 focus:ring-brand"
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
        {/* The top of the page: a compact hero band with the heading, the count and a big search, and a few cropped
            pedal photos spilling off its right edge (laptops and up). */}
        <header className="relative isolate overflow-hidden rounded-container bg-[color-mix(in_srgb,var(--color-brand)_9%,var(--color-card))] px-5 py-6 sm:px-8 sm:py-8">
          <div className="relative z-10 max-w-xl">
            {brand && (
              <button type="button" onClick={() => pickBrand(null)} className="mb-1.5 flex items-center gap-1 text-[13px] font-semibold text-brand">
                <ArrowLeft size={14} strokeWidth={2.5} />
                <span className="underline-offset-2 hover:underline">All brands</span>
              </button>
            )}
            <h1 className="text-[28px] font-bold leading-tight tracking-[-0.02em] sm:text-3xl">{brand ?? type ?? "Gear"}</h1>
            <p className="mt-1.5 text-sm text-ink-muted">
              {manifest
                ? brand || type
                  ? `${total} ${type && brand ? `${type.toLowerCase()} ` : ""}${noun}${brand ? ` from ${brand}` : ""} in the catalog.`
                  : (
                    <Meta
                      parts={[
                        `${manifest.pedals.length.toLocaleString("en-US")} pedals`,
                        `${manifest.pedalboards.length.toLocaleString("en-US")} pedalboards`,
                        `${new Set([...manifest.pedals, ...manifest.pedalboards].map((p) => p.brand)).size.toLocaleString("en-US")} brands`,
                      ]}
                    />
                  )
                : null}
            </p>
            <div className="mt-5 w-full max-w-md">{searchBox}</div>
          </div>
          {manifest && heroPicks.length > 0 && <HeroArt picks={heroPicks} kind={kind} manifest={manifest} />}
        </header>

        {/* Trending gear and Newly added on the left, Popular brands on the right stretching to their height (stacked
            below laptop width). Newly added uses eight columns with the bento's gap, so each pair of tiles lines up with
            one bento column. */}
        {shelves && (
          <div className="mt-8 grid gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] xl:gap-6">
            <div className="min-w-0">
              {shelves.picks.length > 0 && (
                <section>
                  <h2 className="text-lg font-bold tracking-[-0.01em]">Trending gear</h2>
                  <div className="mt-3 grid grid-flow-dense auto-rows-[8.5rem] grid-cols-2 gap-3 sm:grid-cols-4 2xl:auto-rows-[10rem]">
                    {shelves.picks.map(({ item, why }, i) => (
                      <BentoTile key={item.image} item={item} why={why} kind={kind} manifest={manifest!} size={BENTO[i % BENTO.length]} onOpen={openItem} />
                    ))}
                  </div>
                </section>
              )}
              {shelves.newly.length > 0 && (
                <section className="mt-8">
                  <div className="flex items-center justify-between gap-3">
                    <h2 className={`min-w-0 flex-1 text-lg font-bold tracking-[-0.01em] text-brand ${squiggleRule}`}>Newly added</h2>
                    {sort !== "new" && (
                      <button type="button" onClick={() => setSort("new")} className="text-[13px] font-semibold text-brand hover:underline">
                        See all new
                      </button>
                    )}
                  </div>
                  <div className="mt-3 grid grid-cols-4 gap-3 sm:grid-cols-8 xl:grid-cols-12">
                    {shelves.newly.map((item, i) => (
                      <PhotoTile key={item.image} item={item} kind={kind} manifest={manifest!} onOpen={openItem} className={i >= 8 ? "sm:max-xl:hidden" : ""} />
                    ))}
                  </div>
                </section>
              )}
            </div>
            {shelves.topBrands.length > 0 && (
              <section className="flex flex-col">
                <h2 className="text-lg font-bold tracking-[-0.01em]">Brands to know</h2>
                <div className="mt-3 grid flex-1 auto-rows-[3.5rem] grid-cols-2 gap-2 sm:grid-cols-4 xl:auto-rows-fr xl:grid-cols-2">
                  {shelves.topBrands.map(({ brand: b, item, count }, i) => (
                    // Phones show the top eight.
                    <BrandTile key={b} brand={b} item={item} count={count} kind={kind} manifest={manifest!} onPick={() => pickBrand(b)} className={i >= 8 ? "max-sm:hidden" : ""} />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}

        {/* What's listed and how many, then the controls (Filters on phones and tablets, sort, card size), across the
            full width above the sidebar and the grid. */}
        <div className={`${shelves ? "mt-12" : "mt-8"} flex flex-wrap items-center gap-x-3 gap-y-2`}>
          {/* Phones: the card size shares the heading's row, so Filters and sort fit on the next. */}
          <div className="flex min-w-0 flex-1 items-center gap-3 max-sm:basis-full">
            <h2 className="flex min-w-0 flex-1 items-baseline gap-2.5">
              <span className="truncate text-lg font-bold tracking-[-0.01em]">{browsing ? `All ${noun}` : search.trim() ? "Results" : `${type ?? brand ?? "All"} ${type || !brand ? "" : noun}`.trim()}</span>
              {manifest && (
                <span className="shrink-0 text-sm tabular-nums text-ink-muted">
                  {total} {items.length === 1 ? noun.slice(0, -1) : noun}
                  {partial && search.trim() ? ", close matches" : ""}
                </span>
              )}
            </h2>
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

        {/* The grid, with the filters beside it from laptop width. */}
        <div className={`mt-4 lg:grid lg:grid-cols-[240px_minmax(0,1fr)] lg:items-start lg:gap-8`}>
          {/* Laptops and up: the filters in a sidebar that stays in view while the grid scrolls. */}
          <aside aria-label="Filters" className="hidden lg:sticky lg:top-[4.5rem] lg:-mx-1 lg:-mt-1 lg:block lg:pt-1 lg:max-h-[calc((100dvh-6rem)/var(--page-zoom,1))] lg:overflow-y-auto lg:px-1 lg:pb-4">
            {filterPanel}
          </aside>

          <div className="min-w-0">
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

            <div className={`grid ${GRID[density]}`}>
              {manifest
                ? items.slice(0, shown).map((item) => (
                    <GearCard
                      key={item.image}
                      item={item}
                      kind={kind}
                      manifest={manifest}
                      isNew={!!item.added && item.added >= newSince}
                      isHot={hotKeys.has(item.image)}
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
  isHot,
  onBrand,
  onOpen,
}: {
  item: CatalogItem;
  kind: Kind;
  manifest: Manifest;
  isNew: boolean;
  isHot?: boolean;
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
    <article className="group relative flex flex-col overflow-hidden rounded-panel bg-card transition-colors hover:bg-card-hover focus-within:ring-2 focus-within:ring-brand">
      <div className="relative aspect-[4/3] w-full border-b border-chrome-line">
        {/* Absolute, so a tall photo can't stretch the card. */}
        <div className="absolute inset-x-[10%] inset-y-[7%] flex items-center justify-center [container-type:size]">
          {src && <img src={src} srcSet={srcSet} sizes="(min-width: 768px) 15vw, 45vw" alt="" loading="lazy" style={style} className="object-contain" />}
        </div>
      </div>
      <div className="flex flex-1 flex-col px-3 pb-3 pt-2.5">
        {/* Name first, then brand. The whole card opens the item (the link stretches over it); the brand button sits above. */}
        <h2 className="line-clamp-2 text-[13px] font-semibold leading-snug">
          {isNew && <Mark why="new" />}
          {isHot && <Mark why="hot" />}
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

/** Hero art variants to compare, picked with ?hero= in the address. */
const HERO_VARIANTS = ["row", "single", "mosaic", "mosaic-bleed", "mosaic-strip", "mosaic-bento", "mosaic-wall", "board", "fan"] as const;
type HeroVariant = (typeof HERO_VARIANTS)[number];
// Read when the page loads, before the filters rewrite the address.
const HERO_VARIANT: HeroVariant = (() => {
  const v = new URLSearchParams(window.location.search).get("hero");
  return (HERO_VARIANTS as readonly string[]).includes(v ?? "") ? (v as HeroVariant) : "row";
})();

/** The picture side of the Gear hero (laptops and up). */
function HeroArt({ picks, kind, manifest }: { picks: CatalogItem[]; kind: Kind; manifest: Manifest }) {
  const variant = HERO_VARIANT;
  const [board, setBoard] = useState<string | null>(null);
  useEffect(() => {
    if (variant !== "board") return;
    void fetchGalleryBoards({ type: null, search: "", sort: "liked", offset: 0, limit: 1 }).then(
      (b) => setBoard(b[0]?.thumbnail ?? null),
      () => undefined,
    );
  }, [variant]);
  const src = (c: CatalogItem) => canvasImageUrl(manifest, kind, c.image) ?? thumbUrl(manifest, kind, c.image) ?? "";
  const shadow = "drop-shadow-[0_8px_18px_rgb(27_28_56/0.18)]";
  const wrap = "pointer-events-none absolute inset-y-0 right-0 hidden lg:block";

  // A row of four, to scale with each other, standing on the band's bottom edge and cropped by it.
  if (variant === "row")
    return (
      <div aria-hidden className={`${wrap} w-[48%] [container-type:size]`}>
        <div className="absolute -bottom-[14%] right-8 flex items-end gap-5">
          {picks.slice(0, 4).map((c) => (
            <img key={c.image} src={src(c)} alt="" className={`w-auto object-contain ${shadow}`} style={{ height: `${Math.min((c.height / 6.5) * 100, 96)}cqh` }} />
          ))}
        </div>
      </div>
    );
  // One pedal, zoomed in and cropped off the right and bottom edges.
  if (variant === "single")
    return (
      <div aria-hidden className={`${wrap} w-[40%]`}>
        <img src={src(picks[0])} alt="" className={`absolute -right-[4%] top-[14%] h-[180%] w-[80%] object-contain object-left-top ${shadow}`} />
      </div>
    );
  // Six small tiles, two rows of three, flush to the band's right side.
  if (variant === "mosaic")
    return (
      <div aria-hidden className="pointer-events-none absolute inset-y-5 right-5 hidden w-[36%] grid-cols-3 grid-rows-2 gap-2 lg:grid">
        {picks.slice(0, 6).map((c) => (
          <span key={c.image} className="relative">
            <img src={src(c)} alt="" className="absolute inset-[6%] size-[88%] object-contain drop-shadow-[0_6px_14px_rgb(27_28_56/0.16)]" />
          </span>
        ))}
      </div>
    );
  const tile = (c: CatalogItem, extra = "") => (
    <span key={c.image} className={`relative ${extra}`}>
      <img src={src(c)} alt="" className="absolute inset-[6%] size-[88%] object-contain drop-shadow-[0_6px_14px_rgb(27_28_56/0.16)]" />
    </span>
  );
  // Bigger tiles, three by two, running off the right and bottom edges.
  if (variant === "mosaic-bleed")
    return (
      <div aria-hidden className="pointer-events-none absolute -bottom-10 -right-10 top-6 hidden w-[46%] grid-cols-3 grid-rows-2 gap-3 lg:grid">
        {picks.slice(0, 6).map((c) => tile(c))}
      </div>
    );
  // One row of square tiles, vertically centered, the last one cut by the right edge.
  if (variant === "mosaic-strip")
    return (
      <div aria-hidden className="pointer-events-none absolute -right-12 top-1/2 hidden h-[62%] -translate-y-1/2 gap-3 lg:flex">
        {picks.slice(0, 5).map((c) => tile(c, "aspect-square h-full"))}
      </div>
    );
  // A little bento like Trending gear: one big tile and four small ones.
  if (variant === "mosaic-bento")
    return (
      <div aria-hidden className="pointer-events-none absolute inset-y-5 right-5 hidden w-[40%] grid-cols-4 grid-rows-2 gap-2 lg:grid">
        {picks.slice(0, 5).map((c, i) => tile(c, i === 0 ? "col-span-2 row-span-2" : ""))}
      </div>
    );
  // A tilted wall of small tiles bleeding off the top, right and bottom edges.
  if (variant === "mosaic-wall")
    return (
      <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 hidden h-[200%] w-[52%] lg:block">
        <div className="grid h-full -rotate-[10deg] grid-cols-4 grid-rows-4 gap-2.5">
          {Array.from({ length: 16 }, (_, i) => picks[i % picks.length]).map((c, i) => (
            <span key={i} className="relative">
              <img src={src(c)} alt="" className="absolute inset-[6%] size-[88%] object-contain drop-shadow-[0_6px_14px_rgb(27_28_56/0.16)]" />
            </span>
          ))}
        </div>
      </div>
    );
  // The most liked board in Explore, peeking in from the right edge.
  if (variant === "board")
    return board ? (
      <div aria-hidden className={`${wrap} w-[46%]`}>
        <img src={board} alt="" className="absolute -right-[8%] top-[12%] h-[110%] w-auto max-w-none object-contain object-left-top" />
      </div>
    ) : null;
  // The first try: three tilted photos in a loose fan.
  return (
    <div aria-hidden className={`${wrap} w-[44%]`}>
      {picks.slice(0, 3).map((c, i) => (
        <img key={c.image} src={src(c)} alt="" className={`absolute object-contain ${shadow} ${HERO_SPOTS[i]}`} />
      ))}
    </div>
  );
}

/** New (a brand-colored dot) or hot (a tangerine trend line), icon only, before an item's name. */
/** A filled "NEW" tag (Streamline Core's Tag New Square), in the current text color. */
function NewTag({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 14 14" fill="currentColor" aria-hidden className={className}>
      <path fillRule="evenodd" clipRule="evenodd" d="M0 2.5C0 1.67157 0.671573 1 1.5 1h11c0.8284 0 1.5 0.67157 1.5 1.5v9c0 0.8284 -0.6716 1.5 -1.5 1.5h-11C0.671572 13 0 12.3284 0 11.5v-9Zm11.9774 5.97682c-0.0533 0.31994 -0.3301 0.55443 -0.6544 0.55443 -0.2834 0 -0.5354 -0.17989 -0.6275 -0.44782l-0.2549 -0.74137 -0.2548 0.74137c-0.0921 0.26793 -0.34416 0.44782 -0.62748 0.44782 -0.32435 0 -0.60116 -0.23449 -0.65448 -0.55443l-0.48765 -2.92587c-0.04539 -0.27238 0.13862 -0.53 0.411 -0.57539 0.27239 -0.0454 0.53 0.13861 0.5754 0.41099l0.26929 1.61574 0.21138 -0.61491c0.08181 -0.238 0.30574 -0.3978 0.55734 -0.3978 0.2517 0 0.4756 0.1598 0.5574 0.3978l0.2114 0.61491 0.2693 -1.61574c0.0454 -0.27238 0.303 -0.45639 0.5754 -0.411 0.2724 0.0454 0.4564 0.30301 0.411 0.5754l-0.4877 2.92587ZM2.44413 5.1914c-0.12222 -0.18333 -0.35004 -0.26505 -0.56092 -0.2012 -0.21087 0.06385 -0.3551 0.25822 -0.3551 0.47855v3.0625c0 0.27614 0.22385 0.5 0.5 0.5 0.27614 0 0.5 -0.22386 0.5 -0.5V7.12014L3.65375 8.8086c0.12222 0.18333 0.35004 0.26505 0.56092 0.2012 0.21087 -0.06385 0.3551 -0.25822 0.3551 -0.47855v-3.0625c0 -0.27614 -0.22385 -0.5 -0.5 -0.5 -0.27614 0 -0.5 0.22386 -0.5 0.5v1.41111L2.44413 5.1914Zm3.02211 -0.0762c0.09377 -0.09377 0.22095 -0.14645 0.35355 -0.14645H7.6594c0.27615 0 0.5 0.22386 0.5 0.5s-0.22385 0.5 -0.5 0.5H6.31979v0.40369h1.10966c0.27615 0 0.5 0.22385 0.5 0.5 0 0.27614 -0.22385 0.5 -0.5 0.5H6.31979v0.65881H7.6594c0.27615 0 0.5 0.22386 0.5 0.5s-0.22385 0.5 -0.5 0.5H5.81979c-0.27614 0 -0.5 -0.22386 -0.5 -0.5v-3.0625c0 -0.13261 0.05268 -0.25979 0.14645 -0.35355Z" />
    </svg>
  );
}

/**
 * The mark's 14px icon, centered on the capital letters of the text beside it at any font size: the cap height is
 * 0.7em in DM Sans, so the icon's middle sits 0.35em above the baseline.
 */
const markIcon = "inline-block size-[14px] align-[calc(0.35em-7px)]";

function Mark({ why }: { why: "new" | "hot" }) {
  const label = why === "new" ? "New" : "Hot";
  // Inline before the name, so it wraps with the text; the hover label says what it means.
  return (
    <span role="img" aria-label={label} {...tip(label)} className="relative z-10 mr-1.5">
      {why === "new" ? (
        <NewTag className={`${markIcon} text-brand`} />
      ) : (
        <TrendingUp size={14} strokeWidth={2.5} className={`${markIcon} text-tangerine`} aria-hidden />
      )}
    </span>
  );
}

/** One Hot and new tile: the photo, fit to the tile, the name, and a new or hot mark. */
function BentoTile({
  item,
  why,
  kind,
  manifest,
  size,
  onOpen,
}: {
  item: CatalogItem;
  why: "hot" | "new";
  kind: Kind;
  manifest: Manifest;
  size: string;
  onOpen: (kind: Kind, item: CatalogItem) => void;
}) {
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
      aria-label={`${item.brand} ${item.name}`}
      className={`group relative flex flex-col overflow-hidden rounded-panel bg-card outline-none transition-colors hover:bg-card-hover focus-visible:ring-2 focus-visible:ring-brand ${size}`}
    >
      {/* Halfway between centered in the tile and centered above the name: nudged up about 9px. */}
      {thumb && (
        <img
          src={thumb}
          srcSet={full ? `${thumb} 128w, ${full} ${kind === "pedal" ? 1200 : 2400}w` : undefined}
          sizes="(min-width: 640px) 25vw, 50vw"
          alt=""
          loading="lazy"
          className="absolute inset-x-[10%] bottom-[2.8rem] top-[1.7rem] h-[calc(100%-4.5rem)] w-[80%] object-contain transition-transform duration-300 group-hover:scale-[1.03]"
        />
      )}
      <span className="absolute inset-x-0 bottom-0 flex items-center px-3 pb-2.5">
        <span className="min-w-0 truncate text-xs font-semibold">
          <Mark why={why} />
          {item.name}
        </span>
      </span>
    </a>
  );
}

/** A Newly added tile: just the photo, with the name and brand showing on hover or keyboard focus. */
function PhotoTile({
  item,
  kind,
  manifest,
  onOpen,
  className = "",
}: {
  item: CatalogItem;
  kind: Kind;
  manifest: Manifest;
  onOpen: (kind: Kind, item: CatalogItem) => void;
  className?: string;
}) {
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
      aria-label={`${item.name}, ${item.brand}`}
      className={`group relative aspect-square overflow-hidden rounded-panel bg-card outline-none transition-colors hover:bg-card-hover focus-visible:ring-2 focus-visible:ring-brand ${className}`}
    >
      {thumb && (
        <img
          src={thumb}
          srcSet={full ? `${thumb} 128w, ${full} ${kind === "pedal" ? 1200 : 2400}w` : undefined}
          sizes="(min-width: 1280px) 7vw, (min-width: 640px) 10vw, 25vw"
          alt=""
          loading="lazy"
          className="absolute inset-[14%] size-[72%] object-contain transition-[transform,opacity] duration-300 group-hover:scale-95 group-hover:opacity-10 group-focus-visible:opacity-10"
        />
      )}
      <span className="absolute inset-0 flex flex-col justify-end p-2.5 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100">
        <span className="line-clamp-2 text-[11px] font-semibold leading-tight">{item.name}</span>
        <span className="mt-0.5 truncate text-[10px] text-ink-muted">{item.brand}</span>
      </span>
    </a>
  );
}

/**
 * A brand beside the bento: its name, with a zoomed-in photo of its most added item bleeding off the bottom-right
 * corner (the tile crops it). Opens the brand's page.
 */
function BrandTile({
  brand,
  item,
  count,
  kind,
  manifest,
  onPick,
  className = "",
}: {
  brand: string;
  item: CatalogItem;
  count: number;
  kind: Kind;
  manifest: Manifest;
  onPick: () => void;
  className?: string;
}) {
  const thumb = thumbUrl(manifest, kind, item.image);
  const full = canvasImageUrl(manifest, kind, item.image);
  return (
    <button
      type="button"
      onClick={onPick}
      className={`group relative isolate flex min-h-0 items-center overflow-hidden rounded-panel bg-card px-3.5 text-left outline-none transition-colors hover:bg-card-hover focus-visible:ring-2 focus-visible:ring-brand ${className}`}
    >
      {/* Text keeps to the left half and wraps, so it never runs under the photo. */}
      <span className="relative z-10 w-[64%] min-w-0 sm:w-[56%]">
        <span className="line-clamp-2 text-[13px] font-semibold leading-tight">{brand}</span>
        <span className="mt-0.5 block truncate text-[11px] tabular-nums text-ink-muted">
          {count.toLocaleString("en-US")} {kind === "pedal" ? (count === 1 ? "pedal" : "pedals") : count === 1 ? "board" : "boards"}
        </span>
      </span>
      {thumb && (
        <img
          src={full ?? thumb}
          srcSet={full ? `${thumb} 128w, ${full} 1200w` : undefined}
          sizes="200px"
          alt=""
          loading="lazy"
          className="pointer-events-none absolute -right-[6%] top-[18%] h-[220%] w-[36%] object-contain sm:w-[44%] object-left-top transition-transform duration-300 group-hover:-translate-y-1"
        />
      )}
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
