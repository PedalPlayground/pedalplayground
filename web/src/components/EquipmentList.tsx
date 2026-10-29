import { Check, ChevronDown, ExternalLink, List, LocateFixed, ShoppingBag, ShoppingCart, Zap } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { affiliateProps, BUY_LINKS, buyLinks, DISCLOSURE, type BuyLink } from "../lib/affiliate";
import { imageKey, thumbUrl, type Manifest } from "../lib/catalog";
import type { Item } from "../lib/types";
import { formatMa, parseMa, PEDAL_TYPES, VOLTAGES } from "../lib/specs";
import { formatSize } from "../lib/units";
import { useCatalog } from "../store/catalog";
import { usePlayground } from "../store/playground";
import { useUi } from "../store/ui";
import { tip } from "./Tooltip";
import { plainField } from "../lib/inputProps";

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
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Stat label="Inventory Value" rows={owned} count={plural(owned.length, "Item")} />
              <Stat label="Left to Buy" rows={wanted} count={plural(wanted.length, "Item")} accent />
              <PowerStat items={items} />
            </div>
            <Section title="Need to Buy" rows={wanted} catalog={catalog} onShow={show} empty="Mark gear you still need to buy and it'll show up here with a running total." />
            <Section title="Owned" rows={owned} catalog={catalog} onShow={show} empty="Everything here is on your shopping list." />
            {BUY_LINKS && <p className="px-1 text-xs text-ink-muted">{DISCLOSURE}</p>}
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
            <GearRow key={r.item.id} row={r} catalog={catalog} onShow={onShow} />
          ))}
        </ul>
      )}
    </section>
  );
}

/** Total current draw of every pedal on the board, owned or not, so it can be sized for a power supply. */
function PowerStat({ items }: { items: Item[] }) {
  const pedals = items.filter((i) => i.kind === "pedal");
  const sum = pedals.reduce((t, i) => t + (i.ma ?? 0), 0);
  const missing = pedals.filter((i) => i.ma === undefined).length;
  // Per-voltage totals, biggest first: "9V DC 450 mA · 12V DC 300 mA".
  const byVoltage = new Map<string, number>();
  for (const i of pedals) if (i.ma !== undefined && i.voltage) byVoltage.set(i.voltage, (byVoltage.get(i.voltage) ?? 0) + i.ma);
  const split = [...byVoltage].sort((a, b) => b[1] - a[1]).map(([v, ma]) => `${v} ${formatMa(ma)}`);
  return (
    <div className="rounded-panel bg-surface px-4 py-3 shadow-panel max-sm:col-span-2">
      <p className="flex items-center gap-1 text-[13px] font-semibold tracking-[-0.01em] text-ink-muted">
        <Zap size={13} strokeWidth={2.25} />
        Power Draw
      </p>
      <p className="text-2xl font-semibold tabular-nums tracking-[-0.02em] max-sm:text-xl">{formatMa(sum)}</p>
      <p className="truncate text-xs text-ink-muted" {...(split.length > 1 ? tip(split.join(" · ")) : {})}>
        {pedals.length === 0
          ? "No Pedals Yet"
          : missing > 0
            ? `${plural(missing, "Pedal")} Without a Draw`
            : split.join(" · ") || plural(pedals.length, "Pedal")}
      </p>
    </div>
  );
}

/** One item: thumbnail, name, price and status. Clicking it opens its details (specs, size, Show on Playground). */
function GearRow({ row: r, catalog, onShow }: { row: Row; catalog: Manifest | null; onShow: (id: string) => void }) {
  const units = useUi((u) => u.units);
  const [open, setOpen] = useState(false);
  const { item } = r;
  const specs = [item.pedalType, item.voltage, item.ma !== undefined ? formatMa(item.ma) : undefined].filter(Boolean);
  const links = buyLinks(r.brand, r.name);
  const detail = [r.brand, ...(specs.length ? specs : [formatSize(item.width, item.height, units)])].filter(Boolean).join(" · ");
  return (
    <li className={`animate-enter rounded-control transition-colors [--enter-y:4px] ${open ? "bg-surface-hover" : ""}`}>
      <div className="group flex items-center gap-2 rounded-control p-1 pr-2 transition-colors hover:bg-surface-hover sm:gap-3">
        <button
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          {...tip(open ? "Hide Details" : "Show Details")}
          className="press flex min-w-0 flex-1 items-center gap-3 rounded-control p-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <Thumb item={item} catalog={catalog} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{r.name}</span>
            <span className="block truncate text-xs text-ink-muted">{detail}</span>
          </span>
          <ChevronDown
            size={16}
            className={`shrink-0 text-ink-muted transition-[transform,opacity] duration-150 max-sm:hidden ${open ? "rotate-180 opacity-100" : "opacity-0 group-hover:opacity-100"}`}
          />
        </button>
        {isWanted(item) && links[0] && <BuyButton link={links[0]} name={r.name} />}
        <PriceField key={item.price ?? "none"} item={item} name={r.name} />
        <StatusToggle item={item} />
      </div>
      {open && <Details item={item} name={r.name} links={links} onShow={() => onShow(item.id)} />}
    </li>
  );
}

const fieldLabel = "flex min-w-0 flex-col gap-1 text-xs font-medium text-ink-muted";
const fieldBox =
  "h-8 w-full rounded-control border border-line bg-surface px-2 text-sm text-ink outline-none transition-shadow focus:border-brand focus:ring-2 focus:ring-brand/30 pointer-coarse:h-10 max-sm:text-base";

