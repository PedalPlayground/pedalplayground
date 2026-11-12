import { useEffect, useMemo, useState } from "react";
import { create } from "zustand";
import { cableEnd, plugAnchor, plugHead, roundedPath, toLocal } from "../lib/cableRoute";
import {
  boardCables,
  CABLE_COLOR_PRESETS,
  CABLE_KINDS,
  cableId,
  cableKindInfo,
  isPlugEnd,
  sameEnd,
  corners,
  DEFAULT_CABLE_COLOR,
  defaultPlugFor,
  moveLeg,
  routeBoardCables,
  toManual,
  type BoardCable,
  type CableEdit,
  type CableStyle,
  type RoutedCable,
  type WireEnd,
} from "../lib/cables";
import { ArrowUp, Link2, Link2Off, Pencil, Trash2, Unplug } from "lucide-react";
import { canvasImageUrl } from "../lib/catalog";
import { findJacks, type JackHint } from "../lib/jackFinder";
import { useCatalog } from "../store/catalog";
import { ColorSwatches } from "./CustomItemForm";
import { LabeledSelect } from "./LabeledSelect";
import { openHints, withMiddles } from "./PlugEditor";
import type { CableKind } from "../lib/plugs";
import type { Pt } from "../lib/cableRoute";
import { itemBounds, PX_PER_INCH } from "../lib/geometry";
import type { PlugEnd } from "../lib/plugs";
import type { Item } from "../lib/types";
import { usePlayground } from "../store/playground";
import { SHOW_CABLES, useUi } from "../store/ui";
import { withTool } from "../lib/analytics";
import { barIconActive, barIconIdle, barPanel } from "./toolbarStyles";
import { tip } from "./Tooltip";
import { jacksFor } from "../lib/jacks";
import { knownType, plugBox, PLUG_TYPES, snapAt, type PlugSide, type PlugType } from "../lib/plugs";

/** Audio cable width: 5px at 100% zoom, in inches, so it scales with the board like the gear does. */
const WIDTH = 5 / PX_PER_INCH;
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

/**
 * One cable's line in its type's style: solid, double (two thin lines, cut with a mask so the board shows between
 * them), beaded (dotted), dash-dot or dashed. Dashes are in cable widths, so they keep their look at any zoom.
 */
