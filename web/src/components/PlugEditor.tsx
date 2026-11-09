import { Trash2 } from "lucide-react";
import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from "react";
import { create } from "zustand";
import { canvasImageUrl } from "../lib/catalog";
import { PX_PER_INCH } from "../lib/geometry";
import { findJacks, type JackHint } from "../lib/jackFinder";
import { DEFAULT_PLUG, knownType, newPlugId, plugBox, PLUG_ORDER, PLUG_TYPES, SIDE_ANGLE, sideLength, snapAt, type Plug, type PlugSide, type PlugType } from "../lib/plugs";
import type { Item } from "../lib/types";
import { useMediaQuery } from "../lib/viewport";
import { useCatalog } from "../store/catalog";
import { usePlayground } from "../store/playground";
import { useUi } from "../store/ui";
import { ART_SRC } from "./PlugArt";
import { tip } from "./Tooltip";
import { barIconActive, barIconIdle, barPanel } from "./toolbarStyles";

/** What the plug editor has picked: the selected plugs (like selecting gear), and the type new plugs get. */
type Pick = { selected: string[]; type: PlugType; hints: JackHint[] };

const usePlugPick = create<Pick & { set: (p: Partial<Pick>) => void }>((set) => ({
  selected: [],
  type: DEFAULT_PLUG,
  hints: [],
  set: (p) => set(p),
}));

/** The guessed jacks that don't have a plug on them yet. */
const openHints = (hints: JackHint[], plugs: Plug[]) =>
  hints.filter((h) => !plugs.some((p) => p.side === h.side && Math.abs(p.at - h.at) < 0.4));

/** The found jacks, plus a + at the middle of every side that has none (all four when nothing was found or there's no photo). */
const withMiddles = (found: JackHint[], w: number, h: number): JackHint[] => [
  ...found,
  ...(["top", "right", "bottom", "left"] as const)
    .filter((side) => !found.some((f) => f.side === side))
    .map((side) => ({ side, at: snapAt((side === "top" || side === "bottom" ? w : h) / 2) })),
];

