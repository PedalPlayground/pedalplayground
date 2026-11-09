import { ArrowLeftRight, Trash2 } from "lucide-react";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { create } from "zustand";
import { PX_PER_INCH } from "../lib/geometry";
import { newPlugId, PLUG_ORDER, PLUG_TYPES, SIDE_ANGLE, sideLength, snapAt, type Plug, type PlugSide, type PlugType } from "../lib/plugs";
import type { Item } from "../lib/types";
import { usePlayground } from "../store/playground";
import { useUi } from "../store/ui";
import { PlugShape } from "./PlugArt";
import { tip } from "./Tooltip";
import { barPanel } from "./toolbarStyles";

/** What the plug editor has picked: the selected plugs (like selecting gear), and the type new plugs get. */
const usePlugPick = create<{ selected: string[]; type: PlugType; set: (p: Partial<{ selected: string[]; type: PlugType }>) => void }>((set) => ({
  selected: [],
  type: "straight",
  set: (p) => set(p),
}));

/** Deselects every plug (a click on empty canvas while editing plugs). */
export const clearPlugSelection = () => usePlugPick.getState().set({ selected: [] });

/** How far out from an edge a click still lands on it, in inches. */
const EDGE_REACH = 0.7;

/** A point in the item's own unrotated, unflipped frame (inches from its top-left), from a pointer on the screen. */
function localPoint(e: { clientX: number; clientY: number }, box: DOMRect, item: Item, zoom: number) {
  const k = zoom * PX_PER_INCH;
  let x = (e.clientX - (box.left + box.width / 2)) / k;
  let y = (e.clientY - (box.top + box.height / 2)) / k;
  // The drawing is rotate(θ) then scaleX: undo the rotation, then the flip.
  const t = (-item.rotation * Math.PI) / 180;
  [x, y] = [x * Math.cos(t) - y * Math.sin(t), x * Math.sin(t) + y * Math.cos(t)];
  if (item.flipX) x = -x;
  return { x: x + item.width / 2, y: y + item.height / 2 };
}

/** The nearest side to a local point, and where along it (snapped, kept on the side). */
function nearestSide(p: { x: number; y: number }, w: number, h: number): { side: PlugSide; at: number } {
  const d: [PlugSide, number][] = [
    ["top", Math.abs(p.y)],
    ["bottom", Math.abs(p.y - h)],
    ["left", Math.abs(p.x)],
    ["right", Math.abs(p.x - w)],
  ];
  const side = d.sort((a, b) => a[1] - b[1])[0][0];
  const along = side === "top" || side === "bottom" ? p.x : p.y;
  return { side, at: Math.min(Math.max(snapAt(along), 0), sideLength(side, w, h)) };
}

/**
 * The editing layer over a pedal while its plugs are being edited, in its own frame so it turns and flips with it:
 * a band along each edge to click (adds a plug of the chosen type there), and a handle on each plug to drag it along
 * its edge or round to another one. Lives in the canvas's world layer.
 */
