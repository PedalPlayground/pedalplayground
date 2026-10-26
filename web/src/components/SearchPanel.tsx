import * as Dropdown from "@radix-ui/react-dropdown-menu";
import { Check, ChevronDown, ChevronLeft, CornerDownLeft, Plus, Search, X } from "lucide-react";
import { tip } from "./Tooltip";
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
import { PHONE_QUERY, useMediaQuery, useVisualViewport } from "../lib/viewport";
import { thumbUrl, type Kind } from "../lib/catalog";
import { indexItem, search } from "../lib/search";
import { SIZE_CLASSES, sizeClass, sizeRangeShort, type SizeClass } from "../lib/sizes";
import { formatSize } from "../lib/units";
import type { CatalogItem } from "../lib/types";
import { useCatalog } from "../store/catalog";
import { menuContentClass, rowClass } from "./ContextMenu";
import { CustomItemForm } from "./CustomItemForm";
import { usePlayground } from "../store/playground";
import { useUi } from "../store/ui";

/** One catalog product with its kind, so pedals and pedalboards can share a list. */
interface Entry {
  /** Unique within the list, for React keys. Names alone aren't: the catalog has a few repeated entries. */
  id: number;
  kind: Kind;
  item: CatalogItem;
  brand: string;
  name: string;
}

const KIND_OPTIONS: { id: Kind | "all"; label: string }[] = [
  { id: "all", label: "All Gear" },
  { id: "pedal", label: "Pedals" },
  { id: "pedalboard", label: "Pedalboards" },
];

const sizeItem = `${rowClass} text-ink data-[highlighted]:bg-surface-hover active:bg-chrome-line`;

/** Rows rendered at once; more than this asks for a narrower search. */
const MAX_RESULTS = 60;

/** How far (px) a drag down on the drawer's handle has to go before letting go closes it. */
const SWIPE_CLOSE = 80;
/** Or how fast (px per ms) a flick has to be. */
const FLICK_CLOSE = 0.5;
const SHEET_MS = 220;

/**
 * Adds products to the canvas; with `replace`, picks a replacement for the selected product instead.
 * Larger screens get a panel above the toolbar; phones get a bottom drawer that slides closed.
 */
