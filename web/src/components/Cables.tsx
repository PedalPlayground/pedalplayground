import { useEffect, useMemo, useState } from "react";
import { create } from "zustand";
import { cableEnd, plugAnchor, plugHead, roundedPath, toLocal } from "../lib/cableRoute";
import {
  boardCables,
  CABLE_KINDS,
  cableId,
  cableKindInfo,
  isPlugEnd,
  sameEnd,
  corners,
  defaultPlugFor,
  moveLeg,
  routeBoardCables,
  toManual,
  type RoutedCable,
  type WireEnd,
} from "../lib/cables";
import { ArrowUp, Cable, Trash2 } from "lucide-react";
import { canvasImageUrl } from "../lib/catalog";
import { findJacks, openHints, withMiddles, type JackHint } from "../lib/jackFinder";
import { useCatalog } from "../store/catalog";
import { LabeledSelect } from "./LabeledSelect";
import type { CableKind } from "../lib/plugs";
import type { Pt } from "../lib/cableRoute";
import { itemBounds, PX_PER_INCH } from "../lib/geometry";
import type { Plug, PlugEnd } from "../lib/plugs";
import type { Item } from "../lib/types";
import { usePlayground } from "../store/playground";
import { SHOW_CABLES, useUi } from "../store/ui";
import { withTool } from "../lib/analytics";
import { barDivider, barIconIdle, barPanel, barSoftButton, barSoftDangerButton } from "./toolbarStyles";
import { tip } from "./Tooltip";
import { knownType, plugBox, PLUG_TYPES, snapAt, type PlugSide, type PlugType } from "../lib/plugs";

/** Audio cable width: 4px at 100% zoom, in inches, so it scales with the board like the gear does. */
const WIDTH = 4 / PX_PER_INCH;
/** How far from a cable a press still picks it, in inches (wide, so thin cables are easy to hit). */
const HIT_WIDTH = 0.6;
/** Corner rounding, in inches. */
const CORNER = 0.3;
/** Side-by-side spacing for cables sharing a run. */
const SPACING = 0.3;

/**
 * The halo around a hovered or picked cable or plug: a white line to set it apart, then a brand line. In screen pixels,
 * like the gear's selection halo, so they match at any zoom (cables themselves scale with the board).
 */
const HALO_WHITE = 1.5;
const HALO_LINE = 2;

/** One cable's line: a single solid stroke in its type's color and width (gray audio, thinner red power). */
function CableLine({ d, kind }: { d: string; kind: CableKind }) {
  const { color, width } = cableKindInfo(kind);
  return <path d={d} fill="none" stroke={color} strokeWidth={WIDTH * width} strokeLinecap="round" strokeLinejoin="round" />;
}

/**
 * A cable picked on the board outside the Signal Flow tool (it gets the little Edit Cables / Delete menu), or a plug
 * with no cable (only older boards have those). `at` is where it was clicked, in world inches: the menu opens there.
 */
export type Chosen = ({ cable: string } | { plug: PlugEnd }) & { at: Pt };

/** What's picked in the Cables tool: a plug waiting for its other end, or a cable. */
type CablePick = {
  /** Picked on the board outside the tool. */
  chosen: Chosen | null;
  /** The end a cable is being run from (it follows the pointer until a second click). */
  plug: WireEnd | null;
  cable: string | null;
  /** Where the picked cable was clicked (or wired), in world inches: its little menu opens there. */
  at: Pt | null;
  /** A run of the picked cable is being dragged: its menu waits. */
  moving: boolean;
  /** The cable under the pointer (or one of its plugs), lit with its plugs as one unit. */
  hover: string | null;
  /** What new cables get: the last type and plug picked (no plug: the type's usual one). */
  style: { kind: CableKind; plug?: PlugType };
};
export const useCablePick = create<CablePick & { set: (p: Partial<CablePick>) => void }>((set) => ({
  chosen: null,
  plug: null,
  cable: null,
  at: null,
  moving: false,
  hover: null,
  style: { kind: "audio" },
  set: (p) => set(p),
}));

// Picking gear lets go of a picked cable or plug.
usePlayground.subscribe((s, prev) => {
  if (s.selected !== prev.selected && s.selected.length && useCablePick.getState().chosen) useCablePick.getState().set({ chosen: null });
});

/** Picks a cable (or a loose plug) on the board (outside the tool), in place of any gear. */
function choose(c: Chosen) {
  usePlayground.getState().clearSelection();
  useCablePick.getState().set({ chosen: c });
}

/** The cable a picked cable or plug stands for, if any: a plug with a cable stands for its cable. */
function chosenCable(items: Item[], c: Chosen | null) {
  if (!c) return undefined;
  const all = boardCables(items);
  if ("cable" in c) return all.find((x) => x.id === c.cable);
  return all.find((x) => sameEnd(x.from, c.plug) || sameEnd(x.to, c.plug));
}

/** Delete on a picked cable or plug: the cable comes out with the plugs at both ends. */
export function deleteChosen() {
  const pick = useCablePick.getState();
  const c = pick.chosen;
  if (!c) return;
  const store = usePlayground.getState();
  if ("cable" in c) {
    const cable = chosenCable(store.items, c);
    if (cable) store.unplug([cable.stored]);
  } else store.removePlug(c.plug);
  pick.set({ chosen: null });
}

/** Edit Cables on a picked cable: opens Signal Flow with that cable picked, its menu where it was clicked. */
function editChosen() {
  const pick = useCablePick.getState();
  const c = pick.chosen;
  if (!c) return;
  useUi.getState().setCablesOpen(true);
  const cable = chosenCable(usePlayground.getState().items, c)?.id ?? null;
  pick.set({ chosen: null, cable, at: cable ? c.at : null, plug: null });
}

/** Each plug with a cable (by cableId) to its cable's id, worked out once per items array. */
let cableOfCache: { items: Item[]; map: Map<string, string> } | null = null;
function cableOfPlugs(items: Item[]) {
  if (cableOfCache?.items !== items)
    cableOfCache = { items, map: new Map(boardCables(items).flatMap((c) => [[cableId(c.from), c.id] as const, [cableId(c.to), c.id] as const])) };
  return cableOfCache.map;
}

