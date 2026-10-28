import { create } from "zustand";
import { clamp, contentBounds, itemBounds, PX_PER_INCH } from "../lib/geometry";
import { importAny, readLegacyLocalStorage } from "../lib/importers";
import type { Jacks, PedalTemplate } from "../lib/pedalTemplates";
import { defaultSignal, normalizeSignal, removeItems, SignalError, type SignalGraph } from "../lib/signal";
import type { CatalogItem, Item, PlaygroundDocument, Rotation, View } from "../lib/types";
import type { BoardStyle } from "../lib/boardStyles";
import { track } from "../lib/analytics";
import { toast } from "./toast";
import { useUi } from "./ui";

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

/** One undo step: the items and the signal path share a history, so either kind of edit undoes in order. */
export interface Snapshot {
  items: Item[];
  signal: SignalGraph;
}

interface PlaygroundState {
  name: string;
  items: Item[];
  /** How the pedals are wired together. Pedals can be on the playground without being in it. */
  signal: SignalGraph;
  selected: string[];
  view: View;
  viewport: { w: number; h: number };
  /** Pixels on the canvas's left edge covered by the docked gear panel; new gear is placed and shown clear of it. */
  coverLeft: number;
  setCoverLeft: (px: number) => void;
  /** A fit was requested before the canvas had a size; apply it once measured. */
  pendingFit: boolean;
  past: Snapshot[];
  future: Snapshot[];
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
  addCustomItem: (c: CustomFields & { kind: Item["kind"] }) => void;
  /** Changes a custom item's size, name, color or template, keeping its center. */
  updateCustomItem: (id: string, c: CustomFields) => void;
  select: (id: string, additive?: boolean) => void;
  /** Changes an item's Equipment List details as one undo step. */
  updateGear: (id: string, patch: Partial<Pick<Item, "status" | "price" | "ma" | "voltage" | "pedalType">>) => void;
  /** Selects one item and moves the view just enough to show it. */
  reveal: (id: string) => void;
  clearSelection: () => void;
  rotateSelected: () => void;
  deleteSelected: () => void;
  /** Spaces 3+ selected items so the gaps between them are equal; the leftmost and rightmost stay put. */
  distributeHorizontally: () => void;
  /** Lines the selection up left to right with exactly `gap` inches between neighbors, keeping the leftmost where it is. */
  spaceByGap: (gap: number) => void;
  /** Groups the selected items (two or more), or ungroups them when they're already one group. */
  toggleGroupSelected: () => void;
  /** Copies the selection just to its right, grouped as it was, and selects the copies. */
  duplicateSelected: () => void;
  /** Locks the selection, or unlocks it if every selected item is already locked. */
  toggleLockSelected: () => void;
  bringForward: () => void;
  sendBackward: () => void;
  bringToFront: () => void;
  sendToBack: () => void;

  /**
   * Applies a signal path edit (see lib/signal.ts) as one undo step. A SignalError is shown as a toast and
   * nothing changes. `message` is toasted when the edit changed something.
   */
  editSignal: (edit: (g: SignalGraph) => SignalGraph, message?: string) => boolean;

  setName: (name: string) => void;
  loadDocument: (doc: PlaygroundDocument, opts?: { undoable?: boolean }) => void;
  toDocument: () => PlaygroundDocument;
  reset: () => void;
}

/** What the Custom form sets on a custom pedal or pedalboard. */
export type CustomFields = { width: number; height: number; label: string; color: string | null; template?: PedalTemplate; jacks?: Jacks; board?: BoardStyle };

const DEFAULT_VIEW: View = { x: 80, y: 80, zoom: 1 };

/** Every new board's name, and always a guest's (they name boards once they save them to an account). */
export const DEFAULT_NAME = "Untitled Playground";

/** Pushes the current items and signal path onto the undo stack and clears redo. */
/** The ids plus everything grouped with any of them. */
function withGroupmates(items: Item[], ids: string[]): string[] {
  const groups = new Set(items.filter((i) => ids.includes(i.id) && i.groupId).map((i) => i.groupId));
  return groups.size ? items.filter((i) => ids.includes(i.id) || (i.groupId && groups.has(i.groupId))).map((i) => i.id) : ids;
}

/** True when the items are exactly one group (they all share a group id). */
export const isOneGroup = (items: Item[]) => items.length > 1 && !!items[0].groupId && items.every((i) => i.groupId === items[0].groupId);

