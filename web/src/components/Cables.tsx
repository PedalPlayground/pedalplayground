import { useEffect, useMemo, useState } from "react";
import { create } from "zustand";
import { plugAnchor, roundedPath } from "../lib/cableRoute";
import {
  boardCables,
  CABLE_COLOR_PRESETS,
  CABLE_KINDS,
  cableId,
  cableKindInfo,
  isPlugEnd,
  corners,
  DEFAULT_CABLE_COLOR,
  moveLeg,
  routeBoardCables,
  toManual,
  type CableStyle,
  type RoutedCable,
  type WireEnd,
} from "../lib/cables";
import { Plus } from "lucide-react";
import { canvasImageUrl } from "../lib/catalog";
import { findJacks, type JackHint } from "../lib/jackFinder";
import { DEFAULT_PLUG } from "../lib/plugs";
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
import { useUi } from "../store/ui";
import { withTool } from "../lib/analytics";
import { barPanel } from "./toolbarStyles";

/** Cable width: 5px at 100% zoom, in inches, so it scales with the board like the gear does. */
const WIDTH = 5 / PX_PER_INCH;
/** How far from a cable a press still picks it, in inches (wide, so thin cables are easy to hit). */
const HIT_WIDTH = 0.45;
/** Corner rounding, in inches. */
const CORNER = 0.3;
/** Side-by-side spacing for cables sharing a run. */
const SPACING = 0.22;

/** The glow under a hovered or picked cable, in inches. */
const GLOW_WIDTH = 14 / PX_PER_INCH;

/**
 * One cable's line in its type's style: solid, double (two thin lines, cut with a mask so the board shows between
 * them), dotted, dash-dot or dashed. Dashes are in cable widths, so they keep their look at any zoom.
 */
