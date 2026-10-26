import { Check, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { thumbUrl } from "../lib/catalog";
import { formatSize } from "../lib/units";
import type { CatalogItem } from "../lib/types";
import { useCatalog } from "../store/catalog";
import { CustomItemForm } from "./CustomItemForm";
import { usePlayground } from "../store/playground";
import { useUi } from "../store/ui";

type Category = "pedals" | "pedalboards" | "custom";

/** Adds products to the canvas; with `replace`, picks a replacement for the selected product instead. */
export function SearchPanel({ onClose, replace = false }: { onClose: () => void; replace?: boolean }) {
  const { manifest: catalog, error, load } = useCatalog();
  const [query, setQuery] = useState("");
  const units = useUi((u) => u.units);
  const addCatalogItem = usePlayground((p) => p.addCatalogItem);
  const replaceItem = usePlayground((p) => p.replaceItem);
  const target = usePlayground((p) => (replace && p.selected.length === 1 ? p.items.find((i) => i.id === p.selected[0]) : undefined));

  const [category, setCategory] = useState<Category>(target?.kind === "pedalboard" ? "pedalboards" : "pedals");

  // Replacing needs exactly one selected product; close if that stops being true.
  useEffect(() => {
    if (replace && !target) onClose();
  }, [replace, target, onClose]);

  useEffect(() => {
    void load();
  }, [load]);

  const results = useMemo(() => {
    if (!catalog) return [];
    const q = query.trim().toLowerCase();
    const list = catalog[category === "pedalboards" ? "pedalboards" : "pedals"];
    const hits = q ? list.filter((i) => `${i.brand} ${i.name}`.toLowerCase().includes(q)) : list;
    return hits.slice(0, 60);
  }, [catalog, category, query]);

  const kind = category === "pedalboards" ? "pedalboard" : "pedal";

  // Brief "Added" confirmation on the row just tapped. Phones then close the panel, which covers the middle of the
  // canvas where new items land.
  const [added, setAdded] = useState<string | null>(null);
  const addedTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(addedTimer.current), []);
  const add = (item: CatalogItem, key: string) => {
    addCatalogItem(kind, item);
    setAdded(key);
    clearTimeout(addedTimer.current);
    const phone = window.matchMedia("(max-width: 639.98px)").matches;
    addedTimer.current = setTimeout(() => (phone ? onClose() : setAdded(null)), phone ? 600 : 1200);
  };

  return (
    <div className="w-[min(420px,calc(100vw-5rem))] rounded-panel bg-surface shadow-panel max-sm:w-full">
      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        <Search size={16} className="text-ink-muted" />
        <input
          autoFocus={!window.matchMedia("(pointer: coarse)").matches}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={target ? `Replace ${target.label}` : "Search pedals and pedalboards"}
          className="h-9 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-muted"
        />
        <button aria-label="Close search" onClick={onClose} className="text-ink-muted hover:text-ink">
          <X size={16} />
        </button>
      </div>
      {!replace && (
      <div className="flex gap-1 px-3 pt-2">
        {(["pedals", "pedalboards", "custom"] as const).map((c) => (
          <button
            key={c}
            onClick={() => setCategory(c)}
            className={`rounded-control px-3 py-1 text-sm capitalize ${
              category === c ? "bg-brand/10 text-brand" : "text-ink-muted hover:bg-surface-hover"
            }`}
          >
            {c}
          </button>
        ))}
      </div>
      )}
      {category === "custom" ? (
        <CustomItemForm onDone={onClose} />
      ) : (
      <ul className="max-h-80 overflow-y-auto p-2 max-sm:max-h-[42vh]">
        {!catalog && !error && <li className="p-3 text-sm text-ink-muted">Loading catalog…</li>}
        {error && <li className="p-3 text-sm text-danger">{error}</li>}
        {catalog && results.length === 0 && <li className="p-3 text-sm text-ink-muted">No results</li>}
        {results.map((item: CatalogItem) => {
          const key = `${item.brand}-${item.name}`;
          const isAdded = added === key;
          return (
          <li key={key}>
            <button
              onClick={() => {
                if (target) {
                  replaceItem(target.id, item);
                  onClose();
                } else add(item, key);
              }}
              className={`flex w-full items-center gap-3 rounded-control p-2 text-left transition-colors ${
                isAdded ? "bg-brand/10" : "hover:bg-surface-hover active:bg-surface-hover"
              }`}
            >
              <img
                src={thumbUrl(catalog, kind, item.image) ?? undefined}
                alt=""
                loading="lazy"
                className="size-16 shrink-0 rounded-control bg-canvas object-contain"
              />
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{item.name}</span>
                <span className="block truncate text-xs text-ink-muted">
                  {item.brand} · {formatSize(item.width, item.height, units)}
                </span>
              </span>
              {isAdded && (
                <span className="ml-auto flex shrink-0 items-center gap-1 pr-1 text-[13px] font-semibold text-brand">
                  <Check size={16} strokeWidth={2.5} />
                  Added
                </span>
              )}
            </button>
          </li>
          );
        })}
      </ul>
      )}
    </div>
  );
}