/** The middle of a plug's head, in world inches. */
function plugMiddle(item: Item, plug: Plug): Pt {
  const b = plugHead(item, plug);
  return [(b.left + b.right) / 2, (b.top + b.bottom) / 2];
}

/** What a cable's route depends on for one item: where it is and its plugs (not the cables on them). */
const shapeOf = (i: Item) =>
  `${i.x},${i.y},${i.width},${i.height},${i.rotation},${i.flipX ? 1 : 0},${(i.plugs ?? []).map((p) => `${p.id}${p.side}${p.at}${p.type}`).join(";")}`;

/**
 * The routes for this exact items array, worked out once and shared by the cables and their handles. Routing every
 * cable is the slow part, so it's done only when something they go around has moved: a change that only touches
 * cables (a new one, a type, a hand-placed run) keeps the others' routes. While gear is dragged, only the cables on
 * what's moving are routed again, quickly; the full routing waits until it's let go.
 */
let cache: { items: Item[]; routes: RoutedCable[]; shapes: Map<string, string>; settled: boolean } | null = null;
function routesFor(items: Item[]) {
  const ui = useUi.getState();
  const settled = !ui.dragging && !ui.nudging;
  if (cache && cache.items === items && cache.settled === settled) return cache.routes;
  const shapes = new Map(items.filter((i) => i.kind === "pedal" || i.kind === "pedalboard").map((i) => [i.id, shapeOf(i)]));
  let reuse: Map<string, RoutedCable["route"]> | undefined;
  if (cache) {
    const moved = new Set([...shapes].filter(([id, sh]) => cache!.shapes.get(id) !== sh).map(([id]) => id));
    for (const id of cache.shapes.keys()) if (!shapes.has(id)) moved.add(id);
    const keep = (r: RoutedCable) => !r.legs && !moved.has(r.from.item) && !moved.has(r.to.item);
    // Settled: keep routes only if nothing moved (and the last ones weren't the rough drag-time ones).
    if (!settled || (cache.settled && !moved.size)) reuse = new Map(cache.routes.filter(keep).map((r) => [r.id, r.route]));
  }
  cache = { items, routes: routeBoardCables(items, { spacing: SPACING, reuse, quick: !settled }), shapes, settled };
  return cache.routes;
}

/** A leg of a route is long enough to get a handle from this length, in inches. */
const HANDLE_MIN_LEG = 0.9;
/** A press has to travel this far, in screen px, before it drags a leg. */
const DRAG_START_PX = 3;

/** World inches under a pointer event. */
function worldAt(e: { clientX: number; clientY: number }, canvas: Element): Pt {
  const r = canvas.getBoundingClientRect();
  const v = usePlayground.getState().view;
  const k = v.zoom * PX_PER_INCH;
  return [(e.clientX - r.left - v.x) / k, (e.clientY - r.top - v.y) / k];
}

/** The leg of `pts` nearest to `p`. */
function nearestLeg(pts: Pt[], p: Pt) {
  let best = 0;
  let bestD = Infinity;
  for (let k = 0; k < pts.length - 1; k++) {
    const [a, b] = [pts[k], pts[k + 1]];
    const x = Math.min(Math.max(p[0], Math.min(a[0], b[0])), Math.max(a[0], b[0]));
    const y = Math.min(Math.max(p[1], Math.min(a[1], b[1])), Math.max(a[1], b[1]));
    const d = Math.hypot(p[0] - x, p[1] - y);
    if (d < bestD) [best, bestD] = [k, d];
  }
  return best;
}

/**
 * Picks the cable and, if the press moves, drags leg `k` sideways (or the leg nearest the press when `k` is missing).
 * The cable keeps the shape it's dragged into: it's stored as hand-placed legs, one undo step for the whole drag.
 */
function pressCable(e: React.PointerEvent<Element>, c: RoutedCable, k?: number) {
  e.stopPropagation();
  const canvas = e.currentTarget.closest("[data-canvas]");
  if (!canvas) return;
  const start = worldAt(e, canvas);
  // Picking a cable lets go of the picked pedal. A handle keeps the menu where the cable was first clicked.
  usePlayground.getState().clearSelection();
  const pick = useCablePick.getState();
  pick.set({ cable: c.id, plug: null, at: k !== undefined && pick.cable === c.id && pick.at ? pick.at : start });
  if (e.button !== 0) return;
  const pts = corners(c.route.points);
  // Which way each end's plug points, so a moved end run can turn right at the plug when that's not into the jack.
  const items = usePlayground.getState().items;
  const dirOf = (end: PlugEnd) => {
    const item = items.find((i) => i.id === end.item);
    const plug = item?.plugs?.find((p) => p.id === end.plug);
    return item && plug ? plugAnchor(item, plug).dir : undefined;
  };
  const [d0, d1] = [dirOf(c.from), dirOf(c.to)];
  const plugDirs = d0 && d1 ? { start: d0, end: d1 } : undefined;
  const leg = k ?? nearestLeg(pts, start);
  const horizontal = Math.abs(pts[leg][1] - pts[leg + 1][1]) < 1e-6;
  const from = horizontal ? pts[leg][1] : pts[leg][0];
  const grab = (horizontal ? start[1] : start[0]) - from;
  const x0 = e.clientX;
  const y0 = e.clientY;
  let started = false;
  // Listens on the window, not the element: the handle being dragged can be replaced as the cable gains a jog.
  const move = (ev: PointerEvent) => {
    if (ev.pointerId !== e.pointerId) return;
    if (!started) {
      if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < DRAG_START_PX) return;
      started = true;
      usePlayground.getState().beginTransaction();
      useCablePick.getState().set({ moving: true });
    }
    const p = worldAt(ev, canvas);
    last = p;
    // Snap to 1/16 inch, like plugs, so runs line up neatly.
    const to = Math.round(((horizontal ? p[1] : p[0]) - grab) * 16) / 16;
    let next = moveLeg(pts, leg, to, 0.25, plugDirs);
    // Stored from the plug the cable lives on, which may be its far end.
    if (c.stored !== c.from) next = [...next].reverse();
    usePlayground.getState().setCableLegs(c.stored, toManual(next), false);
  };
  let last: Pt | null = null;
  const end = () => {
    // The menu comes back where the run was let go.
    if (started) useCablePick.getState().set({ moving: false, ...(last && k === undefined ? { at: last } : {}) });
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", end);
    window.removeEventListener("pointercancel", end);
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", end);
  window.addEventListener("pointercancel", end);
}