/** Reads the pedal's photo for spots that stick out (likely jacks), to offer as + markers. */
function useJackHints(item: Item | undefined) {
  const manifest = useCatalog((s) => s.manifest);
  const set = usePlugPick((p) => p.set);
  const src = item?.kind === "pedal" && item.image ? canvasImageUrl(manifest, item.kind, item.image) : null;
  const w = item?.width ?? 0;
  const h = item?.height ?? 0;
  useEffect(() => {
    set({ hints: [] });
    if (!src) {
      set({ hints: withMiddles([], w, h) });
      return;
    }
    let live = true;
    findJacks(src, w, h).then((hints) => live && set({ hints: withMiddles(hints, w, h) }));
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
  const { selected, type, hints, set } = usePlugPick();
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
    const plug: Plug = { id: newPlugId(), ...at(e), type };
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
    const plug: Plug = { id: newPlugId(), side: h.side, at: h.at, type };
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
            const box = plugBox(p.type);
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
  return <img src={ART_SRC[PLUG_TYPES[type].art.name]} alt="" draggable={false} className="size-6 object-contain" />;
}

/**
 * The panel while plugs are being edited: a short hint and Done (picked plugs get their own mini-menu; new plugs are
 * the last type picked there, SP400 to start). It sits where the object menu does: across the top on larger screens, above the toolbar on phones.
 */
export function PlugPanel() {
  const editing = useUi((u) => u.plugEditing);
  const setEditing = useUi((u) => u.setPlugEditing);
  const item = usePlayground((s) => s.items.find((i) => i.id === editing));
  const { selected, set } = usePlugPick();
  useJackHints(item);
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
      // Escape deselects the picked plugs, or with none picked, leaves plug editing.
      if (e.key === "Escape") {
        if (picked.length) set({ selected: [] });
        else setEditing(null);
      }
      // D removes, as it does for gear (and Delete / Backspace).
      const d = e.key.toLowerCase() === "d" && !e.metaKey && !e.ctrlKey && !e.altKey;
      if ((e.key === "Delete" || e.key === "Backspace" || d) && plug) {
        e.preventDefault();
        e.stopPropagation();
        remove();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  if (!editing || !item) return null;
  return (
    <>
      <div
        role="dialog"
        aria-label="Plugs"
        className={`animate-enter absolute left-1/2 z-20 flex w-max max-w-[calc(100%-24px)] -translate-x-1/2 flex-col p-2 ${barPanel} max-sm:bottom-[calc(74px+env(safe-area-inset-bottom))] sm:top-4`}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 pl-1">
          <span className="text-[13px] font-medium">
            {plug ? "Drag a plug to adjust its position." : "Click on a + to add a plug."}
          </span>
          <button
            type="button"
            onClick={() => setEditing(null)}
            className="btn-primary flex h-9 items-center gap-1 rounded-control px-3 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            Done
          </button>
        </div>
      </div>
      {picked.length > 0 && <PlugMiniMenu item={item} picked={picked} update={update} remove={remove} />}
    </>
  );
}

const MENU_GAP = 10; // between the plugs' room and the menu
/** Mini-menu buttons, as in the selection's mini-menu: bigger on touch screens. */
const miniButton =
  "press grid size-8 place-items-center rounded-control outline-none focus-visible:ring-2 focus-visible:ring-brand pointer-coarse:size-11 [&_svg]:size-4 pointer-coarse:[&_svg]:size-[21px]";

/** Room any plug type takes at a jack (inches, in a plug's own frame): the menu keeps clear of it. */
const ENVELOPE = (() => {
  const boxes = PLUG_ORDER.map((t) => plugBox(t));
  return { left: Math.min(...boxes.map((b) => b.left)), right: Math.max(...boxes.map((b) => b.right)), out: Math.max(...boxes.map((b) => b.out)) };
})();

/**
 * The room the selected plugs could take on screen (canvas pixels), turned and flipped with the pedal: around each jack
 * point, as much as the biggest plug type needs. The menu goes by this, not the drawings, so it stays put when a plug's
 * type changes and still keeps clear of the plug.
 */
function jacksOnScreen(item: Item, plugs: Plug[], view: { x: number; y: number; zoom: number }) {
  const k = view.zoom * PX_PER_INCH;
  const t = (item.rotation * Math.PI) / 180;
  const xs: number[] = [];
  const ys: number[] = [];
  for (const p of plugs) {
    const a = (SIDE_ANGLE[p.side] * Math.PI) / 180;
    const [ax, ay] = p.side === "top" ? [p.at, 0] : p.side === "bottom" ? [p.at, item.height] : p.side === "left" ? [0, p.at] : [item.width, p.at];
    for (const [bx, by] of [
      [ENVELOPE.left, 0],
      [ENVELOPE.right, 0],
      [ENVELOPE.left, -ENVELOPE.out],
      [ENVELOPE.right, -ENVELOPE.out],
    ]) {
      // Plug frame to the pedal's own frame, then its flip and turn about its center, then the screen.
      let x = ax + bx * Math.cos(a) - by * Math.sin(a) - item.width / 2;
      const y = ay + bx * Math.sin(a) + by * Math.cos(a) - item.height / 2;
      if (item.flipX) x = -x;
      xs.push(view.x + (item.x + item.width / 2 + x * Math.cos(t) - y * Math.sin(t)) * k);
      ys.push(view.y + (item.y + item.height / 2 + x * Math.sin(t) + y * Math.cos(t)) * k);
    }
  }
  return { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) };
}

/**
 * A little menu under the selected plugs, like the one under selected gear: their type and
 * Remove. Above them when there's no room below; kept on screen.
 */
function PlugMiniMenu({
  item,
  picked,
  update,
  remove,
}: {
  item: Item;
  picked: Plug[];
  update: (patch: (p: Plug) => Partial<Plug>) => void;
  remove: () => void;
}) {
  const view = usePlayground((s) => s.view);
  const viewport = usePlayground((s) => s.viewport);
  const touch = useMediaQuery("(pointer: coarse)");
  if (!viewport.w) return null;
  const b = jacksOnScreen(item, picked, view);
  const size = touch ? 44 : 32;
  const H = size + 8;
  const halfW = (4 * size + 3 * 2 + 12 + 9) / 2;
  const cx = Math.min(Math.max((b.left + b.right) / 2, halfW + 8), viewport.w - halfW - 8);
  const below = b.bottom + MENU_GAP;
  const y = below + H > viewport.h - (touch ? 84 : 8) ? Math.max(8, b.top - MENU_GAP - H) : below;
  const types = new Set(picked.map((p) => knownType(p.type)));
  return (
    <div
      role="toolbar"
      aria-label={picked.length > 1 ? "Selected plugs" : "Selected plug"}
      className="absolute z-10 flex -translate-x-1/2 items-center gap-0.5 rounded-panel bg-surface p-1.5 shadow-float"
      style={{ left: cx, top: y }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div role="radiogroup" aria-label="Plug type" className="flex gap-0.5">
        {PLUG_ORDER.map((t) => (
          <button
            key={t}
            type="button"
            role="radio"
            aria-checked={types.size === 1 && types.has(t)}
            aria-label={PLUG_TYPES[t].label}
            {...tip(PLUG_TYPES[t].label, { side: "bottom" })}
            onClick={() => {
              update(() => ({ type: t }));
              // New plugs follow the last type picked.
              usePlugPick.getState().set({ type: t });
            }}
            className={`${miniButton} ${types.size === 1 && types.has(t) ? barIconActive : barIconIdle}`}
          >
            <TypeIcon type={t} />
          </button>
        ))}
      </div>
      <span className="mx-0.5 h-5 w-px bg-line" />
      <button
        type="button"
        aria-label={picked.length > 1 ? "Remove plugs" : "Remove plug"}
        {...tip(picked.length > 1 ? "Remove Plugs" : "Remove Plug", { shortcut: "Delete", side: "bottom" })}
        onClick={remove}
        className={`${miniButton} text-danger hover:bg-danger/10`}
      >
        <Trash2 size={16} />
      </button>
    </div>
  );
}
