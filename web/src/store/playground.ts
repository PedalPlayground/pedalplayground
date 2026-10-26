import { create } from "zustand";
import { clamp, contentBounds, itemBounds, PX_PER_INCH } from "../lib/geometry";
import { importAny, readLegacyLocalStorage } from "../lib/importers";
import type { CatalogItem, Item, PlaygroundDocument, Rotation, View } from "../lib/types";

const STORAGE_KEY = "pp:playground:v3";
/** Zooming out stops here (8px per inch), so pedals never shrink to specks. */
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4;

const HISTORY_LIMIT = 100;
const NUDGE_COALESCE_MS = 600;
/** Gap, in inches, between a new pedal and the pedal placed before it. */
const PLACE_GAP = 0.25;
/** Screen padding, in px, kept around a newly placed pedal when zooming out to show it. */
const PLACE_PAD = 48;

interface PlaygroundState {
  name: string;
  items: Item[];
  selected: string[];
  view: View;
  viewport: { w: number; h: number };
  /** A fit was requested before the canvas had a size; apply it once measured. */
  pendingFit: boolean;
  past: Item[][];
  future: Item[][];
  lastNudgeAt: number;
  /** The pedal most recently added from the search panel; the next one lands beside it. */
  lastPlacedId: string | null;

  setViewport: (w: number, h: number) => void;
  setView: (v: Partial<View>) => void;
  panBy: (dx: number, dy: number) => void;
  /** Zooms by `factor`, keeping the screen point (px, py) fixed. Defaults to viewport center. */
  zoomBy: (factor: number, px?: number, py?: number) => void;
  fitToContent: () => void;

  /** Call once before a multi-step edit (e.g. a drag) so it undoes as a single step. */
  beginTransaction: () => void;
  undo: () => void;
  redo: () => void;
  dragTo: (origins: Record<string, { x: number; y: number }>, dxIn: number, dyIn: number) => void;
  nudgeSelected: (dxIn: number, dyIn: number) => void;
  selectMany: (ids: string[], additive?: boolean) => void;

  addCatalogItem: (kind: Item["kind"], c: CatalogItem) => void;
  /** Swaps the given item for another catalog product of the same kind, keeping its center, rotation, flip and stacking. */
  replaceItem: (id: string, c: CatalogItem) => void;
  addCustomItem: (c: { kind: Item["kind"]; width: number; height: number; label: string; color: string | null }) => void;
  select: (id: string, additive?: boolean) => void;
  /** Changes an item's Equipment List details as one undo step. */
  updateGear: (id: string, patch: Partial<Pick<Item, "status" | "price">>) => void;
  /** Selects one item and moves the view just enough to show it. */
  reveal: (id: string) => void;
  clearSelection: () => void;
  rotateSelected: () => void;
  deleteSelected: () => void;
  /** Spaces 3+ selected items so the gaps between them are equal; the leftmost and rightmost stay put. */
  distributeHorizontally: () => void;
  /** Locks the selection, or unlocks it if every selected item is already locked. */
  toggleLockSelected: () => void;
  bringForward: () => void;
  sendBackward: () => void;
  bringToFront: () => void;
  sendToBack: () => void;

  setName: (name: string) => void;
  loadDocument: (doc: PlaygroundDocument, opts?: { undoable?: boolean }) => void;
  toDocument: () => PlaygroundDocument;
  reset: () => void;
}

const DEFAULT_VIEW: View = { x: 80, y: 80, zoom: 1 };

/** Pushes the current items onto the undo stack and clears redo. */
const record = (s: Pick<PlaygroundState, "past" | "items">) => ({
  past: [...s.past.slice(-(HISTORY_LIMIT - 1)), s.items],
  future: [] as Item[][],
});

type NewItem = Pick<Item, "kind" | "label" | "image" | "width" | "height" | "custom" | "color">;

/**
 * Adds an item and returns the state patch. A pedal goes to the right of the previously placed pedal with its
 * bottom edges aligned; otherwise (first pedal, or any pedalboard) it goes at the viewport center. If the result
 * isn't fully visible, the view zooms out just enough to show it.
 */