/**
 * Every cable on the board, routed around the pedals. Drawn inside the zoomed layer, above pedalboards and below
 * pedals, so it reads as lying on the board. Only the Cables tool lets cables take the pointer.
 */
export function CableLayer({ items }: { items: Item[] }) {
  const open = useUi((u) => u.cablesOpen);
  // Outside the tool, cables can be picked on the board too (not while editing plugs or just viewing).
  const pickable = useUi((u) => SHOW_CABLES && !u.cablesOpen && !u.viewing);
  const routes = routesFor(items);
  const toolPick = useCablePick((p) => p.cable);
  const chosen = useCablePick((p) => p.chosen);
  const picked = open ? toolPick : chosen && "cable" in chosen ? chosen.cable : null;
  const hover = useCablePick((p) => p.hover);
  const setHover = (h: string | null | ((h: string | null) => string | null)) =>
    useCablePick.getState().set({ hover: typeof h === "function" ? h(useCablePick.getState().hover) : h });
  const zoom = usePlayground((st) => st.view.zoom);
  // Re-routes properly once a drag ends (routesFor reads it).
  useUi((u) => u.dragging || u.nudging);
  if (!routes.length) return null;
  const s = PX_PER_INCH;
  return (
    <svg aria-hidden className="pointer-events-none absolute left-0 top-0 overflow-visible" width={1} height={1}>
      <g transform={`scale(${s})`}>
        {routes.map((c) => {
          const d = roundedPath(c.route.points, CORNER);
          const lit = (open || pickable) && (hover === c.id || picked === c.id);
          return (
            <g key={c.id}>
              {/* Hover and pick show as a halo under the cable (white, then brand), so it works for every color and line style. */}
              {lit &&
                [HALO_WHITE + HALO_LINE, HALO_WHITE].map((out, k) => (
                  <path
                    key={k}
                    d={d}
                    fill="none"
                    stroke={k ? "#fff" : "var(--color-brand)"}
                    strokeWidth={WIDTH * cableKindInfo(c.kind).width + (2 * out) / (s * zoom)}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                ))}
              <CableLine d={d} kind={c.kind} />
              {(open || pickable) && (
                <path
                  d={d}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={HIT_WIDTH}
                  strokeLinecap="round"
                  className="cursor-pointer"
                  style={{ pointerEvents: "stroke" }}
                  onPointerEnter={() => setHover(c.id)}
                  onPointerLeave={() => setHover((h) => (h === c.id ? null : h))}
                  onPointerDown={(e) => {
                    if (open) return pressCable(e, c);
                    e.stopPropagation();
                    const canvas = e.currentTarget.closest("[data-canvas]");
                    if (canvas) choose({ cable: c.id, at: worldAt(e, canvas) });
                  }}
                />
              )}
            </g>
          );
        })}
      </g>
    </svg>
  );
}

/**
 * Handles on the picked cable's long straight runs: drag one to move that run sideways. Drawn above the pedals,
 * screen-sized whatever the zoom.
 */
export function LegHandles({ items, zoom }: { items: Item[]; zoom: number }) {
  const picked = useCablePick((p) => p.cable);
  const c = routesFor(items).find((r) => r.id === picked);
  if (!c) return null;
  const pts = corners(c.route.points);
  const long = 28 / zoom;
  const thin = 10 / zoom;
  return (
    <>
      {pts.slice(0, -1).map((a, k) => {
        const b = pts[k + 1];
        if (Math.hypot(b[0] - a[0], b[1] - a[1]) < HANDLE_MIN_LEG) return null;
        const horizontal = Math.abs(a[1] - b[1]) < 1e-6;
        const [w, h] = horizontal ? [long, thin] : [thin, long];
        return (
          <div
            key={k}
            role="slider"
            aria-label="Move this run"
            aria-orientation={horizontal ? "vertical" : "horizontal"}
            aria-valuenow={horizontal ? a[1] : a[0]}
            className="absolute rounded-full border-brand bg-white shadow-sm"
            style={{
              left: ((a[0] + b[0]) / 2) * PX_PER_INCH - w / 2,
              top: ((a[1] + b[1]) / 2) * PX_PER_INCH - h / 2,
              width: w,
              height: h,
              borderWidth: 2 / zoom,
              borderStyle: "solid",
              cursor: horizontal ? "ns-resize" : "ew-resize",
              touchAction: "none",
            }}
            onPointerDown={(e) => pressCable(e, c, k)}
          />
        );
      })}
    </>
  );
}

/** Size of a plug's handle in the Cables tool, in screen px whatever the zoom. */
const HANDLE_PX = 14;