function CableLine({ id, d, kind, color }: { id: string; d: string; kind: CableKind; color: string }) {
  const line = cableKindInfo(kind).line;
  const w = WIDTH;
  const common = { d, fill: "none", stroke: color, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (line === "double") {
    const mask = `cable-gap-${id.replace(/[^a-z0-9-]/gi, "")}`;
    return (
      <>
        <mask id={mask} maskUnits="userSpaceOnUse" x={-1e4} y={-1e4} width={2e4} height={2e4}>
          <path d={d} fill="none" stroke="#fff" strokeWidth={w * 1.4} strokeLinecap="round" strokeLinejoin="round" />
          <path d={d} fill="none" stroke="#000" strokeWidth={w * 0.5} strokeLinecap="round" strokeLinejoin="round" />
        </mask>
        <path {...common} strokeWidth={w * 1.4} mask={`url(#${mask})`} />
      </>
    );
  }
  const dash =
    line === "dotted" ? `0 ${w * 1.9}` : line === "dashdot" ? `${w * 2.6} ${w * 1.4} 0 ${w * 1.4}` : line === "dashed" ? `${w * 2.4} ${w * 1.6}` : undefined;
  return <path {...common} strokeWidth={line === "dotted" ? w * 1.15 : w} strokeDasharray={dash} />;
}

/** What's picked in the Cables tool: a plug waiting for its other end, or a cable. */
type CablePick = {
  /** The end a cable is being run from (it follows the pointer until a second click). */
  plug: WireEnd | null;
  cable: string | null;
  /** What new cables get: the last type and color picked, like new plugs follow the last plug type. */
  style: Required<CableStyle>;
};
export const useCablePick = create<CablePick & { set: (p: Partial<CablePick>) => void }>((set) => ({
  plug: null,
  cable: null,
  style: { kind: "mono", color: DEFAULT_CABLE_COLOR },
  set: (p) => set(p),
}));

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
  useCablePick.getState().set({ cable: c.id, plug: null });
  if (e.button !== 0) return;
  const canvas = e.currentTarget.closest("[data-canvas]");
  if (!canvas) return;
  const pts = corners(c.route.points);
  const start = worldAt(e, canvas);
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
    let next = moveLeg(pts, leg, to);
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
  const routes = routesFor(items);
  const picked = useCablePick((p) => p.cable);
  const [hover, setHover] = useState<string | null>(null);
  if (!routes.length) return null;
  const s = PX_PER_INCH;
  return (
    <svg aria-hidden className="pointer-events-none absolute left-0 top-0 overflow-visible" width={1} height={1}>
      <g transform={`scale(${s})`}>
        {routes.map((c) => {
          const d = roundedPath(c.route.points, CORNER);
          const lit = open && (hover === c.id || picked === c.id);
          return (
            <g key={c.id}>
              {/* Hover and pick show as a soft glow under the cable, so it works for every color and line style. */}
              {lit && (
                <path
                  d={d}
                  fill="none"
                  stroke="var(--color-brand)"
                  strokeOpacity={picked === c.id ? 0.55 : 0.35}
                  strokeWidth={GLOW_WIDTH}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}
              <CableLine id={c.id} d={d} kind={c.kind} color={c.color} />
              {open && (
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
                  onPointerDown={(e) => pressCable(e, c)}
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
      const done = (hints: JackHint[]) => live && setFound((f) => ({ ...f, [item.id]: withMiddles(hints, item.width, item.height) }));
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
  if (!pick.plug) pick.set({ plug: end, cable: null });
  else if (sameWireEnd(pick.plug, end)) pick.set({ plug: null });
  else {
    const stored = usePlayground.getState().wire(pick.plug, end, pick.style);
    pick.set({ plug: null, cable: cableId(stored) });
  }
}

/** Where a wire end's cable leaves the pedal, in world inches, and which way. */
function endAnchor(items: Item[], end: WireEnd) {
  const item = items.find((i) => i.id === end.item);
  if (!item) return null;
  const plug = isPlugEnd(end) ? item.plugs?.find((p) => p.id === end.plug) : { id: "", side: end.side, at: end.at, type: DEFAULT_PLUG };
  return plug ? plugAnchor(item, plug) : null;
}

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
  const shown = new Set([pointer.over, start?.item].filter(Boolean) as string[]);
  const from = start ? endAnchor(items, start) : null;
  // The cable being run: straight out of its jack, then one corner to the pointer, in the type's style.
  let preview: string | null = null;
  if (from && pointer.at) {
    const lead: Pt = [from.at[0] + from.dir[0] * 0.25, from.at[1] + from.dir[1] * 0.25];
    const corner: Pt = from.dir[0] !== 0 ? [pointer.at[0], lead[1]] : [lead[0], pointer.at[1]];
    preview = roundedPath(corners([from.at, lead, corner, pointer.at]), CORNER);
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
        const dots = plugs.map((p) => {
          const end: PlugEnd = { item: item.id, plug: p.id };
          const key = `${item.id}:${p.id}`;
          const on = !!start && sameWireEnd(start, end);
          return (
            <button
              key={key}
              type="button"
              aria-label={p.link ? "Rewire this plug" : "Wire this plug"}
              className="absolute grid place-items-center rounded-full outline-none"
              style={box(plugAnchor(item, p).at)}
              onPointerEnter={() => setHover(key)}
              onPointerLeave={() => setHover((h) => (h === key ? null : h))}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => pickEnd(end)}
            >
              <span
                className="block rounded-full transition-transform"
                style={{
                  width: r * 2,
                  height: r * 2,
                  background: on ? "var(--color-brand)" : "#fff",
                  border: `${2 / zoom}px solid ${on ? "#fff" : "var(--color-brand)"}`,
                  boxShadow: on ? `0 0 0 ${3 / zoom}px color-mix(in srgb, var(--color-brand) 35%, transparent)` : undefined,
                  transform: on || hover === key ? "scale(1.25)" : undefined,
                }}
              />
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
              aria-label="Add a plug here"
              className="absolute grid place-items-center rounded-full outline-none"
              style={box(endAnchor(items, end)!.at)}
              onPointerEnter={() => setHover(key)}
              onPointerLeave={() => setHover((x) => (x === key ? null : x))}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => pickEnd(end)}
            >
              <span
                className="grid place-items-center rounded-full transition-transform"
                style={{
                  width: r * 2.2,
                  height: r * 2.2,
                  background: on ? "var(--color-brand)" : "#fff",
                  color: on ? "#fff" : "var(--color-brand)",
                  border: `${1.5 / zoom}px solid var(--color-brand)`,
                  boxShadow: on ? `0 0 0 ${3 / zoom}px color-mix(in srgb, var(--color-brand) 35%, transparent)` : "0 1px 3px rgb(0 0 0 / 0.3)",
                  transform: on || hover === key ? "scale(1.25)" : undefined,
                }}
              >
                <Plus size={r * 1.6} strokeWidth={3} />
              </span>
            </button>
          );
        });
        return [...dots, ...plusses];
      })}
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
  const { plug, cable, style, set } = useCablePick();
  const anyPedals = usePlayground((s) => s.items.some((i) => i.kind === "pedal"));
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
    set({ cable: null });
  };
  /** Sets the type or color: on the picked cable, and for the cables made next. */
  const restyle = (patch: Partial<Required<CableStyle>>) => {
    set({ style: { ...style, ...patch } });
    if (picked) usePlayground.getState().setCableStyle(picked.stored, patch);
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
  const color = picked?.color ?? style.color;
  const hint = !anyPedals
    ? "Add some pedals first."
    : plug
      ? "Click a + or a plug on another pedal to connect. Esc cancels."
      : picked
        ? "Drag a handle to move a run. Delete removes the cable."
        : "Hover a pedal and click a + to start a cable.";
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
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line px-1 pt-2">
        <LabeledSelect
          label={picked ? "Type" : "New Cables"}
          value={kind}
          options={CABLE_KINDS.map((k) => [k.kind, k.label] as const)}
          onChange={(k) => restyle({ kind: k })}
        />
        <ColorSwatches color={color} presets={CABLE_COLOR_PRESETS} onChange={(hex) => restyle({ color: hex })} />
      </div>
    </div>
  );
}