export function SearchPanel({ onClose: close, replace = false, edit = false }: { onClose: () => void; replace?: boolean; edit?: boolean }) {
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
  const deferredQuery = useDeferredValue(query);
  const units = useUi((u) => u.units);
  const addCatalogItem = usePlayground((p) => p.addCatalogItem);
  const replaceItem = usePlayground((p) => p.replaceItem);
  const target = usePlayground((p) =>
    (replace || edit) && p.selected.length === 1 ? p.items.find((i) => i.id === p.selected[0] && (!edit || i.custom)) : undefined,
  );

  // Filters are optional: no kind picked means pedals and pedalboards together. Replacing keeps to the same kind.
  const [kindFilter, setKindFilter] = useState<Kind | null>(null);
  const kind: Kind | null = target ? target.kind : kindFilter;
  const [sizes, setSizes] = useState<SizeClass[]>([]);
  const filtered = kindFilter !== null || sizes.length > 0;
  const clearFilters = () => {
    setKindFilter(null);
    setSizes([]);
  };
  const toggleSize = (s: SizeClass) => setSizes((cur) => (cur.includes(s) ? cur.filter((c) => c !== s) : [...cur, s]));

  // The custom item form, opened from the Custom button or from an empty search (prefilled with what was typed).
  const [custom, setCustom] = useState<{ name: string; kind: Kind } | null>(null);

  // Replacing and editing need exactly one selected product; close if that stops being true.
  useEffect(() => {
    if ((replace || edit) && !target) onClose();
  }, [replace, edit, target, onClose]);

  useEffect(() => {
    void load();
  }, [load]);

  // Pedals and pedalboards in one alphabetical list, indexed once for search.
  const index = useMemo(() => {
    if (!catalog) return [];
    const all: Omit<Entry, "id">[] = [];
    // Skip exact repeats (same product, size and image), which the catalog has a few of.
    const seen = new Set<string>();
    for (const [kind, list] of [["pedal", catalog.pedals], ["pedalboard", catalog.pedalboards]] as const) {
      for (const item of list) {
        const sig = [kind, item.brand, item.name, item.width, item.height, item.image].join("|");
        if (seen.has(sig)) continue;
        seen.add(sig);
        all.push({ kind, item, brand: item.brand, name: item.name });
      }
    }
    all.sort((a, b) => a.brand.localeCompare(b.brand) || a.name.localeCompare(b.name));
    return all.map((e, id) => ({ ...indexItem({ ...e, id }), size: sizeClass(e.kind, e.item.width) }));
  }, [catalog]);

  const { items: hits, partial } = useMemo(() => {
    const pool = index.filter((e) => (!kind || e.item.kind === kind) && (sizes.length === 0 || sizes.includes(e.size)));
    return search(pool, deferredQuery);
  }, [index, kind, sizes, deferredQuery]);
  const results = hits.slice(0, MAX_RESULTS);

  // Brief "Added" confirmation on the row just tapped. Phones then close the panel, which covers the middle of the
  // canvas where new items land.
  const [added, setAdded] = useState<string | null>(null);
  const addedTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(addedTimer.current), []);
  const add = (entry: Entry, key: string) => {
    addCatalogItem(entry.kind, entry.item);
    setAdded(key);
    clearTimeout(addedTimer.current);
    addedTimer.current = setTimeout(() => (phone ? onClose() : setAdded(null)), phone ? 600 : 1200);
  };

  const pick = (entry: Entry) => {
    if (target) {
      replaceItem(target.id, entry.item);
      onClose();
    } else add(entry, String(entry.id));
  };

  // Keyboard: the top result starts highlighted, so Enter adds it as soon as you see it. Arrows move the highlight.
  const [highlight, setActive] = useState(0);
  useEffect(() => setActive(0), [deferredQuery, kind, sizes]);
  const active = results.length === 0 ? -1 : Math.min(highlight, results.length - 1);
  useEffect(() => {
    // Keep the highlighted row in view, but don't scroll the list back to the top on every new search.
    if (active > 0) document.getElementById(`search-row-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [active]);
  const onSearchKey = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (results.length === 0) return;
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive(Math.min(results.length - 1, Math.max(0, active + step)));
    } else if (e.key === "Enter") {
      const entry = results[active];
      if (!entry) return;
      e.preventDefault();
      pick(entry);
    }
  };

  // Tapping a chip shouldn't take focus from the search field, which would drop the phone keyboard.
  const keepFocus = (e: ReactMouseEvent) => e.preventDefault();
  // Filters read as plain text with a caret; a filter that's narrowing the results turns brand-colored.
  const filterTrigger = (on: boolean) =>
    `press -mx-1 flex h-7 shrink-0 items-center gap-0.5 rounded-control px-1.5 text-[13px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand data-[state=open]:bg-surface-hover ${
      on ? "text-brand" : "text-ink-muted hover:text-ink"
    }`;

  const typed = query.trim();
  const showCustom = edit || custom !== null;

  const body = (
    <>
      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        {edit ? (
          <h2 className="flex h-9 flex-1 items-center text-sm font-semibold">
            {target?.kind === "pedalboard" ? "Edit Custom Pedalboard" : "Edit Custom Pedal"}
          </h2>
        ) : (
        <>
        <Search size={16} className="text-ink-muted" />
        <input
          autoFocus
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setCustom(null); // typing goes back to the results
          }}
          onKeyDown={onSearchKey}
          role="combobox"
          aria-expanded={!showCustom}
          aria-controls="search-results"
          aria-activedescendant={active >= 0 ? `search-row-${active}` : undefined}
          aria-autocomplete="list"
          placeholder={target ? `Replace ${target.label}` : "Search pedals and pedalboards"}
          className="h-9 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-muted max-sm:text-base"
        />
        </>
        )}
        <button aria-label="Close search" {...tip("Close")} onClick={onClose} className="press grid size-7 place-items-center rounded-control text-ink-muted hover:bg-surface-hover hover:text-ink active:bg-chrome-line">
          <X size={16} />
        </button>
      </div>
      {!edit && (custom ? (
        <div className="flex px-3 pt-2">
          <button
            onClick={() => setCustom(null)}
            className="press -ml-1.5 flex h-7 items-center gap-0.5 rounded-control pl-1 pr-2 text-[13px] text-ink-muted hover:bg-surface-hover hover:text-ink"
          >
            <ChevronLeft size={16} />
            Back to Search
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2 px-3 pb-2 pt-2">
          <div className="-mx-3 -my-1 flex min-w-0 flex-1 items-center gap-4 overflow-x-auto px-3 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {!target && (
              <Dropdown.Root>
                <Dropdown.Trigger className={filterTrigger(kindFilter !== null)}>
                  {kindFilter === "pedal" ? "Pedals" : kindFilter === "pedalboard" ? "Pedalboards" : "All Gear"}
                  <ChevronDown size={14} className="opacity-70" />
                </Dropdown.Trigger>
                <Dropdown.Portal>
                  <Dropdown.Content align="start" sideOffset={6} className={`${menuContentClass} !min-w-40`}>
                    <Dropdown.RadioGroup value={kindFilter ?? "all"} onValueChange={(v) => setKindFilter(v === "all" ? null : (v as Kind))}>
                      {KIND_OPTIONS.map((o) => (
                        <Dropdown.RadioItem key={o.id} value={o.id} className={sizeItem}>
                          <span className="grid size-4 shrink-0 place-items-center text-brand">
                            <Dropdown.ItemIndicator>
                              <Check size={14} strokeWidth={2.5} />
                            </Dropdown.ItemIndicator>
                          </span>
                          {o.label}
                        </Dropdown.RadioItem>
                      ))}
                    </Dropdown.RadioGroup>
                  </Dropdown.Content>
                </Dropdown.Portal>
              </Dropdown.Root>
            )}
            <Dropdown.Root>
              <Dropdown.Trigger className={filterTrigger(sizes.length > 0)}>
                {sizes.length === 0 ? "Any Size" : sizes.length === 1 ? SIZE_CLASSES.find((c) => c.id === sizes[0])?.label : `${sizes.length} Sizes`}
                <ChevronDown size={14} className="opacity-70" />
              </Dropdown.Trigger>
              <Dropdown.Portal>
                <Dropdown.Content align="start" sideOffset={6} className={`${menuContentClass} !min-w-56`}>
                  {SIZE_CLASSES.map((c) => (
                    <Dropdown.CheckboxItem
                      key={c.id}
                      checked={sizes.includes(c.id)}
                      onSelect={(e) => e.preventDefault()} // stay open to pick more than one
                      onCheckedChange={() => toggleSize(c.id)}
                      className={sizeItem}
                    >
                      <span className="grid size-4 shrink-0 place-items-center text-brand">
                        <Dropdown.ItemIndicator>
                          <Check size={14} strokeWidth={2.5} />
                        </Dropdown.ItemIndicator>
                      </span>
                      <span>{c.label}</span>
                      <span className="ml-auto pl-6 text-xs tracking-normal text-ink-muted">{sizeRangeShort(c.id, kind, units)}</span>
                    </Dropdown.CheckboxItem>
                  ))}
                  {sizes.length > 0 && (
                    <>
                      <Dropdown.Separator className="-mx-1 my-1 h-px bg-line" />
                      <Dropdown.Item onSelect={() => setSizes([])} className={sizeItem}>
                        <span className="size-4 shrink-0" />
                        Any Size
                      </Dropdown.Item>
                    </>
                  )}
                </Dropdown.Content>
              </Dropdown.Portal>
            </Dropdown.Root>
          </div>
          {!target && (
            <button
              {...tip("Make a Custom Pedal or Pedalboard")}
              onClick={() => setCustom({ name: "", kind: kindFilter ?? "pedal" })}
              className="press flex h-7 shrink-0 items-center gap-1 rounded-control border border-line bg-surface pl-1.5 pr-2.5 text-[13px] font-medium text-ink shadow-sm hover:bg-surface-hover active:bg-chrome-line"
            >
              <Plus size={15} strokeWidth={2.25} />
              Custom
            </button>
          )}
        </div>
      ))}
      {showCustom ? (
        <div className={phone ? "min-h-0 flex-1 overflow-y-auto overscroll-contain" : "max-h-[min(560px,calc(100dvh-12rem))] overflow-y-auto"}>
          <CustomItemForm
            key={custom ? `${custom.kind}:${custom.name}` : "edit"}
            onDone={onClose}
            item={edit ? target : undefined}
            initialKind={custom?.kind}
            initialName={custom?.name}
          />
        </div>
      ) : (
      <ul id="search-results" role="listbox" className={`overflow-y-auto overscroll-contain p-2 ${phone ? "min-h-0 flex-1" : "max-h-80"}`}>
        {!catalog && !error && <li className="p-3 text-sm text-ink-muted">Loading catalog…</li>}
        {error && <li className="p-3 text-sm text-danger">{error}</li>}
        {catalog && (hits.length === 0 || partial) && (
          <li className={`animate-enter flex flex-col items-center gap-3 px-3 text-center [--enter-y:4px] ${partial ? "pb-3 pt-2" : "py-6"}`}>
            <p className="text-sm text-ink-muted">
              {typed ? (
                <>
                  No matches for <span className="font-medium text-ink">“{typed}”</span>
                  {filtered && " with these filters"}
                  {partial && ". Close matches below."}
                </>
              ) : (
                "Nothing matches these filters"
              )}
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {filtered && !partial && (
                <button onMouseDown={keepFocus} onClick={clearFilters} className="press h-8 rounded-control border border-line px-3 text-sm hover:bg-surface-hover">
                  Clear Filters
                </button>
              )}
              {!target && (
                <button
                  onClick={() => setCustom({ name: kindFilter === "pedalboard" ? "" : typed.slice(0, 40), kind: kindFilter ?? "pedal" })}
                  className="flex h-8 max-w-full items-center gap-1 px-3 text-sm btn-primary"
                >
                  <Plus size={15} strokeWidth={2.25} className="shrink-0" />
                  <span className="truncate">
                    {kindFilter === "pedalboard" ? "Make a Custom Pedalboard" : typed ? `Create “${typed}” as a Custom Pedal` : "Make a Custom Pedal"}
                  </span>
                </button>
              )}
            </div>
          </li>
        )}
        {results.map((entry, row) => {
          const { item } = entry;
          const key = String(entry.id);
          const isAdded = added === key;
          return (
          <li key={key} role="presentation">
            <button
              id={`search-row-${row}`}
              role="option"
              aria-selected={row === active}
              tabIndex={-1}
              onClick={() => pick(entry)}
              className={`flex w-full items-center gap-3 rounded-control p-2 text-left transition-colors ${
                isAdded ? "bg-brand/10" : row === active ? "pointer-fine:bg-surface-hover" : "hover:bg-surface-hover active:bg-chrome-line"
              }`}
            >
              <img
                src={thumbUrl(catalog, entry.kind, item.image) ?? undefined}
                alt=""
                loading="lazy"
                className="size-16 shrink-0 rounded-control bg-canvas object-contain"
              />
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{item.name}</span>
                <span className="block truncate text-xs text-ink-muted">
                  {item.brand} · {formatSize(item.width, item.height, units)}
                  {!kind && entry.kind === "pedalboard" && " · Pedalboard"}
                </span>
              </span>
              {row === active && !isAdded && (
                <kbd className="ml-auto flex shrink-0 items-center gap-1 pr-1 font-sans text-xs tracking-normal text-ink-muted pointer-coarse:hidden">
                  <CornerDownLeft size={13} />
                  Enter
                </kbd>
              )}
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
        {hits.length > MAX_RESULTS && (
          <li className="px-2 pb-1 pt-2 text-center text-xs text-ink-muted">
            Showing {MAX_RESULTS} of {hits.length.toLocaleString()}. Keep typing or add a filter to narrow it down.
          </li>
        )}
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
        aria-label={edit ? "Edit" : replace ? "Replace" : "Add Gear"}
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