/** The selected, unlocked items lined up left to right with exactly `gap` inches between them; the same array when there's nothing to move. */
export function spacedItems(items: Item[], selected: string[], gap: number): Item[] {
  const picked = items.filter((i) => selected.includes(i.id) && !i.locked);
  if (picked.length < 2 || !(gap >= 0)) return items;
  const sorted = picked.map((item) => ({ item, b: itemBounds(item) })).sort((a, b) => a.b.left - b.b.left);
  const shift = new Map<string, number>();
  let cursor = sorted[0].b.left;
  for (const e of sorted) {
    shift.set(e.item.id, cursor - e.b.left);
    cursor += e.b.right - e.b.left + gap;
  }
  return items.map((i) => (shift.has(i.id) ? { ...i, x: i.x + shift.get(i.id)! } : i));
}

const record = (s: Pick<PlaygroundState, "past" | "items" | "signal">) => ({
  past: [...s.past.slice(-(HISTORY_LIMIT - 1)), { items: s.items, signal: s.signal }],
  future: [] as Snapshot[],
});

type NewItem = Pick<Item, "kind" | "label" | "image" | "width" | "height" | "custom" | "color"> &
  Partial<Pick<Item, "ma" | "voltage" | "pedalType">>;

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
    x = ((s.coverLeft + s.viewport.w) / 2 - s.view.x) / s.view.zoom / PX_PER_INCH - n.width / 2;
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
  if (s.viewport.w > 0) {
    // With the gear panel open, keep the whole arrangement centered in the open space beside it as gear is added.
    if (s.coverLeft > 0) patch.view = centeredView(s, items);
    else if (n.kind === "pedal" && prev) patch.view = viewShowing(s, item);
  }
  return patch;
}

/**
 * The view that centers all of `items` in the visible canvas (the part not covered by the gear panel). It keeps the
 * current zoom, and zooms out only as far as it takes for everything to fit with a margin.
 */
function centeredView(s: PlaygroundState, items: Item[]): View {
  const b = contentBounds(items);
  if (!b) return s.view;
  const { viewport, coverLeft, view } = s;
  const margin = viewport.w < 640 ? 24 : 72;
  const w = (b.right - b.left) * PX_PER_INCH;
  const h = (b.bottom - b.top) * PX_PER_INCH;
  const availW = viewport.w - coverLeft - margin * 2;
  const availH = viewport.h - margin * 2;
  const zoom = clamp(Math.min(view.zoom, availW / w, availH / h), MIN_ZOOM, MAX_ZOOM);
  return {
    zoom,
    x: coverLeft + (viewport.w - coverLeft - w * zoom) / 2 - b.left * PX_PER_INCH * zoom,
    y: (viewport.h - h * zoom) / 2 - b.top * PX_PER_INCH * zoom,
  };
}

/** The current view, zoomed out and re-centered only if the whole of `items` isn't on screen. */
function viewShowingAll(s: PlaygroundState, items: Item[]): View {
  const { view, viewport, coverLeft } = s;
  const scale = view.zoom * PX_PER_INCH;
  const pad = PLACE_PAD / scale;
  const vis = {
    left: (coverLeft - view.x) / scale,
    top: -view.y / scale,
    right: (viewport.w - view.x) / scale,
    bottom: (viewport.h - view.y) / scale,
  };
  const b = contentBounds(items)!;
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
  const zoom = clamp(Math.min(view.zoom, (viewport.w - coverLeft - PLACE_PAD * 2) / uw, (viewport.h - PLACE_PAD * 2) / uh), MIN_ZOOM, MAX_ZOOM);
  const k = zoom * PX_PER_INCH;
  return {
    zoom,
    x: (coverLeft + viewport.w) / 2 - ((u.left + u.right) / 2) * k,
    y: viewport.h / 2 - ((u.top + u.bottom) / 2) * k,
  };
}

/** The current view, zoomed out and re-centered only if `item` isn't fully on screen. */
const viewShowing = (s: PlaygroundState, item: Item) => viewShowingAll(s, [item]);

/** The catalog's pedal specs, as item fields. Only the ones the catalog has are set. */
function catalogSpecs(c: CatalogItem): Partial<Pick<Item, "ma" | "voltage" | "pedalType">> {
  return {
    ...(c.ma !== undefined && { ma: c.ma }),
    ...(c.voltage !== undefined && { voltage: c.voltage }),
    ...(c.type !== undefined && { pedalType: c.type }),
  };
}