function CableLine({ id, d, kind, color }: { id: string; d: string; kind: CableKind; color: string }) {
  const { line, width } = cableKindInfo(kind);
  const w = WIDTH * width;
  const common = { d, fill: "none", stroke: color, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (line === "double") {
    // Two lines, each 4/10 of the width, with the board showing through the gap between them.
    const mask = `cable-gap-${id.replace(/[^a-z0-9-]/gi, "")}`;
    return (
      <>
        <mask id={mask} maskUnits="userSpaceOnUse" x={-1e4} y={-1e4} width={2e4} height={2e4}>
          <path d={d} fill="none" stroke="#fff" strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" />
          <path d={d} fill="none" stroke="#000" strokeWidth={w * 0.2} strokeLinecap="round" strokeLinejoin="round" />
        </mask>
        <path {...common} strokeWidth={w} mask={`url(#${mask})`} />
      </>
    );
  }
  if (line === "dotted") {
    // Beads on a string: a thin core line with full-width dots along it, so it reads as one cable, not a trail of dots.
    return (
      <>
        <path {...common} strokeWidth={w * 0.35} />
        <path {...common} strokeWidth={w} strokeDasharray={`0 ${w * 1.5}`} />
      </>
    );
  }
  const dash = line === "dashdot" ? `${w * 2} ${w * 1.1} 0 ${w * 1.1}` : line === "dashed" ? `${w * 1.8} ${w * 1.1}` : undefined;
  return <path {...common} strokeWidth={w} strokeDasharray={dash} />;
}

/** A cable or plug picked on the board outside the Signal Flow tool (it gets the little Edit / Delete menu). */
export type Chosen = { cable: string } | { plug: PlugEnd };

/** What's picked in the Cables tool: a plug waiting for its other end, or a cable. */
type CablePick = {
  /** Picked on the board outside the tool. */
  chosen: Chosen | null;
  /** A plugged-in jack picked in the tool, to change its plug. */
  jack: PlugEnd | null;
  /** The end a cable is being run from (it follows the pointer until a second click). */
  plug: WireEnd | null;
  cable: string | null;
  /** What new cables get: the last type and color picked, like new plugs follow the last plug type. */
  style: Required<CableStyle>;
};
export const useCablePick = create<CablePick & { set: (p: Partial<CablePick>) => void }>((set) => ({
  chosen: null,
  jack: null,
  plug: null,
  cable: null,
  style: { kind: "mono", color: DEFAULT_CABLE_COLOR },
  set: (p) => set(p),
}));

// Picking gear lets go of a picked cable or plug.
usePlayground.subscribe((s, prev) => {
  if (s.selected !== prev.selected && s.selected.length && useCablePick.getState().chosen) useCablePick.getState().set({ chosen: null });
});

/** Picks a cable or plug on the board (outside the tool), in place of any gear. */
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

/** Delete on a picked cable or plug: a cable is unplugged, a plug comes off its pedal with its cable. */
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

/** Edit on a picked cable or plug: opens Signal Flow with that cable, or that jack (to change its plug), picked. */
function editChosen() {
  const pick = useCablePick.getState();
  const c = pick.chosen;
  if (!c) return;
  useUi.getState().setCablesOpen(true);
  if ("cable" in c) pick.set({ chosen: null, cable: c.cable, plug: null, jack: null });
  else pick.set({ chosen: null, cable: null, plug: null, jack: c.plug });
}

/** The routes for this exact items array, worked out once and shared by the cables and their handles. */
let cache: { items: Item[]; routes: RoutedCable[] } | null = null;
function routesFor(items: Item[]) {
  if (cache?.items !== items) cache = { items, routes: routeBoardCables(items, { spacing: SPACING }) };
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
  useCablePick.getState().set({ cable: c.id, plug: null, jack: null });
  if (e.button !== 0) return;
  const canvas = e.currentTarget.closest("[data-canvas]");
  if (!canvas) return;
  const pts = corners(c.route.points);
  const start = worldAt(e, canvas);
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
    }
    const p = worldAt(ev, canvas);
    // Snap to 1/16 inch, like plugs, so runs line up neatly.
    const to = Math.round(((horizontal ? p[1] : p[0]) - grab) * 16) / 16;
    let next = moveLeg(pts, leg, to, 0.25, plugDirs);
    // Stored from the plug the cable lives on, which may be its far end.
    if (c.stored !== c.from) next = [...next].reverse();
    usePlayground.getState().setCableLegs(c.stored, toManual(next), false);
  };
  const end = () => {
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
  const pickable = useUi((u) => SHOW_CABLES && !u.cablesOpen && !u.plugEditing && !u.viewing);
  const routes = routesFor(items);
  const toolPick = useCablePick((p) => p.cable);
  const chosen = useCablePick((p) => p.chosen);
  const picked = open ? toolPick : chosen && "cable" in chosen ? chosen.cable : null;
  const [hover, setHover] = useState<string | null>(null);
  const zoom = usePlayground((st) => st.view.zoom);
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
              <CableLine id={c.id} d={d} kind={c.kind} color={c.color} />
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
                    choose({ cable: c.id });
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
  pick.set({ jack: null });
  if (!pick.plug) pick.set({ plug: end, cable: null });
  else if (sameWireEnd(pick.plug, end)) pick.set({ plug: null });
  else {
    const stored = usePlayground.getState().wire(pick.plug, end, pick.style);
    pick.set({ plug: null, cable: cableId(stored) });
  }
}

