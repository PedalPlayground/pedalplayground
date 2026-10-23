import { create } from "zustand";
import { clamp, contentBounds, PX_PER_INCH } from "../lib/geometry";
import { importAny, readLegacyLocalStorage } from "../lib/importers";
import type { CatalogItem, Item, PlaygroundDocument, Rotation, View } from "../lib/types";

const STORAGE_KEY = "pp:playground:v3";
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 4;

const HISTORY_LIMIT = 100;
const NUDGE_COALESCE_MS = 600;

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
  select: (id: string, additive?: boolean) => void;
  clearSelection: () => void;
  rotateSelected: () => void;
  flipSelected: () => void;
  deleteSelected: () => void;
  bringForward: () => void;
  sendBackward: () => void;
  bringToFront: () => void;
  sendToBack: () => void;

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

export const usePlayground = create<PlaygroundState>((set, get) => ({
  name: "Untitled playground",
  items: [],
  selected: [],
  view: DEFAULT_VIEW,
  viewport: { w: 0, h: 0 },
  pendingFit: false,
  past: [],
  future: [],
  lastNudgeAt: 0,

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
    set((s) => {
      // Drop at the viewport center, in world inches.
      const cx = (s.viewport.w / 2 - s.view.x) / s.view.zoom / PX_PER_INCH;
      const cy = (s.viewport.h / 2 - s.view.y) / s.view.zoom / PX_PER_INCH;
      const item: Item = {
        id: crypto.randomUUID(),
        kind,
        label: `${c.brand} ${c.name}`.trim(),
        image: c.image,
        width: c.width,
        height: c.height,
        x: cx - c.width / 2,
        y: cy - c.height / 2,
        rotation: 0,
        flipX: false,
        custom: false,
      };
      // Pedalboards sit beneath every pedal; pedals go on top.
      const items = [...s.items];
      if (kind === "pedalboard") {
        const firstPedal = items.findIndex((i) => i.kind === "pedal");
        items.splice(firstPedal === -1 ? items.length : firstPedal, 0, item);
      } else {
        items.push(item);
      }
      return { ...record(s), items, selected: [item.id] };
    }),

  select: (id, additive) =>
    set((s) => ({
      selected: additive ? (s.selected.includes(id) ? s.selected.filter((x) => x !== id) : [...s.selected, id]) : [id],
    })),
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
        items: s.items.map((i) => (s.selected.includes(i.id) ? { ...i, x: i.x + dx, y: i.y + dy } : i)),
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
  flipSelected: () =>
    set((s) => ({ ...record(s), items: s.items.map((i) => (s.selected.includes(i.id) ? { ...i, flipX: !i.flipX } : i)) })),
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

  reset: () => set((s) => ({ ...record(s), name: "Untitled playground", items: [], selected: [], view: DEFAULT_VIEW })),
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
