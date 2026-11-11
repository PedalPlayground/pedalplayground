import { useEffect, useMemo, useState } from "react";
import { create } from "zustand";
import { plugAnchor, roundedPath } from "../lib/cableRoute";
import { routeBoardCables, sameEnd } from "../lib/cables";
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

/**
 * Every cable on the board, routed around the pedals. Drawn inside the zoomed layer, above pedalboards and below
 * pedals, so it reads as lying on the board. Only the Cables tool lets cables take the pointer.
 */
export function CableLayer({ items }: { items: Item[] }) {
  const open = useUi((u) => u.cablesOpen);
  const routes = useMemo(() => routeBoardCables(items, { spacing: SPACING }), [items]);
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
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    useCablePick.getState().set({ cable: c.id, plug: null });
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
        ? "Press Delete to remove this cable."
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