/** Picks a plugged-in jack in the tool, in place of a cable. */
function pickJack(end: PlugEnd) {
  usePlayground.getState().clearSelection();
  useCablePick.getState().set({ jack: end, cable: null, plug: null });
}

/**
 * Unplugs one end of a cable to move it: the cable comes out, and a new one in its type and color starts from its
 * other end and follows the pointer until it's plugged in somewhere (Esc drops it; undo puts the old one back).
 */
function liftEnd(end: PlugEnd) {
  const store = usePlayground.getState();
  const cable = boardCables(store.items).find((c) => sameEnd(c.from, end) || sameEnd(c.to, end));
  if (!cable) return;
  const other = sameEnd(cable.from, end) ? cable.to : cable.from;
  store.clearSelection();
  store.unplug([cable.stored]);
  const pick = useCablePick.getState();
  pick.set({ plug: other, cable: null, jack: null, style: { kind: cable.kind, color: cable.color } });
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
  const connected = useMemo(() => new Set(boardCables(items).flatMap((c) => [cableId(c.from), cableId(c.to)])), [items]);
  // A picked pedal shows only its own points (and the start's); otherwise the hovered pedal does.
  const focus = useFocusPedal(items);
  const shown = new Set([focus ?? pointer.over, start?.item].filter(Boolean) as string[]);
  // How far inside the edge the start points sit, in inches: their centers just in from it.
  const inset = (r * 0.5) / PX_PER_INCH;
  const jackSel = useCablePick((p) => p.jack);
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
            <CableLine id="preview" d={preview} kind={style.kind} color={style.color} />
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
            // A plugged-in jack: the plug itself takes the click, to pick it (and change its plug).
            const b = growBox(plugHead(item, p), PLUG_ROOM);
            const picked = !!jackSel && sameEnd(jackSel, end);
            const lit = hover === key || picked;
            return (
              <button
                key={key}
                type="button"
                aria-label="Select this jack"
                className="absolute cursor-pointer outline-none"
                style={{
                  left: b.left * PX_PER_INCH,
                  top: b.top * PX_PER_INCH,
                  width: (b.right - b.left) * PX_PER_INCH,
                  height: (b.bottom - b.top) * PX_PER_INCH,
                }}
                onPointerEnter={() => setHover(key)}
                onPointerLeave={() => setHover((h) => (h === key ? null : h))}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => pickJack(end)}
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
 * The panel while the Cables tool is open: a hint that follows what's picked, the cable's type and color (the picked
 * cable's, or what new cables get), Auto Route for a moved cable, Remove, and Done. It sits where the object menu
 * does, like the plug panel.
 */
export function CablePanel() {
  const open = useUi((u) => u.cablesOpen);
  const setOpen = useUi((u) => u.setCablesOpen);
  const { plug, cable, jack, style, set } = useCablePick();
  const anyPedals = usePlayground((s) => s.items.some((i) => i.kind === "pedal"));
  const items = usePlayground((s) => s.items);
  const picked = useMemo(() => (cable ? boardCables(items).find((c) => c.id === cable) : undefined), [items, cable]);

  useEffect(() => {
    if (!open) set({ plug: null, cable: null, jack: null });
    else usePlayground.getState().clearSelection();
  }, [open, set]);
  // A picked cable that's gone (undone away, or its pedal deleted) is no longer picked.
  useEffect(() => {
    if (cable && !picked) set({ cable: null });
  }, [cable, picked, set]);

  const remove = () => {
    if (!picked) return;
    usePlayground.getState().unplug([picked.stored]);
    set({ cable: null });
  };
  /** Sets the type or color: on the picked cable, and for the cables made next. */
  const restyle = (patch: Partial<Required<CableStyle>>) => {
    set({ style: { ...style, ...patch } });
    if (picked) usePlayground.getState().editCable(picked.stored, patch);
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
        if (plug || cable || jack) set({ plug: null, cable: null, jack: null });
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
  const color = picked?.color ?? style.color;
  const hint = !anyPedals
    ? "Add some pedals first."
    : plug
      ? "Click an arrow on another pedal to connect. Esc cancels."
      : picked
        ? "Drag a handle to move a run. Delete removes the cable."
        : jack
          ? "Change this jack's plug, or unplug it to move the cable."
          : "Hover a pedal and click an arrow to start a cable.";
  return (
    <div
      role="dialog"
      aria-label="Signal Flow"
      className={`animate-enter absolute left-1/2 z-20 flex w-max max-w-[calc(100%-24px)] -translate-x-1/2 flex-col gap-2 p-2 ${barPanel} max-sm:bottom-[calc(74px+env(safe-area-inset-bottom))] sm:top-4`}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-3 pl-1">
        <span className="text-[13px] font-medium">{hint}</span>
        {picked?.legs && (
          <button
            type="button"
            onClick={() => usePlayground.getState().setCableLegs(picked.stored, null)}
            className="flex h-9 items-center rounded-control px-3 text-sm font-semibold outline-none hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-brand"
          >
            Auto Route
          </button>
        )}
        {picked && (
          <button
            type="button"
            onClick={remove}
            className="flex h-9 items-center rounded-control px-3 text-sm font-semibold text-danger outline-none hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-brand"
          >
            Remove
          </button>
        )}
        <button
          type="button"
          onClick={withTool("cables_done", "panel", () => setOpen(false))}
          className="btn-primary ml-auto flex h-9 items-center gap-1 rounded-control px-3 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          Done
        </button>
      </div>
      {jack ? (
        <JackEdit end={jack} items={items} />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line px-1 pt-2">
            <LabeledSelect
              label={picked ? "Type" : "New Cables"}
              value={kind}
              options={CABLE_KINDS.map((k) => [k.kind, k.label] as const)}
              onChange={(k) => restyle({ kind: k })}
            />
          </div>
          {picked && <CableEnds cable={picked} items={items} />}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line px-1 pt-2">
            <ColorSwatches color={color} presets={CABLE_COLOR_PRESETS} onChange={(hex) => restyle({ color: hex })} />
          </div>
        </>
      )}
    </div>
  );
}

/**
 * A picked jack in the tool: its plug (the ones its cable's type comes with) and what the jack is, with Unplug to
 * move its cable and Remove Plug to take the plug off. A plug unlike the other end's sets the cable's ends apart.
 */
function JackEdit({ end, items }: { end: PlugEnd; items: Item[] }) {
  const item = items.find((i) => i.id === end.item);
  const plug = item?.plugs?.find((p) => p.id === end.plug);
  const cable = boardCables(items).find((c) => sameEnd(c.from, end) || sameEnd(c.to, end));
  useEffect(() => {
    if (!plug) useCablePick.getState().set({ jack: null });
  }, [plug]);
  if (!item || !plug) return null;
  const store = usePlayground.getState();
  const kind = cable?.kind ?? "other";
  const other = cable ? (sameEnd(cable.from, end) ? cable.to : cable.from) : null;
  const otherType = other ? items.find((i) => i.id === other.item)?.plugs?.find((p) => p.id === other.plug)?.type : undefined;
  const setType = (t: PlugType) => {
    if (cable) store.editCable(cable.stored, { plug: { end, type: t }, ...(t !== otherType ? { split: true } : {}) });
    else store.setPlugs(item.id, item.plugs!.map((p) => (p.id === plug.id ? { ...p, type: t } : p)));
  };
  const setJack = (id: string) => {
    if (cable) store.editCable(cable.stored, { jack: { end, id: id || null } });
    else
      store.setPlugs(
        item.id,
        item.plugs!.map((p) => {
          if (p.id !== plug.id) return p;
          const { jack: _, ...rest } = p;
          return id ? { ...rest, jack: id } : rest;
        }),
      );
  };
  const plugOptions = cableKindInfo(kind).plugs.map((t) => [t, PLUG_TYPES[t].label] as const);
  const jackOptions = [["", "Not set"] as const, ...jacksFor(kind).map((j) => [j.id, j.label, j.group] as const)];
  const button = "flex h-8 items-center rounded-control px-2.5 text-sm font-semibold outline-none hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-brand";
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line px-1 pt-2">
      <span className="max-w-40 truncate text-sm font-semibold">{item.label}</span>
      <LabeledSelect<PlugType> label="Plug" value={knownType(plug.type)} options={plugOptions} onChange={setType} />
      <LabeledSelect<string> label="Jack" value={plug.jack ?? ""} options={jackOptions} onChange={setJack} />
      <span className="ml-auto flex items-center">
        {cable && (
          <button type="button" onClick={() => liftEnd(end)} className={button}>
            <Unplug size={15} className="mr-1.5" />
            Unplug
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            store.removePlug(end);
            useCablePick.getState().set({ jack: null });
          }}
          className={`${button} text-danger`}
        >
          Remove Plug
        </button>
      </span>
    </div>
  );
}

/**
 * The picked cable's two ends, under its type: each end's jack label, and the plugs. The plugs are locked together
 * (one choice for both) until unlocked; the choices are the plugs the cable's type comes with.
 */
function CableEnds({ cable, items }: { cable: BoardCable; items: Item[] }) {
  const edit = (e: CableEdit) => usePlayground.getState().editCable(cable.stored, e);
  const plugOf = (end: PlugEnd) => items.find((i) => i.id === end.item)?.plugs?.find((p) => p.id === end.plug);
  const nameOf = (end: PlugEnd) => items.find((i) => i.id === end.item)?.label ?? "";
  const split = !!plugOf(cable.stored)?.link?.split;
  const plugOptions = cableKindInfo(cable.kind).plugs.map((t) => [t, PLUG_TYPES[t].label] as const);
  const jackOptions = [["", "Not set"] as const, ...jacksFor(cable.kind).map((j) => [j.id, j.label, j.group] as const)];
  const ends = [
    { title: "From", end: cable.from },
    { title: "To", end: cable.to },
  ];
  const fromType = knownType(plugOf(cable.from)?.type ?? "sp400");
  return (
    <div className="flex flex-col gap-1.5 border-t border-line px-1 pt-2">
      <div className="flex items-center gap-2">
        {!split && <LabeledSelect<PlugType> label="Plugs" value={fromType} options={plugOptions} onChange={(t) => edit({ plug: { end: cable.from, type: t } })} />}
        {split && <span className="text-sm font-semibold">Plugs:</span>}
        <button
          type="button"
          aria-pressed={!split}
          aria-label={split ? "Use the same plug on both ends" : "Pick each end's plug"}
          {...tip(split ? "Same Plug on Both Ends" : "Pick Each End's Plug", { side: "bottom" })}
          onClick={() => edit({ split: !split })}
          className={`press grid size-7 place-items-center rounded-control outline-none focus-visible:ring-2 focus-visible:ring-brand ${split ? barIconIdle : barIconActive}`}
        >
          {split ? <Link2Off size={15} /> : <Link2 size={15} />}
        </button>
      </div>
      <div className="flex flex-col gap-1">
        {ends.map(({ title, end }) => {
          const plug = plugOf(end);
          return (
            <div key={title} className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="flex w-28 min-w-0 items-baseline gap-2">
                <span className="w-9 shrink-0 text-xs font-semibold uppercase tracking-wide text-ink-muted">{title}</span>
                <span className="truncate text-sm">{nameOf(end)}</span>
              </span>
              <LabeledSelect<string>
                label="Jack"
                value={plug?.jack ?? ""}
                options={jackOptions}
                onChange={(id) => edit({ jack: { end, id: id || null } })}
              />
              {split && (
                <LabeledSelect<PlugType>
                  label="Plug"
                  value={knownType(plug?.type ?? "sp400")}
                  options={plugOptions}
                  onChange={(t) => edit({ plug: { end, type: t } })}
                />
              )}
            </div>
          );
        })}
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

/** A pedal's plugs as click targets on the board (outside the tools): a click picks the plug. Shows hover and pick. */
export function PlugTargets({ item }: { item: Item }) {
  const chosen = useCablePick((p) => p.chosen);
  const [hover, setHover] = useState<string | null>(null);
  if (!SHOW_CABLES) return null;
  const s = PX_PER_INCH;
  return (
    <>
      {(item.plugs ?? []).map((p) => {
        const r = plugRect(item, p);
        const on = !!chosen && "plug" in chosen && sameEnd(chosen.plug, { item: item.id, plug: p.id });
        const lit = on || hover === p.id;
        return (
          <button
            key={p.id}
            type="button"
            aria-label="Plug"
            className="absolute cursor-pointer outline-none"
            style={{ left: r.left * s, top: r.top * s, width: (r.right - r.left) * s, height: (r.bottom - r.top) * s }}
            onPointerEnter={() => setHover(p.id)}
            onPointerLeave={() => setHover((h) => (h === p.id ? null : h))}
            onPointerDown={(e) => {
              e.stopPropagation();
              choose({ plug: { item: item.id, plug: p.id } });
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

/** The little menu under a cable or plug picked on the board, like the one under picked gear: Edit and Delete. */
export function ChosenMiniMenu() {
  const chosen = useCablePick((p) => p.chosen);
  const items = usePlayground((s) => s.items);
  const view = usePlayground((s) => s.view);
  const viewport = usePlayground((s) => s.viewport);
  const coverLeft = usePlayground((s) => s.coverLeft);
  const dragging = useUi((u) => u.dragging);
  // Undo can take the cable or plug away: then there's nothing to show.
  const box = useMemo(() => {
    if (!chosen) return null;
    if ("cable" in chosen) {
      const c = routesFor(items).find((r) => r.id === chosen.cable);
      if (!c) return null;
      const xs = c.route.points.map((p) => p[0]);
      const ys = c.route.points.map((p) => p[1]);
      return { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) };
    }
    const item = items.find((i) => i.id === chosen.plug.item);
    const plug = item?.plugs?.find((p) => p.id === chosen.plug.plug);
    return item && plug ? plugRect(item, plug) : null;
  }, [chosen, items]);
  useEffect(() => {
    if (chosen && !box) useCablePick.getState().set({ chosen: null });
  }, [chosen, box]);
  if (!chosen || !box || dragging || !viewport.w) return null;
  const k = view.zoom * PX_PER_INCH;
  const touch = typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches;
  const size = touch ? 44 : 32;
  const H = size + 12;
  const halfW = (2 * size + 2 + 12) / 2;
  const left = view.x + box.left * k;
  const right = view.x + box.right * k;
  const top = view.y + box.top * k;
  const bottom = view.y + box.bottom * k;
  const cx = Math.min(Math.max((left + right) / 2, coverLeft + halfW + 8), viewport.w - halfW - 8);
  const below = bottom + MINI_GAP;
  const y = below + H > viewport.h - (touch ? 84 : 8) ? Math.max(8, top - MINI_GAP - H) : below;
  const what = "cable" in chosen ? "Cable" : "Plug";
  return (
    <div
      role="toolbar"
      aria-label={`Selected ${what.toLowerCase()}`}
      className="absolute z-10 flex -translate-x-1/2 items-center gap-0.5 rounded-panel bg-surface p-1.5 shadow-float"
      style={{ left: cx, top: y }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <button aria-label={`Edit ${what}`} {...tip("Edit", { side: "bottom" })} onClick={withTool("cable_edit", "mini_menu", editChosen)} className={`${miniButton} ${barIconIdle}`}>
        <Pencil size={15} />
      </button>
      <button
        aria-label={`Delete ${what}`}
        {...tip("Delete", { shortcut: "Delete", side: "bottom" })}
        onClick={withTool("cable_delete", "mini_menu", deleteChosen)}
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