export function PlugEditLayer({ item, zoom }: { item: Item; zoom: number }) {
  const box = useRef<HTMLDivElement>(null);
  const { selected, type, set } = usePlugPick();
  const [ghost, setGhost] = useState<{ side: PlugSide; at: number } | null>(null);
  const drag = useRef<string | null>(null);
  const plugs = item.plugs ?? [];
  /** The plugs as they are right now (a drag can start before the screen catches up). */
  const latest = () => usePlayground.getState().items.find((i) => i.id === item.id)?.plugs ?? [];
  const s = PX_PER_INCH;
  const reach = EDGE_REACH * s;

  /** Keeps the drag going when the pointer leaves the handle (skipped when the pointer's already gone). */
  const capture = (e: ReactPointerEvent) => {
    try {
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
    } catch {
      /* no live pointer to capture */
    }
  };
  const at = (e: ReactPointerEvent) => nearestSide(localPoint(e, box.current!.getBoundingClientRect(), item, zoom), item.width, item.height);

  // Like selecting gear: a click picks the plug, Shift-click adds or removes it, and dragging moves the one grabbed.
  const startDrag = (e: ReactPointerEvent, id: string) => {
    e.stopPropagation();
    e.preventDefault();
    if (e.shiftKey) {
      set({ selected: selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id] });
      return;
    }
    if (!selected.includes(id)) set({ selected: [id] });
    capture(e);
    drag.current = id;
    usePlayground.getState().beginTransaction();
  };
  const onMove = (e: ReactPointerEvent) => {
    if (!box.current) return;
    if (drag.current) {
      const pos = at(e);
      const id = drag.current;
      usePlayground.getState().setPlugs(item.id, latest().map((p) => (p.id === id ? { ...p, ...pos } : p)), false);
    } else setGhost(at(e));
  };
  const onUp = () => (drag.current = null);

  const add = (e: ReactPointerEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const plug: Plug = { id: newPlugId(), ...at(e), type };
    usePlayground.getState().setPlugs(item.id, [...latest(), plug]);
    setGhost(null);
    // Keep dragging the new plug until the button comes up, to line it up in one go.
    capture(e);
    // Adding it was the undo step, so the drag that follows joins it.
    drag.current = plug.id;
    set({ selected: [plug.id] });
  };

  const anchor = (p: { side: PlugSide; at: number }) =>
    p.side === "top" ? [p.at, 0] : p.side === "bottom" ? [p.at, item.height] : p.side === "left" ? [0, p.at] : [item.width, p.at];

  return (
    <div
      ref={box}
      className="absolute"
      style={{ left: item.x * s, top: item.y * s, width: item.width * s, height: item.height * s }}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerLeave={() => setGhost(null)}
    >
      <div className="relative size-full" style={{ transform: `rotate(${item.rotation}deg) scaleX(${item.flipX ? -1 : 1})` }}>
        {/* The edge bands: outside each side, a click there adds a plug. */}
        {(
          [
            ["top", { left: 0, top: -reach, width: "100%", height: reach }],
            ["bottom", { left: 0, bottom: -reach, width: "100%", height: reach }],
            ["left", { left: -reach, top: 0, width: reach, height: "100%" }],
            ["right", { right: -reach, top: 0, width: reach, height: "100%" }],
          ] as const
        ).map(([side, style]) => (
          <div key={side} className="absolute cursor-copy" style={style} onPointerDown={add} />
        ))}
        <svg
          className="pointer-events-none absolute overflow-visible"
          style={{ left: 0, top: 0, width: item.width * s, height: item.height * s }}
          viewBox={`0 0 ${item.width} ${item.height}`}
        >
          {ghost && !drag.current && (
            <g opacity={0.45} transform={`translate(${anchor(ghost).join(" ")}) rotate(${SIDE_ANGLE[ghost.side]})`}>
              <PlugShape plug={{ id: "ghost", side: ghost.side, at: ghost.at, type }} />
            </g>
          )}
          {/* Each plug's handle: its head, ringed in the brand color when picked. */}
          {plugs.map((p) => {
            const spec = PLUG_TYPES[p.type];
            const on = selected.includes(p.id);
            return (
              <g key={p.id} transform={`translate(${anchor(p).join(" ")}) rotate(${SIDE_ANGLE[p.side]})`}>
                <rect
                  x={-spec.width / 2 - 0.08}
                  y={-spec.length - 0.08}
                  width={spec.width + 0.16}
                  height={spec.length + 0.16}
                  rx={0.1}
                  fill={on ? "color-mix(in srgb, var(--color-brand) 18%, transparent)" : "transparent"}
                  stroke={on ? "var(--color-brand)" : "transparent"}
                  strokeWidth={2 / zoom / s}
                  className="pointer-events-auto cursor-grab active:cursor-grabbing"
                  onPointerDown={(e) => startDrag(e as unknown as ReactPointerEvent, p.id)}
                />
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

/** A plug type's little picture for the panel's buttons. */
function TypeIcon({ type }: { type: PlugType }) {
  const spec = PLUG_TYPES[type];
  const extent = Math.max(spec.length + 0.3, 1.2);
  return (
    <svg viewBox={`-0.9 ${-extent} 1.8 ${extent + 0.1}`} className="h-6 w-6" aria-hidden>
      <PlugShape plug={{ id: `icon-${type}`, side: "top", at: 0, type }} />
    </svg>
  );
}

/**
 * The panel while plugs are being edited: the type for new plugs (or the picked plug), flip and remove for the picked
 * plug, and Done. It sits where the object menu does: across the top on larger screens, above the toolbar on phones.
 */
export function PlugPanel() {
  const editing = useUi((u) => u.plugEditing);
  const setEditing = useUi((u) => u.setPlugEditing);
  const item = usePlayground((s) => s.items.find((i) => i.id === editing));
  const { selected, type, set } = usePlugPick();
  const picked = item?.plugs?.filter((p) => selected.includes(p.id)) ?? [];
  const plug = picked[0];

  // Only Done ends the editing (the canvas and shortcuts are off meanwhile); a pedal that's gone (undone away) ends it too.
  useEffect(() => {
    if (editing && !item) setEditing(null);
  }, [editing, item, setEditing]);
  useEffect(() => set({ selected: [] }), [editing, set]);
  // Zoom in on the pedal while its plugs are edited, then put the view back on Done.
  useEffect(() => {
    if (!editing) return;
    const before = usePlayground.getState().view;
    usePlayground.getState().focusOn(editing);
    return () => usePlayground.getState().setView(before);
  }, [editing]);

  /** Changes every selected plug (one undo step). */
  const update = (patch: (p: Plug) => Partial<Plug>) =>
    item && picked.length && usePlayground.getState().setPlugs(item.id, item.plugs!.map((p) => (selected.includes(p.id) ? { ...p, ...patch(p) } : p)));
  const remove = () => {
    if (!item || !picked.length) return;
    usePlayground.getState().setPlugs(item.id, item.plugs!.filter((p) => !selected.includes(p.id)));
    set({ selected: [] });
  };

  useEffect(() => {
    if (!editing) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input, textarea")) return;
      if (e.key === "Escape") set({ selected: [] });
      if ((e.key === "Delete" || e.key === "Backspace") && plug) {
        e.preventDefault();
        e.stopPropagation();
        remove();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  if (!editing || !item) return null;
  const current = plug?.type ?? type;
  return (
    <div
      role="dialog"
      aria-label="Plugs"
      className={`animate-enter absolute left-1/2 z-20 flex max-w-[calc(100%-24px)] -translate-x-1/2 flex-col gap-2 p-2 ${barPanel} max-sm:bottom-[calc(74px+env(safe-area-inset-bottom))] sm:top-4`}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between gap-3 px-1">
        <span className="text-[13px] font-semibold">Plugs</span>
        <span className="truncate text-xs text-ink-muted">
          {picked.length > 1
            ? `${picked.length} plugs selected`
            : plug
              ? "Drag it along the edge to line it up."
              : "Click an edge to add a plug. Click a plug to select it."}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <div role="radiogroup" aria-label={plug ? "Selected plugs' type" : "Type for new plugs"} className="flex gap-1">
          {PLUG_ORDER.map((t) => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={current === t && picked.every((p) => p.type === current)}
              aria-label={PLUG_TYPES[t].label}
              {...tip(PLUG_TYPES[t].label)}
              onClick={() => {
                set({ type: t });
                update((p) => ({ type: t, flip: PLUG_TYPES[t].sideways ? p.flip : undefined }));
              }}
              className={`grid size-9 place-items-center rounded-control outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand ${current === t && picked.every((p) => p.type === current) ? "bg-brand/15 ring-1 ring-brand" : "hover:bg-surface-hover"}`}
            >
              <TypeIcon type={t} />
            </button>
          ))}
        </div>
        <span className="mx-1 h-6 w-px bg-line" />
        <button
          type="button"
          aria-label="Flip direction"
          {...tip("Flip Direction")}
          disabled={!picked.some((p) => PLUG_TYPES[p.type].sideways)}
          onClick={() => update((p) => (PLUG_TYPES[p.type].sideways ? { flip: !p.flip } : {}))}
          className="grid size-9 place-items-center rounded-control text-ink-muted outline-none hover:bg-surface-hover hover:text-ink focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-35"
        >
          <ArrowLeftRight size={17} />
        </button>
        <button
          type="button"
          aria-label={picked.length > 1 ? "Remove plugs" : "Remove plug"}
          {...tip(picked.length > 1 ? "Remove Plugs" : "Remove Plug", { shortcut: "Delete" })}
          disabled={!picked.length}
          onClick={remove}
          className="grid size-9 place-items-center rounded-control text-danger outline-none hover:bg-danger/10 focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-35"
        >
          <Trash2 size={17} />
        </button>
        <button
          type="button"
          onClick={() => setEditing(null)}
          className="btn-primary ml-1 flex h-9 items-center gap-1 rounded-control px-3 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          Done
        </button>
      </div>
    </div>
  );
}
