import { Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { thumbUrl } from "../lib/catalog";
import { formatSize } from "../lib/units";
import type { CatalogItem } from "../lib/types";
import { useCatalog } from "../store/catalog";
import { CustomItemForm } from "./CustomItemForm";
import { usePlayground } from "../store/playground";
import { useUi } from "../store/ui";

type Category = "pedals" | "pedalboards" | "custom";

export function SearchPanel({ onClose }: { onClose: () => void }) {
  const { manifest: catalog, error, load } = useCatalog();
  const [category, setCategory] = useState<Category>("pedals");
  const [query, setQuery] = useState("");
  const units = useUi((u) => u.units);
  const addCatalogItem = usePlayground((p) => p.addCatalogItem);

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

  return (
    <div className="w-[min(420px,calc(100vw-5rem))] rounded-panel bg-surface shadow-panel">
      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        <Search size={16} className="text-ink-muted" />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search pedals and pedalboards"
          className="h-9 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-muted"
        />
        <button aria-label="Close search" onClick={onClose} className="text-ink-muted hover:text-ink">
          <X size={16} />
        </button>
      </div>
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
      {category === "custom" ? (
        <CustomItemForm onDone={onClose} />
      ) : (
      <ul className="max-h-80 overflow-y-auto p-2">
        {!catalog && !error && <li className="p-3 text-sm text-ink-muted">Loading catalog…</li>}
        {error && <li className="p-3 text-sm text-danger">{error}</li>}
        {catalog && results.length === 0 && <li className="p-3 text-sm text-ink-muted">No results</li>}
        {results.map((item: CatalogItem) => (
          <li key={`${item.brand}-${item.name}`}>
            <button
              onClick={() => addCatalogItem(kind, item)}
              className="flex w-full items-center gap-3 rounded-control p-2 text-left hover:bg-surface-hover"
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
            </button>
          </li>
        ))}
      </ul>
      )}
    </div>
  );
}