function placeNew(s: PlaygroundState, n: NewItem): Partial<PlaygroundState> {
  const prev = n.kind === "pedal" ? s.items.find((i) => i.id === s.lastPlacedId) : undefined;
  let x: number;
  let y: number;
  if (prev) {
    const b = itemBounds(prev);
    x = b.right + PLACE_GAP;
    y = b.bottom - n.height;
  } else {
    x = (s.viewport.w / 2 - s.view.x) / s.view.zoom / PX_PER_INCH - n.width / 2;
    y = (s.viewport.h / 2 - s.view.y) / s.view.zoom / PX_PER_INCH - n.height / 2;
  }
  const item: Item = { id: crypto.randomUUID(), ...n, x, y, rotation: 0, flipX: false };

  // Pedalboards sit beneath every pedal; pedals go on top.
  const items = [...s.items];
  if (n.kind === "pedalboard") {
    const firstPedal = items.findIndex((i) => i.kind === "pedal");
    items.splice(firstPedal === -1 ? items.length : firstPedal, 0, item);
  } else {
    items.push(item);
  }

  const patch: Partial<PlaygroundState> = { ...record(s), items, selected: [item.id] };
  if (n.kind === "pedal") patch.lastPlacedId = item.id;
  if (n.kind === "pedal" && prev && s.viewport.w > 0) patch.view = viewShowing(s, item);
  return patch;
}

/** The current view, zoomed out and re-centered only if `item` isn't fully on screen. */
function viewShowing(s: PlaygroundState, item: Item): View {
  const { view, viewport } = s;
  const scale = view.zoom * PX_PER_INCH;
  const pad = PLACE_PAD / scale;
  const vis = {
    left: -view.x / scale,
    top: -view.y / scale,
    right: (viewport.w - view.x) / scale,
    bottom: (viewport.h - view.y) / scale,
  };
  const b = itemBounds(item);
  const inside = b.left >= vis.left + pad && b.right <= vis.right - pad && b.top >= vis.top + pad && b.bottom <= vis.bottom - pad;
  if (inside) return view;

  const u = {
    left: Math.min(vis.left, b.left),
    top: Math.min(vis.top, b.top),
    right: Math.max(vis.right, b.right),
    bottom: Math.max(vis.bottom, b.bottom),
  };
  const uw = (u.right - u.left) * PX_PER_INCH;
  const uh = (u.bottom - u.top) * PX_PER_INCH;
  const zoom = clamp(Math.min(view.zoom, (viewport.w - PLACE_PAD * 2) / uw, (viewport.h - PLACE_PAD * 2) / uh), MIN_ZOOM, MAX_ZOOM);
  const k = zoom * PX_PER_INCH;
  return {
    zoom,
    x: viewport.w / 2 - ((u.left + u.right) / 2) * k,
    y: viewport.h / 2 - ((u.top + u.bottom) / 2) * k,
  };
}