/** Guessed jacks for every pedal (from its photo, or the middle of each side), worked out once per pedal and size. */
function useJackHints(items: Item[]) {
  const manifest = useCatalog((s) => s.manifest);
  const [found, setFound] = useState<Record<string, JackHint[]>>({});
  const pedals = items.filter((i) => i.kind === "pedal");
  const key = pedals.map((i) => `${i.id}|${i.image}|${i.width}|${i.height}`).join(",");
  useEffect(() => {
    let live = true;
    for (const item of pedals) {
      const src = item.image ? canvasImageUrl(manifest, item.kind, item.image) : null;
      // No + in the middle of the front edge: jacks are rarely there, and it's where the pointer crosses most. A jack
      // found there still gets one, and the edge plus (see EdgePlus) can put one anywhere.
      const done = (hints: JackHint[]) => live && setFound((f) => ({ ...f, [item.id]: withMiddles(hints, item.width, item.height, ["top", "right", "left"]) }));
      if (src) void findJacks(src, item.width, item.height).then(done);
      else done([]);
    }
    return () => {
      live = false;
    };
    // The key covers what the hints depend on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, manifest]);
  return found;
}

/** Two wire ends are the same spot: the same plug, or the same + on the same pedal. */
const sameWireEnd = (a: WireEnd, b: WireEnd) =>
  a.item === b.item && (isPlugEnd(a) ? isPlugEnd(b) && a.plug === b.plug : !isPlugEnd(b) && a.side === b.side && a.at === b.at);

/**
 * Clicking a plug or a +: the first click starts a cable (nothing is added yet), the second runs it, adding plugs at any
 * + ends, all as one undo step. Clicking the start again lets go of it.
 */
function pickEnd(end: WireEnd) {
  const pick = useCablePick.getState();
  // A picked pedal is let go of, so every pedal's start points are back.
  usePlayground.getState().clearSelection();
  if (!pick.plug) pick.set({ plug: end, cable: null });
  else if (sameWireEnd(pick.plug, end)) pick.set({ plug: null });
  else {
    const items = usePlayground.getState().items;
    const at = endAnchor(items, end)?.at ?? null;
    const stored = usePlayground.getState().wire(pick.plug, end, pick.style);
    pick.set({ plug: null, cable: cableId(stored), at });
  }
}

/** Clicking a plug with a cable picks its cable: a cable and its plugs are one unit. */
function pickJack(end: PlugEnd, at: Pt) {
  usePlayground.getState().clearSelection();
  const cable = boardCables(usePlayground.getState().items).find((c) => sameEnd(c.from, end) || sameEnd(c.to, end));
  useCablePick.getState().set({ cable: cable?.id ?? null, plug: null, at: cable ? at : null });
}

/** Where a wire end's cable leaves the pedal, in world inches, and which way. */
function endAnchor(items: Item[], end: WireEnd) {
  const item = items.find((i) => i.id === end.item);
  if (!item) return null;
  const plug = isPlugEnd(end) ? item.plugs?.find((p) => p.id === end.plug) : { id: "", side: end.side, at: end.at, type: defaultPlugFor(useCablePick.getState().style.kind) };
  return plug ? cableEnd(item, plug) : null;
}

/** The pedal picked in Signal Flow, if one is: a single selected pedal. */
function useFocusPedal(items: Item[]) {
  const selected = usePlayground((s) => s.selected);
  const one = selected.length === 1 ? items.find((i) => i.id === selected[0]) : undefined;
  return one?.kind === "pedal" ? one.id : null;
}

/** A spot just outside a pedal's edge, `off` inches out, in world inches: where a + for that spot sits. */
function edgeSpot(item: Item, side: PlugSide, at: number, off: number): Pt {
  const type = defaultPlugFor(undefined);
  const a = plugAnchor(item, { id: "", side, at, type });
  const back = plugBox(type).out - off;
  return [a.at[0] - a.dir[0] * back, a.at[1] - a.dir[1] * back];
}

/**
 * Where on a pedal a click starts a cable: a band along its edge, mostly inside it (`EDGE_IN` deep) and a little past
 * it (`EDGE_OUT`), in inches. Cables and plugs nearby take the click first (see CableHandles).
 */
const EDGE_IN = 0.5;
const EDGE_OUT = 0.2;
/** The edge start point stays this far from a jack or start point that's already there, in inches. */
const EDGE_ROOM = 0.35;
/** How far from a cable, and around a plug's head, the pointer goes to them instead of the edge, in inches. */
const CABLE_ROOM = 0.3;
const PLUG_ROOM = 0.15;

/** The nearest spot on a pedal's edge to `p` (in its own frame), if `p` is in the edge band. */
function nearestEdge(item: Item, p: Pt): { side: PlugSide; at: number } | null {
  const [x, y] = toLocal(item, p);
  const { width: w, height: h } = item;
  const clamp = (v: number, len: number) => snapAt(Math.min(Math.max(v, 0.2), len - 0.2));
  // How far in from each side the point is (negative outside it), for the sides it's alongside.
  const options: [number, PlugSide, number][] = [];
  if (x > -EDGE_OUT && x < w + EDGE_OUT) options.push([y, "top", clamp(x, w)], [h - y, "bottom", clamp(x, w)]);
  if (y > -EDGE_OUT && y < h + EDGE_OUT) options.push([x, "left", clamp(y, h)], [w - x, "right", clamp(y, h)]);
  const best = options.sort((a, b) => a[0] - b[0])[0];
  return best && best[0] >= -EDGE_OUT && best[0] <= EDGE_IN ? { side: best[1], at: best[2] } : null;
}

/** Distance from `p` to the nearest leg of any route, in inches. */
function distToRoutes(routes: RoutedCable[], p: Pt) {
  let best = Infinity;
  for (const r of routes) {
    const pts = r.route.points;
    for (let k = 0; k < pts.length - 1; k++) {
      const [a, b] = [pts[k], pts[k + 1]];
      const x = Math.min(Math.max(p[0], Math.min(a[0], b[0])), Math.max(a[0], b[0]));
      const y = Math.min(Math.max(p[1], Math.min(a[1], b[1])), Math.max(a[1], b[1]));
      best = Math.min(best, Math.hypot(p[0] - x, p[1] - y));
    }
  }
  return best;
}

/** A box grown by `d` on every side. */
const growBox = (b: { left: number; top: number; right: number; bottom: number }, d: number) => ({ left: b.left - d, top: b.top - d, right: b.right + d, bottom: b.bottom + d });
const inBox = (b: { left: number; top: number; right: number; bottom: number }, [x, y]: Pt) => x >= b.left && x <= b.right && y >= b.top && y <= b.bottom;

/** How far outside a pedal the pointer still counts as over it (its + points sit just past the edge), in inches. */
const HOVER_REACH = 1;

/** The pedal under the pointer, or nearest it within HOVER_REACH, while the Cables tool is open; and the pointer itself. */
function usePointer(items: Item[]) {
  const [state, setState] = useState<{ over: string | null; at: Pt | null }>({ over: null, at: null });
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const canvas = document.querySelector("[data-canvas]");
      if (!canvas) return;
      const p = worldAt(e, canvas);
      let over: string | null = null;
      let best = HOVER_REACH;
      for (const item of usePlayground.getState().items) {
        if (item.kind !== "pedal") continue;
        const b = itemBounds(item);
        // Distance from the pointer to the pedal's box (0 inside it).
        const d = Math.hypot(Math.max(b.left - p[0], 0, p[0] - b.right), Math.max(b.top - p[1], 0, p[1] - b.bottom));
        if (d <= best) [over, best] = [item.id, d];
      }
      setState((s) => (s.over === over && s.at?.[0] === p[0] && s.at?.[1] === p[1] ? s : { over, at: p }));
    };
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, [items]);
  return state;
}

