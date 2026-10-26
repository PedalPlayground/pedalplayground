import { Check, Search, X } from "lucide-react";
import { tip } from "./Tooltip";
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { PHONE_QUERY, useMediaQuery, useVisualViewport } from "../lib/viewport";
import { thumbUrl } from "../lib/catalog";
import { formatSize } from "../lib/units";
import type { CatalogItem } from "../lib/types";
import { useCatalog } from "../store/catalog";
import { CustomItemForm } from "./CustomItemForm";
import { usePlayground } from "../store/playground";
import { useUi } from "../store/ui";

type Category = "pedals" | "pedalboards" | "custom";

/** How far (px) a drag down on the drawer's handle has to go before letting go closes it. */
const SWIPE_CLOSE = 80;
/** Or how fast (px per ms) a flick has to be. */
const FLICK_CLOSE = 0.5;
const SHEET_MS = 220;

/**
 * Adds products to the canvas; with `replace`, picks a replacement for the selected product instead.
 * Larger screens get a panel above the toolbar; phones get a bottom drawer that slides closed.
 */
export function SearchPanel({ onClose: close, replace = false }: { onClose: () => void; replace?: boolean }) {
  const phone = useMediaQuery(PHONE_QUERY);
  const { height: visibleHeight, keyboard } = useVisualViewport();

  // Phones slide the drawer away before unmounting it.
  const [closing, setClosing] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(closeTimer.current), []);
  const onClose = useCallback(() => {
    if (!phone) return close();
    (document.activeElement as HTMLElement | null)?.blur(); // drop the keyboard as the drawer leaves
    setClosing(true);
    clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(close, SHEET_MS);
  }, [phone, close]);

  // Swipe down on the handle to close.
  const [drag, setDrag] = useState<number | null>(null);
  const dragStart = useRef({ y: 0, t: 0 });
  const onHandleDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragStart.current = { y: e.clientY, t: performance.now() };
    setDrag(0);
  };
  const onHandleMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (drag !== null) setDrag(Math.max(0, e.clientY - dragStart.current.y));
  };
  const onHandleUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (drag === null) return;
    const dy = Math.max(0, e.clientY - dragStart.current.y);
    const speed = dy / Math.max(1, performance.now() - dragStart.current.t);
    setDrag(null);
    if (dy > SWIPE_CLOSE || speed > FLICK_CLOSE) onClose();
  };

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
    addedTimer.current = setTimeout(() => (phone ? onClose() : setAdded(null)), phone ? 600 : 1200);
  };

  const body = (
    <>
      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        <Search size={16} className="text-ink-muted" />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={target ? `Replace ${target.label}` : "Search pedals and pedalboards"}
          className="h-9 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-muted max-sm:text-base"
        />
        <button aria-label="Close search" {...tip("Close")} onClick={onClose} className="press grid size-7 place-items-center rounded-control text-ink-muted hover:bg-surface-hover hover:text-ink active:bg-chrome-line">
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
        <div className={phone ? "min-h-0 flex-1 overflow-y-auto" : ""}>
          <CustomItemForm onDone={onClose} />
        </div>
      ) : (
      <ul className={`overflow-y-auto overscroll-contain p-2 ${phone ? "min-h-0 flex-1" : "max-h-80"}`}>
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
                isAdded ? "bg-brand/10" : "hover:bg-surface-hover active:bg-chrome-line"
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
                <span className="animate-enter ml-auto flex shrink-0 items-center gap-1 pr-1 text-[13px] font-semibold text-brand [--enter-y:4px]">
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
    </>
  );

  if (!phone) {
    return <div className="animate-enter w-[min(420px,calc(100vw-5rem))] rounded-panel bg-surface shadow-panel">{body}</div>;
  }

  // Phone drawer. Sits above the keyboard when it's open, and leaves the header in view.
  const offset = closing ? "100%" : `${drag ?? 0}px`;
  return createPortal(
    <div className="fixed inset-0 z-40">
      <div
        className="animate-fade absolute inset-0 bg-ink/20"
        style={{ opacity: closing ? 0 : 1 - (drag ?? 0) / 400, transition: drag === null ? `opacity ${SHEET_MS}ms ease-out` : "none" }}
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-label={replace ? "Replace" : "Add Gear"}
        className="animate-sheet absolute inset-x-0 flex flex-col rounded-t-[16px] bg-surface shadow-[0_-4px_24px_rgb(0_0_0/0.12)]"
        style={{
          bottom: keyboard,
          height: Math.min(visibleHeight * 0.72, visibleHeight - 56),
          paddingBottom: keyboard ? 0 : "env(safe-area-inset-bottom)",
          transform: `translateY(${offset})`,
          transition: drag === null ? `transform ${SHEET_MS}ms cubic-bezier(0.2, 0.8, 0.2, 1)` : "none",
        }}
      >
        <div
          className="flex h-6 shrink-0 cursor-grab touch-none items-center justify-center"
          onPointerDown={onHandleDown}
          onPointerMove={onHandleMove}
          onPointerUp={onHandleUp}
          onPointerCancel={onHandleUp}
          aria-hidden
        >
          <span className="h-1 w-9 rounded-full bg-line" />
        </div>
        {body}
      </div>
    </div>,
    document.body,
  );
}
