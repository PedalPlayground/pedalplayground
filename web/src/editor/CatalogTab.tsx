import { Archive, ArchiveRestore, ArrowLeft, Copy, Pencil, Search, X } from "lucide-react";
import { tip } from "../components/Tooltip";
import { useEffect, useMemo, useRef, useState } from "react";
import { itemTypes, type Manifest } from "../lib/catalog";
import { PEDAL_TYPES } from "../lib/specs";
import { filterMore, filterRow } from "../components/filterList";
import { TypeCombo } from "../components/TypeCombo";
import { fieldProblems, type Fields } from "../lib/editorChecks";
import { fieldsFrom, getItem, listCatalog, publicUrl, saveDirect, setStatus, sourceUrl, uploadSource, type CatalogFilter, type Item } from "../lib/editorApi";
import { plainField } from "../lib/inputProps";
import { withPublish, type PublishState, type SetNotice } from "./EditorApp";
import { Meta } from "../components/Meta";
import { inputClass, ItemEditor, primaryButton, secondaryButton } from "./ItemEditor";

const PAGE = 100;
const TYPES_COLLAPSED = 6;
const BRANDS_COLLAPSED = 10;

type KindFilter = Item["kind"] | null;

/** The item to open from the address: #catalog?kind=pedal&key=boss-ds1 (the Gear page's Edit in catalog link). */
function linkedItem(): { kind: Item["kind"]; key: string } | null {
  const p = new URLSearchParams(window.location.hash.split("?")[1] ?? "");
  const key = p.get("key");
  return key ? { kind: p.get("kind") === "pedalboard" ? "pedalboard" : "pedal", key } : null;
}

/**
 * The catalog, with the Gear page's filters in a sidebar (kind, type, brand, status) and a search. Tick items to change
 * their types or archive them in bulk; change one item's types right in its row; open an item to fix everything else.
 * Each change saves straight away, filed and approved like any other edit; Publish puts them live together.
 */
