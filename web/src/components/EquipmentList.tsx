import { Check, ChevronRight, List, ShoppingCart } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { imageKey, thumbUrl, type Manifest } from "../lib/catalog";
import type { Item } from "../lib/types";
import { formatSize } from "../lib/units";
import { useCatalog } from "../store/catalog";
import { usePlayground } from "../store/playground";
import { useUi } from "../store/ui";
import { tip } from "./Tooltip";

interface Row {
  item: Item;
  name: string;
  brand: string;
}

/** Splits a placed item into brand and name using the catalog; custom items keep their own label. */
function describe(item: Item, catalog: Manifest | null): Row {
  if (item.custom || !item.image) return { item, name: item.label || "Untitled", brand: "Custom" };
  const list = item.kind === "pedal" ? catalog?.pedals : catalog?.pedalboards;
  const key = imageKey(item.image);
  const hit = list?.find((c) => imageKey(c.image) === key);
  return hit ? { item, name: hit.name, brand: hit.brand } : { item, name: item.label, brand: "" };
}

/** Boards first, then by brand and name. */
const order = (a: Row, b: Row) =>
  (a.item.kind === b.item.kind ? 0 : a.item.kind === "pedalboard" ? -1 : 1) || a.brand.localeCompare(b.brand) || a.name.localeCompare(b.name);

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

const isWanted = (i: Item) => i.status === "wanted";

/** "$1,250" for whole amounts, "$1,249.99" otherwise. */
function money(n: number) {
  const whole = Number.isInteger(n);
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 });
}

/** What the user typed, as dollars: "$1,200.5" → 1200.5. Blank or nonsense clears the price. */
function parsePrice(text: string): number | undefined {
  const n = parseFloat(text.replace(/[$,\s]/g, ""));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : undefined;
}

const priceText = (n: number | undefined) => (n === undefined ? "" : Number.isInteger(n) ? String(n) : n.toFixed(2));

function total(rows: Row[]) {
  return {
    sum: rows.reduce((t, r) => t + (r.item.price ?? 0), 0),
    unpriced: rows.filter((r) => r.item.price === undefined).length,
  };
}

