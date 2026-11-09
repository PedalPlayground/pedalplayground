import { RotateCw, Trash2 } from "lucide-react";
import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from "react";
import { create } from "zustand";
import { canvasImageUrl } from "../lib/catalog";
import { PX_PER_INCH } from "../lib/geometry";
import { findJacks, type JackHint } from "../lib/jackFinder";
import { knownType, newPlugId, plugBox, PLUG_ORDER, PLUG_TYPES, SIDE_ANGLE, sideLength, snapAt, type Plug, type PlugSide, type PlugType } from "../lib/plugs";
import type { Item } from "../lib/types";
import { useCatalog } from "../store/catalog";
import { usePlayground } from "../store/playground";
import { useUi } from "../store/ui";
import { ART_SRC, PlugShape } from "./PlugArt";
import { tip } from "./Tooltip";
import { barPanel } from "./toolbarStyles";

/** What the plug editor has picked: the selected plugs (like selecting gear), and the type new plugs get. */
type Pick = { selected: string[]; type: PlugType; flip: boolean; down: boolean; hints: JackHint[] };

/** Rotate on a right-angle plug: cable to one side, then down into the board, then to the other side, and round again. */
const nextTurn = (p: { flip?: boolean; down?: boolean }) =>
  p.down ? { flip: true, down: undefined } : p.flip ? { flip: undefined, down: undefined } : { flip: undefined, down: true };
const usePlugPick = create<Pick & { set: (p: Partial<Pick>) => void }>((set) => ({
  selected: [],
  type: "straight",
  flip: false,
  down: false,
  hints: [],
  set: (p) => set(p),
}));

/** The guessed jacks that don't have a plug on them yet. */
const openHints = (hints: JackHint[], plugs: Plug[]) =>
  hints.filter((h) => !plugs.some((p) => p.side === h.side && Math.abs(p.at - h.at) < 0.4));