export const usePlayground = create<PlaygroundState>((set, get) => ({
  name: "Untitled Playground",
  items: [],
  selected: [],
  view: DEFAULT_VIEW,
  viewport: { w: 0, h: 0 },
  pendingFit: false,
  past: [],
  future: [],
  lastNudgeAt: 0,
  lastPlacedId: null,

  setViewport: (w, h) => {
    set({ viewport: { w, h } });
    if (get().pendingFit && w > 0) {
      set({ pendingFit: false });
      get().fitToContent();
    }
  },
  setView: (v) => set((s) => ({ view: { ...s.view, ...v } })),
  panBy: (dx, dy) => set((s) => ({ view: { ...s.view, x: s.view.x + dx, y: s.view.y + dy } })),

  zoomBy: (factor, px, py) =>
    set((s) => {
      const cx = px ?? s.viewport.w / 2;
      const cy = py ?? s.viewport.h / 2;
      const zoom = clamp(s.view.zoom * factor, MIN_ZOOM, MAX_ZOOM);
      const k = zoom / s.view.zoom;
      return { view: { zoom, x: cx - (cx - s.view.x) * k, y: cy - (cy - s.view.y) * k } };
    }),

  fitToContent: () =>
    set((s) => {
      const b = contentBounds(s.items);
      if (!b || !s.viewport.w) return { view: DEFAULT_VIEW };
      const pad = 96;
      const w = (b.right - b.left) * PX_PER_INCH;
      const h = (b.bottom - b.top) * PX_PER_INCH;
      const zoom = clamp(Math.min((s.viewport.w - pad * 2) / w, (s.viewport.h - pad * 2) / h), MIN_ZOOM, 1.5);
      return {
        view: {
          zoom,
          x: (s.viewport.w - w * zoom) / 2 - b.left * PX_PER_INCH * zoom,
          y: (s.viewport.h - h * zoom) / 2 - b.top * PX_PER_INCH * zoom,
        },
      };
    }),

  addCatalogItem: (kind, c) =>
    set((s) =>
      placeNew(s, {
        kind,
        label: `${c.brand} ${c.name}`.trim(),
        image: c.image,
        width: c.width,
        height: c.height,
        custom: false,
        color: null,
      }),
    ),

  replaceItem: (id, c) =>
    set((s) => {
      const old = s.items.find((i) => i.id === id);
      if (!old) return {};
      const cx = old.x + old.width / 2;
      const cy = old.y + old.height / 2;
      const next: Item = {
        ...old,
        label: `${c.brand} ${c.name}`.trim(),
        image: c.image,
        width: c.width,
        height: c.height,
        x: cx - c.width / 2,
        y: cy - c.height / 2,
        custom: false,
        color: null,
        // A different product has a different price; whether they own it stays.
        price: undefined,
      };
      return { ...record(s), items: s.items.map((i) => (i.id === id ? next : i)) };
    }),

  addCustomItem: (c) =>
    set((s) =>
      placeNew(s, {
        kind: c.kind,
        label: c.label,
        image: null,
        width: c.width,
        height: c.height,
        custom: true,
        color: c.kind === "pedal" ? c.color : null,
      }),
    ),

  select: (id, additive) =>
    set((s) => ({
      selected: additive ? (s.selected.includes(id) ? s.selected.filter((x) => x !== id) : [...s.selected, id]) : [id],
    })),
  updateGear: (id, patch) =>
    set((s) => {
      const item = s.items.find((i) => i.id === id);
      if (!item || Object.entries(patch).every(([k, v]) => item[k as keyof Item] === v)) return {};
      return { ...record(s), items: s.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) };
    }),
  reveal: (id) =>
    set((s) => {
      const item = s.items.find((i) => i.id === id);
      if (!item) return {};
      return { selected: [id], view: s.viewport.w > 0 ? viewShowing(s, item) : s.view };
    }),
  clearSelection: () => set({ selected: [] }),

  beginTransaction: () => set((s) => record(s)),

  undo: () =>
    set((s) => {
      const prev = s.past.at(-1);
      if (!prev) return {};
      const ids = new Set(prev.map((i) => i.id));
      return { past: s.past.slice(0, -1), future: [...s.future, s.items], items: prev, selected: s.selected.filter((id) => ids.has(id)) };
    }),
  redo: () =>
    set((s) => {
      const next = s.future.at(-1);
      if (!next) return {};
      const ids = new Set(next.map((i) => i.id));
      return { future: s.future.slice(0, -1), past: [...s.past, s.items], items: next, selected: s.selected.filter((id) => ids.has(id)) };
    }),

  dragTo: (origins, dx, dy) =>
    set((s) => ({
      items: s.items.map((i) => (origins[i.id] ? { ...i, x: origins[i.id].x + dx, y: origins[i.id].y + dy } : i)),
    })),

  nudgeSelected: (dx, dy) =>
    set((s) => {
      const now = Date.now();
      // Holding an arrow key shouldn't create one undo step per repeat.
      const history = now - s.lastNudgeAt > NUDGE_COALESCE_MS ? record(s) : {};
      return {
        ...history,
        lastNudgeAt: now,
        items: s.items.map((i) => (s.selected.includes(i.id) && !i.locked ? { ...i, x: i.x + dx, y: i.y + dy } : i)),
      };
    }),

  selectMany: (ids, additive) =>
    set((s) => ({ selected: additive ? [...new Set([...s.selected, ...ids])] : ids })),

  rotateSelected: () =>
    set((s) => ({
      ...record(s),
      items: s.items.map((i) =>
        s.selected.includes(i.id) ? { ...i, rotation: ((i.rotation + 90) % 360) as Rotation } : i,
      ),
    })),
  distributeHorizontally: () =>
    set((s) => {
      const picked = s.items.filter((i) => s.selected.includes(i.id) && !i.locked);
      if (picked.length < 3) return {};
      const sorted = picked.map((item) => ({ item, b: itemBounds(item) })).sort((a, b) => a.b.left - b.b.left);
      const first = sorted[0].b.left;
      const last = sorted[sorted.length - 1].b.right;
      const widths = sorted.reduce((sum, e) => sum + (e.b.right - e.b.left), 0);
      const gap = (last - first - widths) / (sorted.length - 1);
      const shift = new Map<string, number>();
      let cursor = first;
      for (const e of sorted) {
        shift.set(e.item.id, cursor - e.b.left);
        cursor += e.b.right - e.b.left + gap;
      }
      return { ...record(s), items: s.items.map((i) => (shift.has(i.id) ? { ...i, x: i.x + shift.get(i.id)! } : i)) };
    }),
  toggleLockSelected: () =>
    set((s) => {
      const picked = s.items.filter((i) => s.selected.includes(i.id));
      if (!picked.length) return {};
      const lock = !picked.every((i) => i.locked);
      return { ...record(s), items: s.items.map((i) => (s.selected.includes(i.id) ? { ...i, locked: lock } : i)) };
    }),
  deleteSelected: () =>
    set((s) => ({ ...record(s), items: s.items.filter((i) => !s.selected.includes(i.id)), selected: [] })),

  bringForward: () =>
    set((s) => {
      const items = [...s.items];
      for (let n = items.length - 2; n >= 0; n--) {
        if (s.selected.includes(items[n].id) && !s.selected.includes(items[n + 1].id)) {
          [items[n], items[n + 1]] = [items[n + 1], items[n]];
        }
      }
      return { ...record(s), items };
    }),
  sendBackward: () =>
    set((s) => {
      const items = [...s.items];
      for (let n = 1; n < items.length; n++) {
        if (s.selected.includes(items[n].id) && !s.selected.includes(items[n - 1].id)) {
          [items[n], items[n - 1]] = [items[n - 1], items[n]];
        }
      }
      return { ...record(s), items };
    }),
  bringToFront: () =>
    set((s) => ({
      ...record(s),
      items: [...s.items.filter((i) => !s.selected.includes(i.id)), ...s.items.filter((i) => s.selected.includes(i.id))],
    })),
  sendToBack: () =>
    set((s) => ({
      ...record(s),
      items: [...s.items.filter((i) => s.selected.includes(i.id)), ...s.items.filter((i) => !s.selected.includes(i.id))],
    })),

  setName: (name) => set({ name }),

  loadDocument: (doc, opts) => {
    set((s) => ({
      ...(opts?.undoable ? record(s) : { past: [], future: [] }),
      name: doc.name,
      items: doc.items,
      selected: [],
      view: doc.view ?? DEFAULT_VIEW,
    }));
    if (!doc.view) {
      if (get().viewport.w > 0) get().fitToContent();
      else set({ pendingFit: true });
    }
  },

  toDocument: () => {
    const { name, items, view } = get();
    return { schemaVersion: 3, savedAt: new Date().toISOString(), name, items, view };
  },

  reset: () => set((s) => ({ ...record(s), name: "Untitled Playground", items: [], selected: [], view: DEFAULT_VIEW })),
}));

/** Restores the last session; on first run, imports the legacy app's local save if one exists. */
export function restorePlayground() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      usePlayground.getState().loadDocument(importAny(JSON.parse(saved)));
      return;
    }
  } catch {
    /* fall through to legacy import */
  }
  const legacy = readLegacyLocalStorage();
  if (legacy) usePlayground.getState().loadDocument(legacy);
}

/** Debounced local autosave. Returns an unsubscribe function. */
export function startLocalAutosave() {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const unsub = usePlayground.subscribe((s, prev) => {
    if (s.items === prev.items && s.name === prev.name && s.view === prev.view) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(usePlayground.getState().toDocument()));
      } catch {
        /* storage full or unavailable */
      }
    }, 300);
  });
  return () => {
    clearTimeout(timer);
    unsub();
  };
}