/** The gear on the open playground as a list. Covers the canvas while the Equipment List mode is on. */
export function EquipmentList() {
  const items = usePlayground((p) => p.items);
  const reveal = usePlayground((p) => p.reveal);
  const { manifest: catalog, load } = useCatalog();
  const setMode = useUi((u) => u.setMode);
  const setSearchOpen = useUi((u) => u.setSearchOpen);

  useEffect(() => {
    void load();
  }, [load]);

  const { owned, wanted, pedalCount, boardCount } = useMemo(() => {
    const rows = items.map((i) => describe(i, catalog)).sort(order);
    return {
      owned: rows.filter((r) => !isWanted(r.item)),
      wanted: rows.filter((r) => isWanted(r.item)),
      pedalCount: items.filter((i) => i.kind === "pedal").length,
      boardCount: items.filter((i) => i.kind === "pedalboard").length,
    };
  }, [items, catalog]);

  const show = (id: string) => {
    setMode("playground");
    reveal(id);
  };

  const addGear = () => {
    setMode("playground");
    setSearchOpen(true);
  };

  return (
    <div className="animate-fade absolute inset-0 z-10 overflow-y-auto overscroll-contain bg-canvas">
      {/* Clears the floating mode rail: beside it on larger screens, below it on phones. */}
      <div className="mx-auto flex w-full max-w-[720px] flex-col gap-3 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] pt-[76px] sm:pl-[calc(max(1rem,env(safe-area-inset-left))+64px)] sm:pr-[max(1.5rem,env(safe-area-inset-right))] sm:pt-3">
        <header className="animate-enter px-1 py-1 [--enter-y:4px]">
          <h2 className="text-lg font-semibold tracking-[-0.02em]">Equipment List</h2>
          <p className="text-[13px] text-ink-muted">
            {items.length === 0 ? "Nothing on this playground yet" : `${plural(pedalCount, "Pedal")} · ${plural(boardCount, "Pedalboard")}`}
          </p>
        </header>

        {items.length === 0 ? (
          <div className="animate-enter flex flex-col items-center gap-3 rounded-panel bg-surface px-6 py-10 text-center shadow-panel">
            <span className="grid size-10 place-items-center rounded-full bg-brand/10 text-brand">
              <List size={18} />
            </span>
            <p className="max-w-xs text-sm text-ink-muted">Add pedals and a pedalboard to your playground and they'll show up here.</p>
            <button
              onClick={addGear}
              className="btn-primary h-[30px] rounded-[5px] px-4 text-[13px] tracking-[-0.01em] outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1 pointer-coarse:h-10"
            >
              Add Gear
            </button>
          </div>
        ) : (
          <div className="animate-enter flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Inventory Value" rows={owned} count={plural(owned.length, "Item")} />
              <Stat label="Left to Buy" rows={wanted} count={plural(wanted.length, "Item")} accent />
            </div>
            <Section title="Need to Buy" rows={wanted} catalog={catalog} onShow={show} empty="Mark gear you still need to buy and it'll show up here with a running total." />
            <Section title="Owned" rows={owned} catalog={catalog} onShow={show} empty="Everything here is on your shopping list." />
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, rows, count, accent }: { label: string; rows: Row[]; count: string; accent?: boolean }) {
  const { sum, unpriced } = total(rows);
  return (
    <div className="rounded-panel bg-surface px-4 py-3 shadow-panel">
      <p className="text-[13px] font-semibold tracking-[-0.01em] text-ink-muted">{label}</p>
      <p className={`text-2xl font-semibold tabular-nums tracking-[-0.02em] max-sm:text-xl ${accent && sum > 0 ? "text-brand" : ""}`}>{money(sum)}</p>
      <p className="truncate text-xs text-ink-muted">
        {count}
        {unpriced > 0 && rows.length > 0 && ` · ${unpriced} Without a Price`}
      </p>
    </div>
  );
}

function Section({ title, rows, catalog, onShow, empty }: { title: string; rows: Row[]; catalog: Manifest | null; onShow: (id: string) => void; empty: string }) {
  const units = useUi((u) => u.units);
  const { sum } = total(rows);
  return (
    <section className="rounded-panel bg-surface shadow-panel">
      <h3 className="flex items-baseline justify-between px-4 pb-1 pt-3 text-[13px] font-semibold tracking-[-0.01em] text-ink-muted">
        <span>
          {title} <span className="font-medium tabular-nums">· {rows.length}</span>
        </span>
        {rows.length > 0 && <span className="font-medium tabular-nums">{money(sum)}</span>}
      </h3>
      {rows.length === 0 ? (
        <p className="px-4 pb-4 pt-1 text-sm text-ink-muted">{empty}</p>
      ) : (
        <ul className="p-1.5 pt-0">
          {rows.map((r) => (
            <li key={r.item.id} className="animate-enter group flex items-center gap-2 rounded-control p-1 pr-2 transition-colors hover:bg-surface-hover [--enter-y:4px] sm:gap-3">
              <button
                onClick={() => onShow(r.item.id)}
                {...tip("Show on Playground")}
                className="press flex min-w-0 flex-1 items-center gap-3 rounded-control p-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                <Thumb item={r.item} catalog={catalog} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{r.name}</span>
                  <span className="block truncate text-xs text-ink-muted">
                    {r.brand && `${r.brand} · `}
                    {formatSize(r.item.width, r.item.height, units)}
                  </span>
                </span>
                <ChevronRight size={16} className="shrink-0 text-ink-muted opacity-0 transition-opacity group-hover:opacity-100 max-sm:hidden" />
              </button>
              <PriceField key={r.item.price ?? "none"} item={r.item} name={r.name} />
              <StatusToggle item={r.item} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Dollar amount for one item. Saves on blur or Enter; Escape puts the old value back. */
function PriceField({ item, name }: { item: Item; name: string }) {
  const updateGear = usePlayground((p) => p.updateGear);
  const [draft, setDraft] = useState(() => priceText(item.price));
  const commit = () => {
    const price = parsePrice(draft);
    setDraft(priceText(price));
    updateGear(item.id, { price });
  };
  return (
    <label className="flex h-8 w-[84px] shrink-0 items-center gap-0.5 rounded-control border border-line bg-surface px-2 text-sm transition-shadow focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/30 pointer-coarse:h-10 max-sm:w-[88px] max-sm:px-1.5">
      <span className="text-ink-muted">$</span>
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            setDraft(priceText(item.price));
            requestAnimationFrame(() => (e.target as HTMLInputElement).blur());
          }
        }}
        inputMode="decimal"
        placeholder="0"
        aria-label={`Price of ${name}`}
        className="w-full min-w-0 bg-transparent text-right tabular-nums outline-none placeholder:text-ink-muted/60 max-sm:text-base"
      />
    </label>
  );
}

/** Moves an item between Owned and Need to Buy. */
function StatusToggle({ item }: { item: Item }) {
  const updateGear = usePlayground((p) => p.updateGear);
  const wanted = isWanted(item);
  const label = wanted ? "Need to Buy" : "Owned";
  return (
    <button
      onClick={() => updateGear(item.id, { status: wanted ? "owned" : "wanted" })}
      {...tip(wanted ? "Mark as Owned" : "Mark as Need to Buy")}
      aria-label={`${label}. ${wanted ? "Mark as Owned" : "Mark as Need to Buy"}`}
      className={`press flex h-8 w-[132px] shrink-0 items-center whitespace-nowrap justify-center gap-1.5 rounded-full px-3 text-[13px] font-semibold tracking-[-0.01em] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand pointer-coarse:h-10 max-sm:w-10 max-sm:px-0 ${
        wanted ? "bg-brand/10 text-brand hover:bg-brand/15 active:bg-brand/25" : "bg-chrome text-ink-muted hover:bg-chrome-line hover:text-ink active:bg-line"
      }`}
    >
      {wanted ? <ShoppingCart size={14} strokeWidth={2.25} /> : <Check size={14} strokeWidth={2.5} />}
      <span className="max-sm:hidden">{label}</span>
    </button>
  );
}

function Thumb({ item, catalog }: { item: Item; catalog: Manifest | null }) {
  const src = item.image && !item.custom ? thumbUrl(catalog, item.kind, item.image) : null;
  if (src) return <img src={src} alt="" loading="lazy" className="size-12 shrink-0 rounded-control bg-canvas object-contain" />;
  // Custom items: a swatch in the pedal's color, or the board deck color.
  return (
    <span className="grid size-12 shrink-0 place-items-center rounded-control bg-canvas">
      <span
        className={item.kind === "pedal" ? "h-8 w-6 rounded-[4px]" : "h-5 w-9 rounded-[3px] bg-board"}
        style={item.kind === "pedal" ? { background: item.color ?? "var(--color-board)" } : undefined}
      />
    </span>
  );
}