/**
 * The Cables tool's handles, drawn above the pedals. Hovering a pedal shows its plugs and a + at each guessed jack
 * without one (the plug editor's same guesses). Click one to start a cable, which then follows the pointer; click
 * another to connect them. Plugs are added at + ends only once the cable is made.
 */
export function CableHandles({ items, zoom }: { items: Item[]; zoom: number }) {
  const start = useCablePick((p) => p.plug);
  const style = useCablePick((p) => p.style);
  const [hover, setHover] = useState<string | null>(null);
  const hints = useJackHints(items);
  const pointer = usePointer(items);
  const r = HANDLE_PX / 2 / zoom;
  const box = (at: Pt) => ({ left: at[0] * PX_PER_INCH - r * 1.6, top: at[1] * PX_PER_INCH - r * 1.6, width: r * 3.2, height: r * 3.2 });
  // The hovered pedal shows its points, and so does the pedal the cable starts from.
  // Plugs with a cable, either end, by cableId.
  // Plugs with a cable, either end, by cableId, to the cable's id.
  const cableOf = useMemo(() => new Map(boardCables(items).flatMap((c) => [[cableId(c.from), c.id] as const, [cableId(c.to), c.id] as const])), [items]);
  const connected = cableOf;
  // A picked pedal shows only its own points (and the start's); otherwise the hovered pedal does.
  const focus = useFocusPedal(items);
  const shown = new Set([focus ?? pointer.over, start?.item].filter(Boolean) as string[]);
  // How far inside the edge the start points sit, in inches: their centers just in from it.
  const inset = (r * 0.5) / PX_PER_INCH;
  const cableSel = useCablePick((p) => p.cable);
  const cableHover = useCablePick((p) => p.hover);
  const setCableHover = (id: string | null) => useCablePick.getState().set({ hover: id });
  // The edge plus: a + on the hovered pedal's edge right by the pointer, for a jack anywhere along it. It stays out of
  // the way of the plugs and +s already there.
  const overItem = pointer.over && (!focus || pointer.over === focus) ? items.find((i) => i.id === pointer.over) : undefined;
  // Cables and plugs come first: near one, the pointer is for it, not for a new jack.
  const onOther =
    !!pointer.at &&
    (distToRoutes(routesFor(items), pointer.at) < CABLE_ROOM ||
      items.some((i) => i.kind === "pedal" && (i.plugs ?? []).some((p) => inBox(growBox(plugHead(i, p), PLUG_ROOM), pointer.at!))));
  const near = overItem && pointer.at && !onOther ? nearestEdge(overItem, pointer.at) : null;
  const taken =
    overItem &&
    near &&
    [...(overItem.plugs ?? []), ...openHints(hints[overItem.id] ?? [], overItem.plugs ?? [])].some(
      (p) => p.side === near.side && Math.abs(p.at - near.at) < EDGE_ROOM,
    );
  const edge = overItem && near && !taken ? { item: overItem, ...near } : null;
  // Whether the hovered target starts or ends a cable (a plugged-in jack's plug picks it instead, so no label).
  const startKey = start ? (isPlugEnd(start) ? cableId(start) : `${start.item}+${start.side}${start.at}`) : null;
  const startable = !!hover && hover !== startKey && !(connected.has(hover) && !start);
  const from = start ? endAnchor(items, start) : null;
  // The cable being run: one corner from the plug to the pointer, in the type's style.
  let preview: string | null = null;
  if (from && pointer.at) {
    // One corner from the plug's end, first along the plug unless that heads back into the jack.
    const [fx, fy] = from.at;
    const back = from.dir[0] !== 0 ? Math.sign(pointer.at[0] - fx) === -from.dir[0] : Math.sign(pointer.at[1] - fy) === -from.dir[1];
    const alongX = (from.dir[0] !== 0) !== back;
    const corner: Pt = alongX ? [pointer.at[0], fy] : [fx, pointer.at[1]];
    preview = roundedPath(corners([from.at, corner, pointer.at]), CORNER);
  }
  return (
    <>
      {preview && (
        <svg aria-hidden className="pointer-events-none absolute left-0 top-0 overflow-visible" width={1} height={1}>
          <g transform={`scale(${PX_PER_INCH})`} opacity={0.85}>
            <CableLine d={preview} kind={style.kind} />
          </g>
        </svg>
      )}
      {items.flatMap((item) => {
        if (item.kind !== "pedal" || !shown.has(item.id)) return [];
        const plugs = item.plugs ?? [];
        // Start points sit on the pedal's edge, just inside it, so they rarely land on a cable. They show an Out arrow
        // for starting a cable and an In arrow while one is being run to them.
        const arrow = start ? "in" : "out";
        const dots = plugs.map((p) => {
          const end: PlugEnd = { item: item.id, plug: p.id };
          const key = `${item.id}:${p.id}`;
          const on = !!start && sameWireEnd(start, end);
          const wired = connected.has(cableId(end));
          if (wired && !start) {
            // A plugged-in jack: the plug itself takes the click, to pick its cable.
            const b = growBox(plugHead(item, p), PLUG_ROOM);
            // A cable and its plugs light up together, whichever of them is hovered or picked.
            const its = cableOf.get(cableId(end))!;
            const lit = its === cableSel || its === cableHover;
            return (
              <button
                key={key}
                type="button"
                aria-label="Select this cable"
                className="absolute cursor-pointer outline-none"
                style={{
                  left: b.left * PX_PER_INCH,
                  top: b.top * PX_PER_INCH,
                  width: (b.right - b.left) * PX_PER_INCH,
                  height: (b.bottom - b.top) * PX_PER_INCH,
                }}
                onPointerEnter={() => {
                  setHover(key);
                  setCableHover(its);
                }}
                onPointerLeave={() => {
                  setHover((h) => (h === key ? null : h));
                  if (useCablePick.getState().hover === its) setCableHover(null);
                }}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => pickJack(end, plugMiddle(item, p))}
              >
                {lit && <PlugHalo box={plugHead(item, p)} origin={b} />}
              </button>
            );
          }
          // The plug's head (and a little around it) takes the click, with its arrow on the plug itself.
          const hb = growBox(plugHead(item, p), PLUG_ROOM);
          return (
            <button
              key={key}
              type="button"
              aria-label={wired ? "Connect here instead" : start ? "Connect to this plug" : "Start a cable from this plug"}
              className="absolute flex cursor-pointer items-center justify-center outline-none"
              style={{ left: hb.left * PX_PER_INCH, top: hb.top * PX_PER_INCH, width: (hb.right - hb.left) * PX_PER_INCH, height: (hb.bottom - hb.top) * PX_PER_INCH }}
              onPointerEnter={() => setHover(key)}
              onPointerLeave={() => setHover((h) => (h === key ? null : h))}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => pickEnd(end)}
            >
              <ArrowFace r={r} zoom={zoom} on={on} big={on || hover === key} dir={outDir(item, p.side)} way={on ? "out" : arrow} />
            </button>
          );
        });
        const plusses = openHints(hints[item.id] ?? [], plugs).map((h) => {
          const end = { item: item.id, side: h.side, at: h.at };
          const key = `${item.id}+${h.side}${h.at}`;
          const on = !!start && sameWireEnd(start, end);
          return (
            <button
              key={key}
              type="button"
              aria-label={start ? "Connect here" : "Start a cable here"}
              className="absolute grid place-items-center rounded-full outline-none"
              style={box(edgeSpot(item, h.side, h.at, -inset))}
              onPointerEnter={() => setHover(key)}
              onPointerLeave={() => setHover((x) => (x === key ? null : x))}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => pickEnd(end)}
            >
              <ArrowFace r={r} zoom={zoom} on={on} big={on || hover === key} dir={outDir(item, h.side)} way={on ? "out" : arrow} />
            </button>
          );
        });
        return [...dots, ...plusses];
      })}
      {/* The picked or hovered cable's plugs light up with it, also on pedals not showing their points. */}
      {boardCables(items)
        .filter((c) => c.id === cableSel || c.id === cableHover)
        .flatMap((c) => [c.from, c.to])
        .filter((end) => !(shown.has(end.item) && !start))
        .map((end) => {
          const item = items.find((i) => i.id === end.item);
          const p = item?.plugs?.find((x) => x.id === end.plug);
          if (!item || !p) return null;
          const head = plugHead(item, p);
          return (
            <span key={`lit:${cableId(end)}`} className="pointer-events-none absolute" style={{ left: head.left * PX_PER_INCH, top: head.top * PX_PER_INCH }}>
              <PlugHalo box={head} origin={head} />
            </span>
          );
        })}
      {pointer.at && (startable || (edge && !hover)) && (
        // Says what a click does here, beside the pointer.
        <span
          aria-hidden
          className="pointer-events-none absolute whitespace-nowrap rounded-full bg-ink px-2 py-0.5 font-semibold text-surface shadow-float"
          style={{
            left: pointer.at[0] * PX_PER_INCH + 14 / zoom,
            top: pointer.at[1] * PX_PER_INCH + 14 / zoom,
            fontSize: 12 / zoom,
            lineHeight: `${18 / zoom}px`,
            paddingInline: 8 / zoom,
            paddingBlock: 1 / zoom,
          }}
        >
          {start ? "End cable here" : "Start cable here"}
        </span>
      )}
      {edge && !hover && (
        <EdgePlus
          at={edgeSpot(edge.item, edge.side, edge.at, -inset)}
          pointer={pointer.at!}
          r={r}
          zoom={zoom}
          dir={outDir(edge.item, edge.side)}
          way={start ? "in" : "out"}
          onPick={() => pickEnd({ item: edge.item.id, side: edge.side, at: edge.at })}
        />
      )}
    </>
  );
}