export function CatalogTab({
  manifest,
  publisher,
  setNotice,
  userId,
}: {
  manifest: Manifest | null;
  publisher: PublishState;
  setNotice: SetNotice;
  userId: string;
}) {
  const [kind, setKind] = useState<KindFilter>(null);
  const [type, setType] = useState<string | null>(null);
  const [brand, setBrand] = useState<string | null>(null);
  const [status, setStatusFilter] = useState<CatalogFilter["status"]>("live");
  const [text, setText] = useState("");
  const [items, setItems] = useState<Item[] | null>(null);
  const [more, setMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Item | null>(null);
  /** Ticked items, by id. */
  const [selected, setSelected] = useState<Set<number>>(new Set());
  /** Rows saving right now, and rows that failed (by id). */
  const [saving, setSaving] = useState<Set<number>>(new Set());
  const [failed, setFailed] = useState<Map<number, string>>(new Map());
  /** Changes saved since the last publish. */
  const [unpublished, setUnpublished] = useState(0);
  const [bulkBusy, setBulkBusy] = useState<string | null>(null);
  const request = useRef(0);

  const filter: CatalogFilter = { kind, type, brand, text, status };
  const load = async (page: number) => {
    const id = ++request.current;
    try {
      const rows = await listCatalog(filter, page, PAGE);
      if (id !== request.current) return;
      setItems((list) => (page === 0 ? rows : [...(list ?? []), ...rows]));
      setMore(rows.length === PAGE);
      setError(null);
    } catch (e) {
      if (id === request.current) setError((e as Error).message);
    }
  };
  useEffect(() => {
    setItems(null);
    setSelected(new Set());
    anchor.current = null;
    const t = setTimeout(() => void load(0), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, type, brand, status, text]);

  // An open item is its own history step (#catalog?item=<id>), so Back closes it and returns to the list.
  const openItem = (item: Item) => {
    history.pushState({ ppCatalogItem: true }, "", `#catalog?item=${item.id}`);
    setOpen(item);
  };
  const closeItem = () => {
    if ((history.state as { ppCatalogItem?: boolean } | null)?.ppCatalogItem) history.back();
    else {
      history.replaceState(null, "", "#catalog");
      setOpen(null);
    }
  };
  useEffect(() => {
    const onPop = () => {
      if (!new URLSearchParams(window.location.hash.split("?")[1] ?? "").get("item")) setOpen(null);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  // Opened from a Gear page's Edit in catalog link.
  useEffect(() => {
    const link = linkedItem();
    if (!link) return;
    getItem(link.kind, link.key).then(
      (item) => (item ? setOpen(item) : setNotice({ text: `No catalog item has the key ${link.key}.`, error: true })),
      (e: Error) => setNotice({ text: e.message, error: true }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Live counts for the sidebar, from the published catalog (within the chosen kind and brand). */
  const counts = useMemo(() => {
    const pedals = (manifest?.pedals ?? []).filter((c) => !brand || c.brand === brand);
    const boards = (manifest?.pedalboards ?? []).filter((c) => !brand || c.brand === brand);
    const byType = new Map<string, number>();
    let untyped = 0;
    for (const c of pedals) {
      const ts = itemTypes(c);
      if (!ts.length) untyped++;
      for (const t of ts) byType.set(t, (byType.get(t) ?? 0) + 1);
    }
    const scoped = kind === "pedal" ? manifest?.pedals ?? [] : kind === "pedalboard" ? manifest?.pedalboards ?? [] : [...(manifest?.pedals ?? []), ...(manifest?.pedalboards ?? [])];
    const byBrand = new Map<string, number>();
    for (const c of scoped) byBrand.set(c.brand, (byBrand.get(c.brand) ?? 0) + 1);
    return {
      pedals: pedals.length,
      boards: boards.length,
      untyped,
      types: PEDAL_TYPES.filter((t) => byType.has(t))
        .map((t) => [t, byType.get(t)!] as [string, number])
        .sort((a, b) => b[1] - a[1]),
      brands: [...byBrand].sort((a, b) => a[0].localeCompare(b[0])),
    };
  }, [manifest, kind, brand]);

  /** Saves one item's new types (first is the main one). */
  const saveTypes = async (item: Item, types: string[]): Promise<boolean> => {
    const next: Item = { ...item, type: types[0] ?? null, extra_types: types.slice(1) };
    setItems((list) => list?.map((x) => (x.id === item.id ? next : x)) ?? list);
    setSaving((s) => new Set(s).add(item.id));
    try {
      await saveDirect({ ...fieldsFrom(item), type: types[0], extraTypes: types.slice(1) }, { targetKey: item.key, note: "Type fix" });
      setFailed((f) => {
        const n = new Map(f);
        n.delete(item.id);
        return n;
      });
      setUnpublished((n) => n + 1);
      return true;
    } catch (e) {
      setItems((list) => list?.map((x) => (x.id === item.id ? item : x)) ?? list);
      setFailed((f) => new Map(f).set(item.id, (e as Error).message));
      return false;
    } finally {
      setSaving((s) => {
        const n = new Set(s);
        n.delete(item.id);
        return n;
      });
    }
  };

  const chosen = (items ?? []).filter((x) => selected.has(x.id));
  /** The row last ticked or unticked without Shift: where a Shift-click range starts. */
  const anchor = useRef<number | null>(null);
  /** Ticks or unticks a row; with Shift, every row from the last one clicked to this one, to match this one. */
  const toggle = (id: number, shift = false) => {
    const list = items ?? [];
    const to = list.findIndex((x) => x.id === id);
    const from = shift && anchor.current !== null ? list.findIndex((x) => x.id === anchor.current) : -1;
    setSelected((s) => {
      const n = new Set(s);
      const tick = !n.has(id);
      const ids = from >= 0 && to >= 0 ? list.slice(Math.min(from, to), Math.max(from, to) + 1).map((x) => x.id) : [id];
      for (const x of ids) {
        if (tick) n.add(x);
        else n.delete(x);
      }
      return n;
    });
    if (!shift || from < 0) anchor.current = id;
  };
  /** Runs a change over every ticked item, one at a time, then publishes once. */
  const bulk = async (label: string, fn: (item: Item) => Promise<boolean>) => {
    let ok = 0;
    for (const [i, item] of chosen.entries()) {
      setBulkBusy(`${label}: ${i + 1} of ${chosen.length}…`);
      if (await fn(item)) ok++;
    }
    setBulkBusy(null);
    const missed = chosen.length - ok;
    const n = await publisher.run();
    setNotice({ text: `${label}: ${ok} ${ok === 1 ? "item" : "items"} changed${missed ? `, ${missed} didn't save` : ""}. ${n.text}`, error: n.error || missed > 0 });
    if (!n.error) setUnpublished(0);
    setSelected(new Set());
  };
  const typesOf = (item: Item) => [...(item.type ? [item.type] : []), ...(item.extra_types ?? []).filter((t) => t !== item.type)];
  const setStatusOf = async (item: Item, s: Item["status"]) => {
    if (item.status === s) return true;
    try {
      await setStatus(item.kind, item.key, s);
      setItems((list) => list?.map((x) => (x.id === item.id ? { ...x, status: s } : x)) ?? list);
      return true;
    } catch (e) {
      setFailed((f) => new Map(f).set(item.id, (e as Error).message));
      return false;
    }
  };

  const publishNow = async () => {
    const n = await publisher.run();
    setNotice(n);
    if (!n.error) setUnpublished(0);
  };

  if (open)
    return (
      <EditItem
        key={open.id}
        item={open}
        manifest={manifest}
        userId={userId}
        onClose={closeItem}
        onSaved={(n, updated) => {
          setNotice(n);
          closeItem();
          if (updated) setItems((r) => r?.map((x) => (x.id === updated.id ? updated : x)) ?? r);
        }}
        publisher={publisher}
      />
    );

  const allTicked = !!items?.length && items.every((x) => selected.has(x.id));
  return (
    <div className="lg:grid lg:grid-cols-[240px_minmax(0,1fr)] lg:items-start lg:gap-8">
      <aside aria-label="Filters" className="mb-6 lg:sticky lg:top-28 lg:mb-0 lg:max-h-[calc(100dvh-8rem)] lg:overflow-y-auto lg:px-3 lg:-mx-3 lg:pb-4">
        <CatalogFilters
          kind={kind}
          type={type}
          brand={brand}
          status={status}
          counts={counts}
          onKind={(k) => {
            setKind(k);
            if (k === "pedalboard") setType(null);
          }}
          onType={(t) => {
            setType(t);
            if (t) setKind("pedal");
          }}
          onBrand={setBrand}
          onStatus={setStatusFilter}
        />
      </aside>

      <div className="grid min-w-0 content-start gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <input {...plainField} className={`${inputClass} max-w-sm`} placeholder="Search brand or name" value={text} onChange={(e) => setText(e.target.value)} />
          {unpublished > 0 && (
            <span className="ml-auto flex items-center gap-2 text-[13px] text-ink-muted">
              {unpublished} {unpublished === 1 ? "change" : "changes"} saved, not live yet
              <button type="button" className={secondaryButton} onClick={() => void publishNow()}>
                Publish
              </button>
            </span>
          )}
        </div>

        {/* Bulk actions, once something is ticked. */}
        {error && <p className="text-[13px] text-danger">{error}</p>}
        {items && items.length === 0 && <p className="text-[13px] text-ink-muted">Nothing matches.</p>}
        {!items && !error && <p className="text-[13px] text-ink-muted">Loading…</p>}

        <div className="rounded-panel border border-line">
          {/* The list's header row: Select all, and the bulk actions beside it once something is ticked, on the same
              fixed-height row, so the list never moves. (Narrow screens scroll the row sideways.) */}
          <div className="sticky top-[6.5rem] z-10 flex h-11 flex-nowrap items-center gap-2.5 overflow-x-auto rounded-t-panel border-b border-line bg-card px-3">
            <label className="flex w-28 shrink-0 items-center gap-2 text-[13px] font-semibold tabular-nums">
              <input
                type="checkbox"
                checked={allTicked}
                ref={(el) => {
                  if (el) el.indeterminate = selected.size > 0 && !allTicked;
                }}
                onChange={() => setSelected(allTicked ? new Set() : new Set(items?.map((x) => x.id)))}
                className="size-4 accent-[var(--color-brand)]"
                aria-label="Select all shown"
              />
              {selected.size ? `${selected.size} selected` : "Select all"}
            </label>
            {(selected.size > 0 || bulkBusy) && (
              <BulkActions
                busy={bulkBusy}
                disabled={!!bulkBusy}
                pedals={chosen.filter((x) => x.kind === "pedal").length}
                onAddType={(t) => void bulk(`Added ${t}`, (x) => (x.kind !== "pedal" || typesOf(x).includes(t) ? Promise.resolve(true) : saveTypes(x, [...typesOf(x), t])))}
                onRemoveType={(t) => void bulk(`Removed ${t}`, (x) => (!typesOf(x).includes(t) ? Promise.resolve(true) : saveTypes(x, typesOf(x).filter((y) => y !== t))))}
                onMainType={(t) => void bulk(`Made ${t} the main type`, (x) => (x.kind !== "pedal" ? Promise.resolve(true) : saveTypes(x, [t, ...typesOf(x).filter((y) => y !== t)])))}
                onArchive={() => {
                  if (window.confirm(`Archive ${selected.size} ${selected.size === 1 ? "item" : "items"}? They leave search, but saved boards still show them.`))
                    void bulk("Archived", (x) => setStatusOf(x, "retired"));
                }}
                onRestore={() => void bulk("Restored", (x) => setStatusOf(x, "live"))}
                onClear={() => setSelected(new Set())}
              />
            )}
          </div>
          <ul className="grid divide-y divide-line">
          {items?.map((item) => {
            const problem = failed.get(item.id);
            const on = selected.has(item.id);
            return (
              <li
                key={item.id}
                // A click on the row's blank space ticks it (anything you can click or type in keeps its own job).
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest("button, a, input, select, textarea, [data-row-control]")) return;
                  toggle(item.id, e.shiftKey);
                }}
                // Shift-clicking a range shouldn't also select the text in between.
                onMouseDown={(e) => {
                  if (e.shiftKey && !(e.target as HTMLElement).closest("input, select, textarea, [data-row-control]")) e.preventDefault();
                }}
                className={`grid items-center gap-2 px-3 py-2.5 md:grid-cols-[minmax(0,18rem)_minmax(0,1fr)_auto] md:gap-4 ${on ? "bg-soft/60" : ""}`}
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <input
                    type="checkbox"
                    checked={on}
                    // onClick, not onChange, to see Shift.
                    onChange={() => undefined}
                    onClick={(e) => toggle(item.id, e.shiftKey)}
                    aria-label={`Select ${item.brand} ${item.name}`}
                    className="size-4 shrink-0 accent-[var(--color-brand)]"
                  />
                  <button type="button" onClick={() => openItem(item)} className="group flex min-w-0 items-center gap-2.5 text-left">
                    <span className="grid size-10 shrink-0 place-items-center">
                      {item.thumb_path ? (
                        <img src={publicUrl(item.thumb_path)} alt="" className="max-h-10 max-w-10 object-contain" loading="lazy" />
                      ) : (
                        <span className="size-8 rounded-inner bg-soft" />
                      )}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-semibold group-hover:underline">{item.name}</span>
                      <span className="block truncate text-xs text-ink-muted">
                        <Meta
                          parts={[
                            item.brand,
                            item.kind === "pedalboard" && "Pedalboard",
                            `${+Number(item.width_in).toFixed(2)} × ${+Number(item.height_in).toFixed(2)} in`,
                            item.status === "retired" && "Archived",
                            item.needs_render && item.source_path && "Building",
                          ]}
                        />
                      </span>
                    </span>
                  </button>
                </div>
                <div className="min-w-0" data-row-control={item.kind === "pedal" ? "" : undefined}>
                  {item.kind === "pedal" ? (
                    <TypeCombo compact value={typesOf(item)} disabled={saving.has(item.id)} label={`Types for ${item.brand} ${item.name}`} onChange={(t) => void saveTypes(item, t)} />
                  ) : (
                    <p className="pt-1.5 text-xs text-ink-muted">Pedalboards have no types.</p>
                  )}
                  {problem && <p className="mt-1 text-xs text-danger">Didn't save: {problem}</p>}
                </div>
                {/* Edit, Copy (a new item from this one, on the Add tab), and Archive or Restore. */}
                <div className="flex items-center gap-1.5">
                  <button type="button" aria-label={`Edit ${item.brand} ${item.name}`} onClick={() => openItem(item)} className={rowLabeled}>
                    <Pencil size={14} strokeWidth={2} />
                    Edit
                  </button>
                  <a href={`#add?from=${encodeURIComponent(item.key)}`} aria-label={`Copy ${item.brand} ${item.name} as a new item`} {...tip("A new item from this one")} className={rowLabeled}>
                    <Copy size={14} strokeWidth={2} />
                    Copy
                  </a>
                  {item.status === "live" ? (
                    <button
                      type="button"
                      aria-label={`Archive ${item.brand} ${item.name}`}
                      {...tip("Archive")}
                      disabled={saving.has(item.id)}
                      onClick={() => {
                        if (!window.confirm(`Archive ${item.brand} ${item.name}? It leaves search, but saved boards still show it.`)) return;
                        void setStatusOf(item, "retired").then((ok) => (ok ? publishNow() : undefined));
                      }}
                      className={`${rowAction} text-danger`}
                    >
                      <Archive size={15} strokeWidth={2} />
                    </button>
                  ) : (
                    <button
                      type="button"
                      aria-label={`Restore ${item.brand} ${item.name}`}
                      {...tip("Restore")}
                      onClick={() => void setStatusOf(item, "live").then((ok) => (ok ? publishNow() : undefined))}
                      className={`${rowAction} text-icon hover:text-ink`}
                    >
                      <ArchiveRestore size={15} strokeWidth={2} />
                    </button>
                  )}
                </div>
              </li>
            );
          })}
          </ul>
        </div>
        {more && (
          <button type="button" className={`${secondaryButton} justify-self-center`} onClick={() => void load(Math.ceil((items?.length ?? 0) / PAGE))}>
            Show more
          </button>
        )}
      </div>
    </div>
  );
}

/** A row's actions: Edit and Copy with labels, Archive (or Restore) as an icon. */
const rowLabeled =
  "press flex h-7 items-center gap-1.5 whitespace-nowrap rounded-control bg-surface-hover px-2.5 text-xs font-medium text-ink outline-none transition-colors hover:bg-soft-hover focus-visible:ring-2 focus-visible:ring-brand";
const rowAction =
  "grid size-8 place-items-center rounded-control outline-none transition-colors hover:bg-soft focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50";

/** The header row's small controls: a step down from the page's buttons (28px tall, 12px text). */
// Its own classes rather than secondaryButton plus overrides: utilities like h-7 and h-9 would clash.
const barButton =
  "press h-7 shrink-0 whitespace-nowrap rounded-control bg-surface-hover px-2.5 text-xs font-medium text-ink outline-none hover:bg-soft-hover focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50";

/** The bulk actions for ticked items: types (pedals only), archive and restore. */
function BulkActions({
  busy,
  disabled,
  pedals,
  onAddType,
  onRemoveType,
  onMainType,
  onArchive,
  onRestore,
  onClear,
}: {
  busy: string | null;
  disabled: boolean;
  pedals: number;
  onAddType: (t: string) => void;
  onRemoveType: (t: string) => void;
  onMainType: (t: string) => void;
  onArchive: () => void;
  onRestore: () => void;
  onClear: () => void;
}) {
  const typeMenu = (label: string, run: (t: string) => void) => (
    <select
      aria-label={label}
      value=""
      onChange={(e) => e.target.value && run(e.target.value)}
      className={`${barButton} cursor-pointer`}
      disabled={disabled || !pedals}
    >
      <option value="">{label}…</option>
      {PEDAL_TYPES.map((t) => (
        <option key={t}>{t}</option>
      ))}
    </select>
  );
  return (
    <>
      {typeMenu("Add type", onAddType)}
      {typeMenu("Make main type", onMainType)}
      {typeMenu("Remove type", onRemoveType)}
      <button type="button" className={`${barButton} text-danger`} disabled={disabled} onClick={onArchive}>
        Archive
      </button>
      <button type="button" className={barButton} disabled={disabled} onClick={onRestore}>
        Restore
      </button>
      {/* Progress while a bulk change runs, else Clear selection. */}
      <span className="ml-auto shrink-0 whitespace-nowrap text-xs" role="status">
        {busy ? (
          <span className="text-ink-muted">{busy}</span>
        ) : (
          <button type="button" className="font-semibold text-brand hover:underline" onClick={onClear}>
            Clear selection
          </button>
        )}
      </span>
    </>
  );
}

/** The sidebar: kind, type, status and brand, laid out like the Gear page's filters. */
function CatalogFilters({
  kind,
  type,
  brand,
  status,
  counts,
  onKind,
  onType,
  onBrand,
  onStatus,
}: {
  kind: KindFilter;
  type: string | null;
  brand: string | null;
  status: CatalogFilter["status"];
  counts: { pedals: number; boards: number; untyped: number; types: [string, number][]; brands: [string, number][] };
  onKind: (k: KindFilter) => void;
  onType: (t: string | null) => void;
  onBrand: (b: string | null) => void;
  onStatus: (s: CatalogFilter["status"]) => void;
}) {
  const [moreTypes, setMoreTypes] = useState(false);
  const [moreBrands, setMoreBrands] = useState(false);
  const [find, setFind] = useState("");
  const [finding, setFinding] = useState(false);
  const n = (v: number) => <span className="shrink-0 text-xs tabular-nums text-ink-muted">{v.toLocaleString("en-US")}</span>;
  const typeRows: [string, string, number][] = [["none", "No type", counts.untyped], ...counts.types.map(([t, c]) => [t, t, c] as [string, string, number])];
  const shownTypes = moreTypes ? typeRows : typeRows.filter(([t], i) => i < TYPES_COLLAPSED || t === type);
  const shownBrands = useMemo(() => {
    const q = find.trim().toLowerCase();
    if (q) return counts.brands.filter(([b]) => b.toLowerCase().includes(q));
    if (moreBrands) return counts.brands;
    const top = new Set([...counts.brands].sort((a, b) => b[1] - a[1]).slice(0, BRANDS_COLLAPSED).map(([b]) => b));
    if (brand) top.add(brand);
    return counts.brands.filter(([b]) => top.has(b)).sort((a, b) => b[1] - a[1]);
  }, [counts.brands, find, moreBrands, brand]);

  return (
    <div className="-mx-2 flex flex-col gap-5">
      <div role="radiogroup" aria-label="Kind and type" className="grid grid-cols-[minmax(0,1fr)] gap-0.5">
        {(
          [
            [null, "All Items", counts.pedals + counts.boards],
            ["pedal", "Pedals", counts.pedals],
            ["pedalboard", "Pedalboards", counts.boards],
          ] as const
        ).map(([k, label, c]) => {
          const on = kind === k && !type;
          return (
            <button key={label} type="button" role="radio" aria-checked={on} onClick={() => (onType(null), onKind(k))} className={filterRow(on)}>
              <span className="truncate">{label}</span>
              {n(c)}
            </button>
          );
        })}
        {shownTypes.map(([t, label, c]) => {
          const on = type === t;
          return (
            <button key={t} type="button" role="radio" aria-checked={on} onClick={() => onType(on ? null : t)} className={filterRow(on)}>
              <span className="truncate">{label}</span>
              {n(c)}
            </button>
          );
        })}
        {typeRows.length > TYPES_COLLAPSED && (
          <button type="button" aria-expanded={moreTypes} className={filterMore} onClick={() => setMoreTypes(!moreTypes)}>
            {moreTypes ? "Show less" : `Show ${typeRows.length - shownTypes.length} more`}
          </button>
        )}
      </div>

      <div role="radiogroup" aria-label="Status" className="grid grid-cols-[minmax(0,1fr)] gap-0.5">
        {(
          [
            ["live", "Live"],
            ["retired", "Archived"],
            ["all", "Live and Archived"],
          ] as const
        ).map(([s, label]) => (
          <button key={s} type="button" role="radio" aria-checked={status === s} onClick={() => onStatus(s)} className={filterRow(status === s)}>
            <span className="truncate">{label}</span>
          </button>
        ))}
      </div>

      <div role="radiogroup" aria-label="Brand" className="grid grid-cols-[minmax(0,1fr)] gap-0.5">
        <div className="relative">
          <button type="button" role="radio" aria-checked={brand === null} onClick={() => onBrand(null)} className={`${filterRow(brand === null)} pr-9`}>
            <span className="truncate">All Brands</span>
          </button>
          <button
            type="button"
            aria-label={finding ? "Close brand search" : "Find a brand"}
            aria-expanded={finding}
            onClick={() => {
              if (finding) setFind("");
              setFinding(!finding);
            }}
            className="absolute right-0.5 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-inner text-icon outline-none hover:bg-soft-hover hover:text-ink focus-visible:ring-2 focus-visible:ring-brand"
          >
            {finding ? <X size={14} strokeWidth={2} /> : <Search size={14} strokeWidth={2} />}
          </button>
        </div>
        {finding && (
          <input
            type="search"
            autoFocus
            value={find}
            onChange={(e) => setFind(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") (setFind(""), setFinding(false));
            }}
            placeholder={`Find a brand (${counts.brands.length.toLocaleString("en-US")})`}
            aria-label="Find a brand"
            className="mx-2 my-1 h-8 rounded-control border border-chrome-line bg-surface px-2.5 text-[13px] outline-none focus:ring-2 focus:ring-brand"
          />
        )}
        {shownBrands.map(([b, c]) => (
          <button key={b} type="button" role="radio" aria-checked={brand === b} onClick={() => onBrand(brand === b ? null : b)} className={filterRow(brand === b)}>
            <span className="truncate">{b}</span>
            {n(c)}
          </button>
        ))}
        {!find.trim() && counts.brands.length > BRANDS_COLLAPSED && (
          <button type="button" aria-expanded={moreBrands} className={filterMore} onClick={() => setMoreBrands(!moreBrands)}>
            {moreBrands ? "Show less" : `Show ${(counts.brands.length - shownBrands.length).toLocaleString("en-US")} more`}
          </button>
        )}
      </div>
    </div>
  );
}

function EditItem({
  item,
  manifest,
  userId,
  onClose,
  onSaved,
  publisher,
}: {
  item: Item;
  manifest: Manifest | null;
  userId: string;
  onClose: () => void;
  onSaved: (n: { text: string; error?: boolean }, updated?: Item) => void;
  publisher: PublishState;
}) {
  const [fields, setFields] = useState<Fields>(() => fieldsFrom(item));
  const [image, setImage] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (item.source_path) sourceUrl(item.source_path).then(setImage, () => setImage(item.img_path ? publicUrl(item.img_path) : null));
    else if (item.img_path) setImage(publicUrl(item.img_path));
  }, [item]);

  const problems = fieldProblems(fields);
  const name = `${item.brand} ${item.name}`;
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className={`${secondaryButton} flex items-center gap-1`} onClick={onClose}>
          <ArrowLeft size={14} strokeWidth={2.5} />
          Back
        </button>
        <h2 className="text-lg font-bold tracking-[-0.01em]">{name}</h2>
        <span className="text-xs text-ink-muted">
          <Meta parts={[`Key ${item.key}`, `Added ${item.added_on}`, item.status === "retired" && "Archived"]} />
        </span>
      </div>
      <ItemEditor
        fields={fields}
        onChange={setFields}
        image={image}
        onPickFile={(f) => {
          setFile(f);
          setImage(URL.createObjectURL(f));
        }}
        manifest={manifest}
        skipImage={item.key}
        lockKind
      />
      <p className="text-xs text-ink-muted">
        Saved boards keep using this item's key, so fixing its size or photo updates them too.
      </p>
      {problems.length > 0 && <p className="text-[13px] text-danger">{problems.join(" ")}</p>}
      {error && <p className="text-[13px] text-danger">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={primaryButton}
          disabled={busy || problems.length > 0}
          onClick={() =>
            run(async () => {
              const path = file ? await uploadSource(file, userId) : undefined;
              await saveDirect(fields, { targetKey: item.key, sourcePath: path });
              onSaved(withPublish(`Saved ${fields.brand} ${fields.name}.`, await publisher.run()));
            })
          }
        >
          {busy ? "Saving…" : "Save and publish"}
        </button>
        {/* A new item starting from this one's kind, brand and size (on the Add tab). */}
        <a href={`#add?from=${encodeURIComponent(item.key)}`} className={`${secondaryButton} inline-flex items-center`}>
          Duplicate
        </a>
        {item.status === "live" ? (
          <button
            type="button"
            className={`${secondaryButton} text-danger`}
            disabled={busy}
            onClick={() => {
              if (!window.confirm(`Archive ${name}? It leaves search, but saved boards still show it.`)) return;
              void run(async () => {
                await setStatus(item.kind, item.key, "retired");
                onSaved(withPublish(`Archived ${name}.`, await publisher.run()), { ...item, status: "retired" });
              });
            }}
          >
            Archive
          </button>
        ) : (
          <button
            type="button"
            className={secondaryButton}
            disabled={busy}
            onClick={() =>
              run(async () => {
                await setStatus(item.kind, item.key, "live");
                onSaved(withPublish(`Restored ${name}.`, await publisher.run()), { ...item, status: "live" });
              })
            }
          >
            Restore
          </button>
        )}
      </div>
    </div>
  );
}
