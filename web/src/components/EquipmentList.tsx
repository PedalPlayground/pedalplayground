import { ChevronRight, List } from "lucide-react";
import { useEffect, useMemo } from "react";
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

const byBrandThenName = (a: Row, b: Row) => a.brand.localeCompare(b.brand) || a.name.localeCompare(b.name);

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

/** The gear on the open playground as a list. Covers the canvas while the Equipment List mode is on. */
export function EquipmentList() {
  const items = usePlayground((p) => p.items);
  const reveal = usePlayground((p) => p.reveal);
  const { manifest: catalog, load } = useCatalog();
  const units = useUi((u) => u.units);
  const setMode = useUi((u) => u.setMode);
  const setSearchOpen = useUi((u) => u.setSearchOpen);

  useEffect(() => {
    void load();
  }, [load]);

  const { boards, pedals } = useMemo(() => {
    const rows = items.map((i) => describe(i, catalog));
    return {
      boards: rows.filter((r) => r.item.kind === "pedalboard").sort(byBrandThenName),
      pedals: rows.filter((r) => r.item.kind === "pedal").sort(byBrandThenName),
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

  const section = (title: string, rows: Row[]) =>
    rows.length > 0 && (
      <section className="rounded-panel bg-surface shadow-panel">
        <h3 className="flex items-baseline justify-between px-4 pb-1 pt-3 text-[13px] font-semibold tracking-[-0.01em] text-ink-muted">
          {title}
          <span className="font-medium tabular-nums">{rows.length}</span>
        </h3>
        <ul className="p-1.5 pt-0">
          {rows.map((r) => (
            <li key={r.item.id}>
              <button
                onClick={() => show(r.item.id)}
                {...tip("Show on Playground")}
                className="group press flex w-full items-center gap-3 rounded-control p-2 text-left outline-none transition-colors hover:bg-surface-hover active:bg-chrome-line focus-visible:ring-2 focus-visible:ring-brand"
              >
                <Thumb row={r} catalog={catalog} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{r.name}</span>
                  <span className="block truncate text-xs text-ink-muted">
                    {r.brand && `${r.brand} · `}
                    {formatSize(r.item.width, r.item.height, units)}
                  </span>
                </span>
                <ChevronRight
                  size={16}
                  className="shrink-0 text-ink-muted opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 pointer-coarse:opacity-60"
                />
              </button>
            </li>
          ))}
        </ul>
      </section>
    );

  return (
    <div className="animate-fade absolute inset-0 z-10 overflow-y-auto overscroll-contain bg-canvas">
      {/* Clears the floating mode rail: beside it on larger screens, below it on phones. */}
      <div className="mx-auto flex w-full max-w-[720px] flex-col gap-3 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] pt-[76px] sm:pl-[calc(max(1rem,env(safe-area-inset-left))+64px)] sm:pr-[max(1.5rem,env(safe-area-inset-right))] sm:pt-3">
        <header className="animate-enter flex items-end justify-between gap-3 px-1 py-1 [--enter-y:4px]">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold tracking-[-0.02em]">Equipment List</h2>
            <p className="text-[13px] text-ink-muted">
              {items.length === 0 ? "Nothing on this playground yet" : `${plural(pedals.length, "Pedal")} · ${plural(boards.length, "Pedalboard")}`}
            </p>
          </div>
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
            {section("Pedalboards", boards)}
            {section("Pedals", pedals)}
          </div>
        )}
      </div>
    </div>
  );
}

function Thumb({ row, catalog }: { row: Row; catalog: Manifest | null }) {
  const { item } = row;
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