/**
 * Signal Flow's menu at the top center: the cable type and plug, for the picked cable or for the cables made next,
 * Reset Path and Delete for the picked cable, and under it a hint and Done. Phones have it at the bottom, above the
 * toolbar.
 */
export function CablePanel() {
  const open = useUi((u) => u.cablesOpen);
  const setOpen = useUi((u) => u.setCablesOpen);
  const { plug, cable, style, set } = useCablePick();
  const items = usePlayground((s) => s.items);
  const picked = useMemo(() => (cable ? boardCables(items).find((c) => c.id === cable) : undefined), [items, cable]);

  useEffect(() => {
    if (!open) set({ plug: null, cable: null });
    else usePlayground.getState().clearSelection();
  }, [open, set]);
  // A picked cable that's gone (undone away, or its pedal deleted) is no longer picked.
  useEffect(() => {
    if (cable && !picked) set({ cable: null });
  }, [cable, picked, set]);

  const remove = () => {
    if (!picked) return;
    usePlayground.getState().unplug([picked.stored]);
    set({ cable: null, at: null });
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input, textarea, select")) return;
      // The canvas's shortcuts are off in this tool, so undo and redo are handled here.
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        set({ plug: null });
        if (e.shiftKey) usePlayground.getState().redo();
        else usePlayground.getState().undo();
        return;
      }
      if (e.key === "Escape") {
        if (plug || cable) set({ plug: null, cable: null });
        else setOpen(false);
      }
      const d = e.key.toLowerCase() === "d" && !e.metaKey && !e.ctrlKey && !e.altKey;
      if ((e.key === "Delete" || e.key === "Backspace" || d) && picked) {
        e.preventDefault();
        e.stopPropagation();
        remove();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  if (!open) return null;
  const kind = picked?.kind ?? style.kind;
  const plugOf = (end: PlugEnd) => items.find((i) => i.id === end.item)?.plugs?.find((p) => p.id === end.plug);
  const allowed = cableKindInfo(kind).plugs;
  const plugType = picked ? knownType(plugOf(picked.from)?.type ?? allowed[0]) : style.plug && allowed.includes(style.plug) ? style.plug : allowed[0];
  const setKind = (k: CableKind) => {
    set({ style: { kind: k } });
    if (picked) usePlayground.getState().editCable(picked.stored, { kind: k });
  };
  // One plug for both ends.
  const setPlug = (t: PlugType) => {
    set({ style: { ...style, kind, plug: t } });
    if (picked) usePlayground.getState().editCable(picked.stored, { split: false, plug: { end: picked.from, type: t } });
  };
  return (
    <div
      className="animate-enter absolute left-1/2 z-20 flex w-max max-w-[calc(100%-24px)] -translate-x-1/2 flex-col items-center gap-2 max-sm:bottom-[calc(74px+env(safe-area-inset-bottom))] max-sm:flex-col-reverse sm:top-4"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div role="toolbar" aria-label="Signal Flow" className={`flex max-w-full items-center gap-3 overflow-x-auto pl-3 ${barPanel}`}>
      <LabeledSelect<CableKind> label="Cable Type" value={kind} options={CABLE_KINDS.map((k) => [k.kind, k.label] as const)} onChange={setKind} />
      <LabeledSelect<PlugType> label="Plug" value={plugType} options={allowed.map((t) => [t, PLUG_TYPES[t].label] as const)} onChange={setPlug} />
      <span className={barDivider} />
      <button type="button" disabled={!picked?.legs} onClick={() => picked && usePlayground.getState().setCableLegs(picked.stored, null)} className={`${barSoftButton} disabled:opacity-40`}>
        Reset Path
      </button>
      <button type="button" disabled={!picked} onClick={remove} className={`${barSoftDangerButton} disabled:opacity-40`}>
        <Trash2 size={14} />
        Delete
      </button>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-[13px] font-medium text-ink">{plug ? "Click on a Plus icon to end the cable" : "Click on a Plus icon on any pedal to start a cable"}</span>
        <button
          type="button"
          onClick={withTool("cables_done", "panel", () => setOpen(false))}
          className="btn-primary flex h-9 items-center rounded-control px-3 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          Done
        </button>
      </div>
    </div>
  );
}

/**
 * The start point that follows the pointer along a hovered pedal's edge, so it's clear where a click puts the jack.
 * The click target sits under the pointer (which may be just inside the pedal); the arrow itself sits on the edge.
 */
function EdgePlus({ at, pointer, r, zoom, dir, way, onPick }: { at: Pt; pointer: Pt; r: number; zoom: number; dir: Pt; way: "in" | "out"; onPick: () => void }) {
  const hit = 28 / zoom;
  return (
    <>
      <span aria-hidden className="pointer-events-none absolute grid place-items-center" style={{ left: at[0] * PX_PER_INCH - r * 1.1, top: at[1] * PX_PER_INCH - r * 1.1 }}>
        <ArrowFace r={r} zoom={zoom} on big={false} dir={dir} way={way} />
      </span>
      <button
        type="button"
        aria-label={way === "in" ? "Connect at this spot" : "Start a cable at this spot"}
        className="absolute cursor-pointer rounded-full outline-none"
        style={{ left: pointer[0] * PX_PER_INCH - hit / 2, top: pointer[1] * PX_PER_INCH - hit / 2, width: hit, height: hit }}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={onPick}
      />
    </>
  );
}

const plugRect = plugHead;

type InchBox = { left: number; top: number; right: number; bottom: number };
/**
 * The halo around a hovered or picked plug, hugging its head like the gear's selection halo: a white line to part it
 * from the pedal, then a brand line. `origin` is the box of the element it's drawn in.
 */
function PlugHalo({ box, origin }: { box: InchBox; origin: InchBox }) {
  const s = PX_PER_INCH;
  const zoom = usePlayground((st) => st.view.zoom);
  const white = HALO_WHITE / zoom;
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute"
      style={{
        left: (box.left - origin.left) * s,
        top: (box.top - origin.top) * s,
        width: (box.right - box.left) * s,
        height: (box.bottom - box.top) * s,
        borderRadius: 3 / zoom,
        boxShadow: `0 0 0 ${white}px #fff, 0 0 0 ${white + HALO_LINE / zoom}px var(--color-brand)`,
      }}
    />
  );
}

