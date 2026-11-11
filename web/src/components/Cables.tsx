import { useEffect, useMemo, useState } from "react";
import { create } from "zustand";
import { plugAnchor, roundedPath } from "../lib/cableRoute";
import { corners, moveLeg, routeBoardCables, sameEnd, toManual, type RoutedCable } from "../lib/cables";
import type { Pt } from "../lib/cableRoute";
import { PX_PER_INCH } from "../lib/geometry";
import type { PlugEnd } from "../lib/plugs";
import type { Item } from "../lib/types";
import { usePlayground } from "../store/playground";
import { useUi } from "../store/ui";
import { withTool } from "../lib/analytics";
import { barPanel } from "./toolbarStyles";

/** Cable width: 5px at 100% zoom, in inches, so it scales with the board like the gear does. */
const WIDTH = 5 / PX_PER_INCH;
/** Hovered cables get a touch wider as well as lighter, so the one under the pointer is obvious. */
const HOVER_WIDTH = 6 / PX_PER_INCH;
/** How far from a cable a press still picks it, in inches (wide, so thin cables are easy to hit). */
const HIT_WIDTH = 0.45;
/** Corner rounding, in inches. */
const CORNER = 0.3;
/** Side-by-side spacing for cables sharing a run. */
const SPACING = 0.22;

const CABLE = "#3d7be0";
const CABLE_HOVER = "#7aa9f5";

/** What's picked in the Cables tool: a plug waiting for its other end, or a cable. */
export const useCablePick = create<{ plug: PlugEnd | null; cable: string | null; set: (p: Partial<{ plug: PlugEnd | null; cable: string | null }>) => void }>((set) => ({
  plug: null,
  cable: null,
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
              <path
                d={d}
                fill="none"
                stroke={picked === c.id && open ? "var(--color-brand)" : lit ? CABLE_HOVER : CABLE}
                strokeWidth={lit ? HOVER_WIDTH : WIDTH}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
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

/**
 * The Cables tool's handles: a dot at the end of every plug on every pedal. Click one, then another, to wire them.
 * Drawn above the pedals.
 */
export function CableHandles({ items, zoom }: { items: Item[]; zoom: number }) {
  const plug = useCablePick((p) => p.plug);
  const [hover, setHover] = useState<string | null>(null);
  const ends = items.flatMap((item) =>
    item.kind === "pedal" ? (item.plugs ?? []).map((p) => ({ end: { item: item.id, plug: p.id }, at: plugAnchor(item, p).at })) : [],
  );
  const wired = useMemo(() => {
    // A plug is wired when its own link or another plug's link points at it.
    const set = new Set<string>();
    for (const i of items) for (const p of i.plugs ?? []) if (p.link) set.add(`${i.id}:${p.id}`), set.add(`${p.link.item}:${p.link.plug}`);
    return set;
  }, [items]);
  const r = HANDLE_PX / 2 / zoom;
  return (
    <>
      {ends.map(({ end, at }) => {
        const key = `${end.item}:${end.plug}`;
        const on = !!plug && sameEnd(plug, end);
        const lit = on || hover === key;
        return (
          <button
            key={key}
            type="button"
            aria-label={wired.has(key) ? "Rewire this plug" : "Wire this plug"}
            className="absolute grid place-items-center rounded-full outline-none"
            style={{
              left: at[0] * PX_PER_INCH - r * 1.6,
              top: at[1] * PX_PER_INCH - r * 1.6,
              width: r * 3.2,
              height: r * 3.2,
            }}
            onPointerEnter={() => setHover(key)}
            onPointerLeave={() => setHover((h) => (h === key ? null : h))}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => {
              const pick = useCablePick.getState();
              if (!pick.plug) pick.set({ plug: end, cable: null });
              else if (sameEnd(pick.plug, end)) pick.set({ plug: null });
              else {
                usePlayground.getState().connectPlugs(pick.plug, end);
                pick.set({ plug: null, cable: `${pick.plug.item}:${pick.plug.plug}` });
              }
            }}
          >
            <span
              className="block rounded-full transition-transform"
              style={{
                width: r * 2,
                height: r * 2,
                background: on ? "var(--color-brand)" : wired.has(key) ? CABLE : "#fff",
                border: `${2 / zoom}px solid ${on ? "#fff" : "var(--color-brand)"}`,
                boxShadow: on ? `0 0 0 ${3 / zoom}px color-mix(in srgb, var(--color-brand) 35%, transparent)` : undefined,
                transform: lit ? "scale(1.25)" : undefined,
              }}
            />
          </button>
        );
      })}
    </>
  );
}

/**
 * The panel while the Cables tool is open: a hint that follows what's picked, Remove for a picked cable, and Done.
 * It sits where the object menu does, like the plug panel.
 */
export function CablePanel() {
  const open = useUi((u) => u.cablesOpen);
  const setOpen = useUi((u) => u.setCablesOpen);
  const { plug, cable, set } = useCablePick();
  const anyPlugs = usePlayground((s) => s.items.some((i) => i.kind === "pedal" && i.plugs?.length));
  // A picked cable that was moved by hand can go back to routing itself.
  const manual = usePlayground((s) => {
    if (!cable) return false;
    const [item, p] = cable.split(":");
    return !!s.items.find((i) => i.id === item)?.plugs?.find((x) => x.id === p)?.link?.legs;
  });

  useEffect(() => {
    if (!open) set({ plug: null, cable: null });
    else usePlayground.getState().clearSelection();
  }, [open, set]);

  const remove = () => {
    if (!cable) return;
    const [item, p] = cable.split(":");
    usePlayground.getState().unplug([{ item, plug: p }]);
    set({ cable: null });
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input, textarea")) return;
      if (e.key === "Escape") {
        if (plug || cable) set({ plug: null, cable: null });
        else setOpen(false);
      }
      const d = e.key.toLowerCase() === "d" && !e.metaKey && !e.ctrlKey && !e.altKey;
      if ((e.key === "Delete" || e.key === "Backspace" || d) && cable) {
        e.preventDefault();
        e.stopPropagation();
        remove();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  if (!open) return null;
  const hint = !anyPlugs
    ? "Add plugs to your pedals first (Plugs, or press P)."
    : plug
      ? "Now click the plug at the other end."
      : cable
        ? "Drag a handle to move a run. Delete removes the cable."
        : "Click a plug, then another, to run a cable.";
  return (
    <div
      role="dialog"
      aria-label="Cables"
      className={`animate-enter absolute left-1/2 z-20 flex w-max max-w-[calc(100%-24px)] -translate-x-1/2 flex-col p-2 ${barPanel} max-sm:bottom-[calc(74px+env(safe-area-inset-bottom))] sm:top-4`}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-3 pl-1">
        <span className="text-[13px] font-medium">{hint}</span>
        {manual && (
          <button
            type="button"
            onClick={() => {
              const [item, p] = cable!.split(":");
              usePlayground.getState().setCableLegs({ item, plug: p }, null);
            }}
            className="flex h-9 items-center rounded-control px-3 text-sm font-semibold outline-none hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-brand"
          >
            Auto Route
          </button>
        )}
        {cable && (
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
          className="btn-primary flex h-9 items-center gap-1 rounded-control px-3 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          Done
        </button>
      </div>
    </div>
  );
}