/** Specs for a pedal (type, voltage, current draw), its size, and a way back to it on the Playground. */
function Details({ item, name, links, onShow }: { item: Item; name: string; links: BuyLink[]; onShow: () => void }) {
  const updateGear = usePlayground((p) => p.updateGear);
  const units = useUi((u) => u.units);
  const pedal = item.kind === "pedal";
  return (
    <div className="animate-enter flex flex-wrap items-end gap-3 px-3 pb-3 pt-1 [--enter-y:-4px] sm:pl-[68px]">
      {pedal && (
        <>
          <label className={`${fieldLabel} w-[150px] max-sm:flex-1`}>
            Type
            <select
              value={item.pedalType ?? ""}
              onChange={(e) => updateGear(item.id, { pedalType: e.target.value || undefined })}
              aria-label={`Type of ${name}`}
              className={fieldBox}
            >
              <option value="">Not Set</option>
              {PEDAL_TYPES.map((t) => (
                <option key={t}>{t}</option>
              ))}
              {item.pedalType && !(PEDAL_TYPES as readonly string[]).includes(item.pedalType) && <option>{item.pedalType}</option>}
            </select>
          </label>
          <label className={`${fieldLabel} w-[110px] max-sm:flex-1`}>
            Voltage
            <select
              value={item.voltage ?? ""}
              onChange={(e) => updateGear(item.id, { voltage: e.target.value || undefined })}
              aria-label={`Voltage of ${name}`}
              className={fieldBox}
            >
              <option value="">Not Set</option>
              {VOLTAGES.map((v) => (
                <option key={v}>{v}</option>
              ))}
              {item.voltage && !(VOLTAGES as readonly string[]).includes(item.voltage) && <option>{item.voltage}</option>}
            </select>
          </label>
          <MaField key={item.ma ?? "none"} item={item} name={name} />
        </>
      )}
      <p className="flex h-8 items-center text-xs text-ink-muted pointer-coarse:h-10 max-sm:basis-full max-sm:h-auto">
        Size {formatSize(item.width, item.height, units)}
      </p>
      {links.map((l, i) => (
        <a
          key={l.store}
          href={l.href}
          {...affiliateProps}
          {...tip(`Search ${l.store} for ${name}`)}
          className={`press flex h-8 shrink-0 items-center gap-1.5 rounded-[5px] px-3 text-[13px] font-semibold tracking-[-0.01em] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand pointer-coarse:h-10 max-sm:w-full max-sm:justify-center ${
            i === 0 ? "ml-auto max-sm:ml-0" : ""
          } ${isWanted(item) ? "bg-brand/10 text-brand hover:bg-brand/15 active:bg-brand/25" : "bg-chrome text-ink-muted hover:bg-chrome-line hover:text-ink active:bg-line"}`}
        >
          <ExternalLink size={14} strokeWidth={2.25} />
          {isWanted(item) ? `Buy on ${l.store}` : `Find on ${l.store}`}
        </a>
      ))}
      <button
        onClick={onShow}
        className={`press ${links.length ? "" : "ml-auto"} flex h-8 shrink-0 items-center gap-1.5 rounded-[5px] bg-[rgb(202_203_226/0.39)] px-3 text-[13px] font-semibold tracking-[-0.01em] text-ink outline-none hover:bg-[rgb(202_203_226/0.6)] active:bg-[rgb(202_203_226/0.8)] focus-visible:ring-2 focus-visible:ring-brand pointer-coarse:h-10 max-sm:ml-0 max-sm:w-full max-sm:justify-center`}
      >
        <LocateFixed size={14} strokeWidth={2.25} />
        Show on Playground
      </button>
    </div>
  );
}

/** Current draw in mA. Saves on blur or Enter. */
function MaField({ item, name }: { item: Item; name: string }) {
  const updateGear = usePlayground((p) => p.updateGear);
  const [draft, setDraft] = useState(() => (item.ma === undefined ? "" : String(item.ma)));
  const commit = () => {
    const ma = parseMa(draft);
    setDraft(ma === undefined ? "" : String(ma));
    updateGear(item.id, { ma });
  };
  return (
    <label className={`${fieldLabel} w-[110px] max-sm:flex-1`}>
      Current Draw
      <span className={`${fieldBox} flex items-center gap-1 focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/30`}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          {...plainField}
          inputMode="numeric"
          enterKeyHint="done"
          placeholder="0"
          aria-label={`Current draw of ${name} in milliamps`}
          className="w-full min-w-0 bg-transparent text-right tabular-nums outline-none placeholder:text-ink-muted/60"
        />
        <span className="text-xs text-ink-muted">mA</span>
      </span>
    </label>
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
        {...plainField}
        inputMode="decimal"
        enterKeyHint="done"
        placeholder="0"
        aria-label={`Price of ${name}`}
        className="w-full min-w-0 bg-transparent text-right tabular-nums outline-none placeholder:text-ink-muted/60 max-sm:text-base"
      />
    </label>
  );
}

/** Opens a store search for an item still to buy. Icon only, so the row keeps its width. */
function BuyButton({ link, name }: { link: BuyLink; name: string }) {
  return (
    <a
      href={link.href}
      {...affiliateProps}
      {...tip(`Buy on ${link.store}`)}
      aria-label={`Buy ${name} on ${link.store}`}
      className="press grid size-8 shrink-0 place-items-center rounded-full text-brand outline-none transition-colors hover:bg-brand/10 active:bg-brand/20 focus-visible:ring-2 focus-visible:ring-brand pointer-coarse:size-10"
    >
      <ShoppingBag size={15} strokeWidth={2.25} />
    </a>
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