/**
 * A pedal's plugs as click targets on the board (outside the tools). A plug and its cable are one unit: hovering or
 * clicking the plug lights and picks its cable, with the plugs at both ends.
 */
export function PlugTargets({ item }: { item: Item }) {
  const chosen = useCablePick((p) => p.chosen);
  const cableHover = useCablePick((p) => p.hover);
  const items = usePlayground((s) => s.items);
  const [hover, setHover] = useState<string | null>(null);
  if (!SHOW_CABLES) return null;
  const s = PX_PER_INCH;
  const cableOf = cableOfPlugs(items);
  const pickedCable = chosen && "cable" in chosen ? chosen.cable : null;
  return (
    <>
      {(item.plugs ?? []).map((p) => {
        const end = { item: item.id, plug: p.id };
        const r = plugRect(item, p);
        const its = cableOf.get(cableId(end));
        const on = its ? its === pickedCable : !!chosen && "plug" in chosen && sameEnd(chosen.plug, end);
        const lit = on || hover === p.id || (!!its && its === cableHover);
        return (
          <button
            key={p.id}
            type="button"
            aria-label={its ? "Cable" : "Plug"}
            className="absolute cursor-pointer outline-none"
            style={{ left: r.left * s, top: r.top * s, width: (r.right - r.left) * s, height: (r.bottom - r.top) * s }}
            onPointerEnter={() => (its ? useCablePick.getState().set({ hover: its }) : setHover(p.id))}
            onPointerLeave={() => {
              setHover((h) => (h === p.id ? null : h));
              if (its && useCablePick.getState().hover === its) useCablePick.getState().set({ hover: null });
            }}
            onPointerDown={(e) => {
              e.stopPropagation();
              const at = plugMiddle(item, p);
              choose(its ? { cable: its, at } : { plug: end, at });
            }}
          >
            {lit && <PlugHalo box={r} origin={r} />}
          </button>
        );
      })}
    </>
  );
}