export const usePlayground = create<PlaygroundState>((set, get) => ({
  name: DEFAULT_NAME,
  items: [],
  signal: defaultSignal(),
  selected: [],
  view: DEFAULT_VIEW,
  viewport: { w: 0, h: 0 },
  coverLeft: 0,
  setCoverLeft: (coverLeft) => set({ coverLeft }),
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
      // Phones fit tight to the sides, leaving room for the save pill up top and the toolbar and scale key below.
      const pad = s.viewport.w < 640 ? { x: 16, top: 48, bottom: 112 } : { x: 96, top: 96, bottom: 96 };
      // With the gear panel open, fit into the space beside it.
      const availW = s.viewport.w - s.coverLeft - pad.x * 2;
      const availH = s.viewport.h - pad.top - pad.bottom;
      const w = (b.right - b.left) * PX_PER_INCH;
      const h = (b.bottom - b.top) * PX_PER_INCH;
      const zoom = clamp(Math.min(availW / w, availH / h), MIN_ZOOM, 1.5);
      return {
        view: {
          zoom,
          x: s.coverLeft + pad.x + (availW - w * zoom) / 2 - b.left * PX_PER_INCH * zoom,
          y: pad.top + (availH - h * zoom) / 2 - b.top * PX_PER_INCH * zoom,
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
        ...catalogSpecs(c),
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
        template: undefined,
        jacks: undefined,
        // A different product has a different price and specs; whether they own it stays.
        price: undefined,
        ma: undefined,
        voltage: undefined,
        pedalType: undefined,
        ...catalogSpecs(c),
      };
      return { ...record(s), items: s.items.map((i) => (i.id === id ? next : i)) };
    }),

  addCustomItem: (c) => {
    track("custom_item_created", { kind: c.kind });
    set((s) =>
      placeNew(s, {
        kind: c.kind,
        label: c.label,
        image: null,
        width: c.width,
        height: c.height,
        custom: true,
        color: c.kind === "pedal" ? c.color : null,
        ...(c.kind === "pedal" && c.template ? { template: c.template } : {}),
        ...(c.kind === "pedal" && c.jacks ? { jacks: c.jacks } : {}),
        ...(c.kind === "pedalboard" && c.board ? { board: c.board } : {}),
      }),
    );
  },

  updateCustomItem: (id, c) =>
    set((s) => {
      const old = s.items.find((i) => i.id === id);
      if (!old?.custom) return {};
      const cx = old.x + old.width / 2;
      const cy = old.y + old.height / 2;
      const pedal = old.kind === "pedal";
      const next: Item = {
        ...old,
        label: pedal ? c.label : old.label,
        width: c.width,
        height: c.height,
        x: cx - c.width / 2,
        y: cy - c.height / 2,
        color: pedal ? c.color : null,
        template: pedal ? c.template : undefined,
        jacks: pedal ? c.jacks : undefined,
        board: pedal ? undefined : (c.board ?? old.board),
      };
      if (!next.template) delete next.template;
      if (!next.jacks) delete next.jacks;
      if (!next.board) delete next.board;
      return { ...record(s), items: s.items.map((i) => (i.id === id ? next : i)) };
    }),

  select: (id, additive) =>
    set((s) => {
      // Picking one piece of a group picks the whole group.
      const ids = withGroupmates(s.items, [id]);
      if (!additive) return { selected: ids };
      const all = ids.every((x) => s.selected.includes(x));
      return { selected: all ? s.selected.filter((x) => !ids.includes(x)) : [...new Set([...s.selected, ...ids])] };
    }),
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
      const ids = new Set(prev.items.map((i) => i.id));
      return {
        past: s.past.slice(0, -1),
        future: [...s.future, { items: s.items, signal: s.signal }],
        items: prev.items,
        signal: prev.signal,
        selected: s.selected.filter((id) => ids.has(id)),
      };
    }),
  redo: () =>
    set((s) => {
      const next = s.future.at(-1);
      if (!next) return {};
      const ids = new Set(next.items.map((i) => i.id));
      return {
        future: s.future.slice(0, -1),
        past: [...s.past, { items: s.items, signal: s.signal }],
        items: next.items,
        signal: next.signal,
        selected: s.selected.filter((id) => ids.has(id)),
      };
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
    set((s) => {
      const all = withGroupmates(s.items, ids);
      return { selected: additive ? [...new Set([...s.selected, ...all])] : all };
    }),

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
  spaceByGap: (gap) =>
    set((s) => {
      const items = spacedItems(s.items, s.selected, gap);
      return items === s.items ? {} : { ...record(s), items };
    }),
  duplicateSelected: () =>
    set((s) => {
      const picked = s.items.filter((i) => s.selected.includes(i.id));
      if (!picked.length) return {};
      const b = contentBounds(picked)!;
      const dx = b.right - b.left + PLACE_GAP;
      const groups = new Map<string, string>();
      const copies = picked.map((i) => {
        const { locked: _locked, groupId, ...rest } = i;
        if (groupId && !groups.has(groupId)) groups.set(groupId, crypto.randomUUID());
        return { ...rest, id: crypto.randomUUID(), x: i.x + dx, ...(groupId ? { groupId: groups.get(groupId) } : {}) };
      });
      // Boards stay beneath every pedal, like newly placed gear.
      const boards = copies.filter((i) => i.kind === "pedalboard");
      const rest = copies.filter((i) => i.kind !== "pedalboard");
      const firstPedal = s.items.findIndex((i) => i.kind === "pedal");
      const items = [...s.items];
      items.splice(firstPedal === -1 ? items.length : firstPedal, 0, ...boards);
      items.push(...rest);
      const next = { ...s, items };
      return {
        ...record(s),
        items,
        selected: copies.map((i) => i.id),
        ...(s.viewport.w > 0 ? { view: viewShowingAll(next, copies) } : {}),
      };
    }),
  toggleGroupSelected: () =>
    set((s) => {
      const picked = s.items.filter((i) => s.selected.includes(i.id));
      if (picked.length < 2) return {};
      const one = isOneGroup(picked);
      const id = crypto.randomUUID();
      return {
        ...record(s),
        items: s.items.map((i) => {
          if (!s.selected.includes(i.id)) return i;
          const { groupId: _old, ...rest } = i;
          return one ? rest : { ...rest, groupId: id };
        }),
      };
    }),
  toggleLockSelected: () =>
    set((s) => {
      const picked = s.items.filter((i) => s.selected.includes(i.id));
      if (!picked.length) return {};
      const lock = !picked.every((i) => i.locked);
      return { ...record(s), items: s.items.map((i) => (s.selected.includes(i.id) ? { ...i, locked: lock } : i)) };
    }),
  deleteSelected: () =>
    set((s) => ({
      ...record(s),
      items: s.items.filter((i) => !s.selected.includes(i.id)),
      // Deleted pedals leave the chain, and the pedals on either side are plugged into each other.
      signal: removeItems(s.signal, s.selected),
      selected: [],
    })),

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

  editSignal: (edit, message) => {
    const s = get();
    let signal: SignalGraph;
    try {
      signal = edit(s.signal);
    } catch (e) {
      if (e instanceof SignalError) {
        toast(e.message);
        return false;
      }
      throw e;
    }
    if (signal === s.signal) return false;
    set({ ...record(s), signal });
    if (message) toast(message);
    return true;
  },

  setName: (name) => set({ name }),

  loadDocument: (doc, opts) => {
    set((s) => ({
      ...(opts?.undoable ? record(s) : { past: [], future: [] }),
      name: doc.name,
      items: doc.items,
      signal: normalizeSignal(doc.signal, doc.items),
      selected: [],
      view: doc.view ?? DEFAULT_VIEW,
    }));
    if (!doc.view) {
      if (get().viewport.w > 0) get().fitToContent();
      else set({ pendingFit: true });
    }
  },

  toDocument: () => {
    const { name, items, view, signal } = get();
    return { schemaVersion: 3, savedAt: new Date().toISOString(), name, items, view, signal };
  },

  reset: () =>
    set((s) => ({ ...record(s), name: DEFAULT_NAME, items: [], signal: defaultSignal(), selected: [], view: DEFAULT_VIEW })),
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
    if (s.items === prev.items && s.signal === prev.signal && s.name === prev.name && s.view === prev.view) return;
    // A shared playground being viewed isn't the user's; keep their own board in storage.
    if (useUi.getState().viewing) return;
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