/** Reads the pedal's photo for spots that stick out (likely jacks), to offer as + markers. */
function useJackHints(item: Item | undefined) {
  const manifest = useCatalog((s) => s.manifest);
  const set = usePlugPick((p) => p.set);
  const src = item?.kind === "pedal" && item.image ? canvasImageUrl(manifest, item.kind, item.image) : null;
  const w = item?.width ?? 0;
  const h = item?.height ?? 0;
  useEffect(() => {
    set({ hints: [] });
    if (!src) return;
    let live = true;
    findJacks(src, w, h).then((hints) => live && set({ hints }));
    return () => {
      live = false;
    };
  }, [src, w, h, set]);
}

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
  const { selected, type, flip, down, hints, set } = usePlugPick();
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
    }
  };
  const onUp = () => (drag.current = null);

  const add = (e: ReactPointerEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const plug: Plug = { id: newPlugId(), ...at(e), type, ...(PLUG_TYPES[type].sideways ? { ...(flip && !down ? { flip } : {}), ...(down ? { down } : {}) } : {}) };
    usePlayground.getState().setPlugs(item.id, [...latest(), plug]);
    // Keep dragging the new plug until the button comes up, to line it up in one go.
    capture(e);
    // Adding it was the undo step, so the drag that follows joins it.
    drag.current = plug.id;
    set({ selected: [plug.id] });
  };

  /** Clicking a suggested spot adds a plug of the chosen type there. */
  const addHint = (e: ReactPointerEvent, h: JackHint) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const plug: Plug = { id: newPlugId(), side: h.side, at: h.at, type, ...(PLUG_TYPES[type].sideways ? { ...(flip && !down ? { flip } : {}), ...(down ? { down } : {}) } : {}) };
    usePlayground.getState().setPlugs(item.id, [...latest(), plug]);
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
          {/* Suggested spots from the photo: a + just outside the edge, to click. Screen-sized, so it reads at any zoom. */}
          {openHints(hints, plugs).map((h) => {
            const r = 11 / zoom / s;
            const arm = 5 / zoom / s;
            return (
              <g key={`${h.side}-${h.at}`} transform={`translate(${anchor(h).join(" ")}) rotate(${SIDE_ANGLE[h.side]}) translate(0 ${-r - 4 / zoom / s})`}>
                <g
                  className="pointer-events-auto cursor-copy opacity-80 transition-opacity hover:opacity-100"
                  onPointerDown={(e) => addHint(e as unknown as ReactPointerEvent, h)}
                >
                  <title>Add a plug here</title>
                  <circle r={r} fill="var(--color-brand)" stroke="white" strokeWidth={1.5 / zoom / s} />
                  <path d={`M${-arm} 0H${arm}M0 ${-arm}V${arm}`} stroke="white" strokeWidth={2 / zoom / s} strokeLinecap="round" />
                </g>
              </g>
            );
          })}
          {/* Each plug's handle: its head, ringed in the brand color when picked. */}
          {plugs.map((p) => {
            const box = plugBox(p.type, p.flip, p.down);
            const on = selected.includes(p.id);
            return (
              <g key={p.id} transform={`translate(${anchor(p).join(" ")}) rotate(${SIDE_ANGLE[p.side]})`}>
                <rect
                  x={box.left - 0.08}
                  y={-box.out - 0.08}
                  width={box.right - box.left + 0.16}
                  height={box.out + 0.16}
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
  // Right-angle plugs: the whole drawing, barrel and all, as in Space Between's plug guide.
  const art = PLUG_TYPES[type].art;
  if (art) return <img src={ART_SRC[art.name]} alt="" draggable={false} className="size-6 object-contain" />;
  // A square around the head and the start of its cable, so every type fills its button alike.
  const box = plugBox(type);
  const sideways = PLUG_TYPES[type].sideways;
  const [x0, x1] = [box.left, box.right + (sideways ? 0.4 : 0)];
  const [y0, y1] = [-box.out - (sideways ? 0 : 0.4), 0.05];
  const size = Math.max(x1 - x0, y1 - y0, 1.2) + 0.1;
  const [cx, cy] = [(x0 + x1) / 2, (y0 + y1) / 2];
  return (
    <svg viewBox={`${cx - size / 2} ${cy - size / 2} ${size} ${size}`} className="h-6 w-6" aria-hidden>
      <PlugShape plug={{ id: `icon-${type}`, side: "top", at: 0, type }} />
    </svg>
  );
}

/**
 * The panel while plugs are being edited: the type for new plugs (or the picked plug), rotate and remove for the picked
 * plug, and Done. It sits where the object menu does: across the top on larger screens, above the toolbar on phones.
 */
export function PlugPanel() {
  const editing = useUi((u) => u.plugEditing);
  const setEditing = useUi((u) => u.setPlugEditing);
  const item = usePlayground((s) => s.items.find((i) => i.id === editing));
  const { selected, type, flip, down, hints, set } = usePlugPick();
  useJackHints(item);
  const suggested = openHints(hints, item?.plugs ?? []);
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
  const current = plug ? knownType(plug.type) : type;
  // Rotate applies to right-angle plugs: the picked ones, or the type new plugs get.
  const angled = plug ? picked.filter((p) => PLUG_TYPES[knownType(p.type)].sideways) : PLUG_TYPES[type].sideways ? [{}] : [];
  return (
    <div
      role="dialog"
      aria-label="Plugs"
      className={`animate-enter absolute left-1/2 z-20 flex w-max max-w-[calc(100%-24px)] -translate-x-1/2 flex-col gap-2 p-2 ${barPanel} max-sm:bottom-[calc(74px+env(safe-area-inset-bottom))] sm:top-4`}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between gap-3 px-1">
        <span className="text-[13px] font-semibold">Plugs</span>
        <span className="truncate text-xs text-ink-muted">
          {picked.length > 1
            ? `${picked.length} plugs selected`
            : plug
              ? "Drag it along the edge to line it up."
              : suggested.length
                ? "Click a + to add a plug where a jack seems to be, or click any edge."
                : "Click an edge to add a plug, or another pedal to switch to it."}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <div role="radiogroup" aria-label={plug ? "Selected plugs' type" : "Type for new plugs"} className="flex gap-1">
          {PLUG_ORDER.map((t) => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={current === t && picked.every((p) => knownType(p.type) === current)}
              aria-label={PLUG_TYPES[t].label}
              {...tip(PLUG_TYPES[t].label)}
              onClick={() => {
                set({ type: t });
                update((p) => ({ type: t, flip: PLUG_TYPES[t].sideways ? p.flip : undefined, down: PLUG_TYPES[t].sideways ? p.down : undefined }));
              }}
              className={`grid size-9 place-items-center rounded-control outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand ${current === t && picked.every((p) => knownType(p.type) === current) ? "bg-brand/15 ring-1 ring-brand" : "hover:bg-surface-hover"}`}
            >
              <TypeIcon type={t} />
            </button>
          ))}
        </div>
        <span className="mx-1 h-6 w-px bg-line" />
        <button
          type="button"
          aria-label="Rotate plug"
          {...tip("Rotate Plug")}
          disabled={!angled.length}
          onClick={() => {
            if (!plug) {
              const n = nextTurn({ flip, down });
              set({ flip: !!n.flip, down: !!n.down });
            } else update((p) => (PLUG_TYPES[knownType(p.type)].sideways ? nextTurn(p) : {}));
          }}
          className="grid size-9 place-items-center rounded-control text-ink-muted outline-none hover:bg-surface-hover hover:text-ink focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-35"
        >
          <RotateCw size={17} />
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