const MINI_GAP = 12;
/** Icon buttons, as in the selection's mini menu: bigger on touch screens. */
const miniButton =
  "press grid size-8 place-items-center rounded-control outline-none focus-visible:ring-2 focus-visible:ring-brand pointer-coarse:size-11 [&_svg]:size-4 pointer-coarse:[&_svg]:size-[21px]";
/** A text button the same height as the icon buttons. */
const miniText =
  "press flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-control px-2.5 text-[13px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-brand pointer-coarse:h-11 pointer-coarse:px-3.5";

/**
 * The little menu for a picked cable, like the one under picked gear, opened just below where the cable was clicked.
 * On the board: Edit Cables (opens Signal Flow with it picked) and Delete. In Signal Flow: Reset Path and Delete.
 */
export function CableMiniMenu() {
  const open = useUi((u) => u.cablesOpen);
  const chosen = useCablePick((p) => p.chosen);
  const toolCable = useCablePick((p) => p.cable);
  const toolAt = useCablePick((p) => p.at);
  const running = useCablePick((p) => !!p.plug);
  const moving = useCablePick((p) => p.moving);
  const items = usePlayground((s) => s.items);
  const view = usePlayground((s) => s.view);
  const viewport = usePlayground((s) => s.viewport);
  const coverLeft = usePlayground((s) => s.coverLeft);
  const dragging = useUi((u) => u.dragging);
  const picked = useMemo(() => (open && toolCable ? boardCables(items).find((c) => c.id === toolCable) : undefined), [open, toolCable, items]);
  // Undo can take a picked cable or plug away: then it's no longer picked.
  const gone = useMemo(() => !!chosen && !open && !(("cable" in chosen ? chosenCable(items, chosen) : items.find((i) => i.id === chosen.plug.item)?.plugs?.some((p) => p.id === chosen.plug.plug))), [chosen, open, items]);
  useEffect(() => {
    if (gone) useCablePick.getState().set({ chosen: null });
  }, [gone]);
  const at = open ? (picked && !running ? toolAt : null) : chosen && !gone ? chosen.at : null;
  if (!at || dragging || moving || !viewport.w) return null;
  const k = view.zoom * PX_PER_INCH;
  const touch = typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches;
  const H = (touch ? 44 : 32) + 12;
  const halfW = 80;
  const px = view.x + at[0] * k;
  const py = view.y + at[1] * k;
  const cx = Math.min(Math.max(px, coverLeft + halfW + 8), viewport.w - halfW - 8);
  const below = py + MINI_GAP;
  const y = below + H > viewport.h - (touch ? 84 : 8) ? Math.max(8, py - MINI_GAP - H) : below;
  const loose = !open && !!chosen && "plug" in chosen;
  const removeTool = () => {
    if (!picked) return;
    usePlayground.getState().unplug([picked.stored]);
    useCablePick.getState().set({ cable: null, at: null });
  };
  return (
    <div
      role="toolbar"
      aria-label={loose ? "Selected plug" : "Selected cable"}
      className="absolute z-10 flex -translate-x-1/2 items-center gap-0.5 rounded-panel bg-surface p-1.5 shadow-float"
      style={{ left: cx, top: y }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {open ? (
        <button
          type="button"
          disabled={!picked?.legs}
          onClick={withTool("cable_reset", "mini_menu", () => picked && usePlayground.getState().setCableLegs(picked.stored, null))}
          className={`${miniText} ${barIconIdle} disabled:pointer-events-none disabled:opacity-40`}
        >
          Reset Path
        </button>
      ) : (
        !loose && (
          <button type="button" onClick={withTool("cable_edit", "mini_menu", editChosen)} className={`${miniText} ${barIconIdle}`}>
            <Cable size={16} />
            Edit Cables
          </button>
        )
      )}
      <button
        type="button"
        aria-label={loose ? "Delete Plug" : "Delete Cable"}
        {...tip("Delete", { shortcut: "Delete", side: "bottom" })}
        onClick={withTool("cable_delete", "mini_menu", open ? removeTool : deleteChosen)}
        className={`${miniButton} text-danger hover:bg-danger/10`}
      >
        <Trash2 size={16} />
      </button>
    </div>
  );
}

/** The way out of a pedal's side, in world terms (turned and flipped with the pedal). */
function outDir(item: Item, side: PlugSide): Pt {
  return plugAnchor(item, { id: "", side, at: 0, type: defaultPlugFor(undefined) }).dir;
}

/**
 * A round start point in Signal Flow: an arrow out of the pedal where a cable can start, or into it where a cable
 * being run can plug in. Brand filled where the cable being run starts.
 */
function ArrowFace({ r, zoom, on, big, dir, way }: { r: number; zoom: number; on: boolean; big: boolean; dir: Pt; way: "in" | "out" }) {
  const angle = (Math.atan2(dir[0], -dir[1]) * 180) / Math.PI + (way === "in" ? 180 : 0);
  return (
    <span
      className="grid place-items-center rounded-full transition-transform"
      style={{
        width: r * 2.2,
        height: r * 2.2,
        background: on ? "var(--color-brand)" : "#fff",
        color: on ? "#fff" : "var(--color-brand)",
        border: `${1.5 / zoom}px solid var(--color-brand)`,
        boxShadow: on ? `0 0 0 ${3 / zoom}px color-mix(in srgb, var(--color-brand) 35%, transparent)` : "0 1px 3px rgb(0 0 0 / 0.3)",
        transform: big ? "scale(1.25)" : undefined,
      }}
    >
      <ArrowUp size={r * 1.6} strokeWidth={3} style={{ transform: `rotate(${angle}deg)` }} />
    </span>
  );
}
