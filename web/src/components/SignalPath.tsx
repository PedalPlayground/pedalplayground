import { Guitar, Plus, Route, Speaker, Wand2 } from "lucide-react";
import type React from "react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { thumbUrl, type Manifest } from "../lib/catalog";
import { DEFAULT_PEDAL_COLOR } from "../lib/color";
import { PX_PER_INCH } from "../lib/geometry";
import { itemName } from "../lib/itemName";
import { insertOnCable, isController, nodeById, removeNode, type SignalNode } from "../lib/signal";
import { autoArrange, moveAlong, parallelTo, toggleControl } from "../lib/signalEdits";
import { channelBadge, DESKTOP_METRICS, layoutSignal, PHONE_METRICS, type LayoutMetrics, type TileBox, type Wire } from "../lib/signalLayout";
import type { Item } from "../lib/types";
import { useCatalog } from "../store/catalog";
import { usePlayground } from "../store/playground";
import { useUi } from "../store/ui";
import { PedalArt } from "./PedalArt";
import { CONTROL_LABEL, edit, openSignalMenu, SignalMenu, useSignalMenu, type SignalMenuTarget } from "./SignalMenu";
import { barSoftButton } from "./toolbarStyles";
import { hideTip, tip } from "./Tooltip";

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

type DropTarget = { type: "slot"; id: string } | { type: "tile"; id: string } | { type: "tray" } | null;

interface Drag {
  id: string;
  startX: number;
  startY: number;
  x: number;
  y: number;
  started: boolean;
  over: DropTarget;
}

/** A press that moves less than this is a click, not a drag. */
const DRAG_START_PX = 4;

/** What's under the pointer while dragging: a "+" on a wire, a pedal tile, or the Not in Chain tray. */
function dropTargetAt(x: number, y: number, dragged: string): DropTarget {
  const el = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-slot],[data-node],[data-drop]");
  if (!el) return null;
  if (el.dataset.slot) return { type: "slot", id: el.dataset.slot };
  if (el.dataset.node && el.dataset.node !== dragged && el.dataset.kind === "item") return { type: "tile", id: el.dataset.node };
  if (el.dataset.drop === "tray") return { type: "tray" };
  return null;
}

const typing = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

/** The Signal Path mode: the chain as a modeler-style grid you can edit. Covers the canvas like the Equipment List. */
export function SignalPath() {
  const items = usePlayground((p) => p.items);
  const signal = usePlayground((p) => p.signal);
  const { manifest, load } = useCatalog();
  const setMode = useUi((u) => u.setMode);
  const setSearchOpen = useUi((u) => u.setSearchOpen);

  useEffect(() => {
    void load();
  }, [load]);

  // The diagram wraps to the room it has, so measure it.
  const box = useRef<HTMLDivElement>(null);
  const [room, setRoom] = useState(0);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setRoom(el.clientWidth));
    ro.observe(el);
    setRoom(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const metrics: LayoutMetrics = { ...(room < 640 ? PHONE_METRICS : DESKTOP_METRICS), maxWidth: room };
  const layout = useMemo(() => (room ? layoutSignal(signal, items, metrics) : null), [signal, items, room]);

  const pedals = items.filter((i) => i.kind === "pedal");
  const byId = new Map(items.map((i) => [i.id, i]));
  const trayItems = (layout?.tray ?? []).map((id) => byId.get(id)!).filter(Boolean);
  const onDiagram = useMemo(() => new Set(layout?.tiles.map((t) => t.id)), [layout]);
  const inChain = layout ? layout.tiles.filter((t) => t.kind === "item" || t.kind === "controller").length : 0;

  const addGear = () => {
    setMode("playground");
    setSearchOpen(true);
  };

  const arrange = () => {
    const wired = signal.nodes.some((n) => n.type === "item" && signal.cables.some((c) => c.from === n.id || c.to === n.id));
    if (wired && !window.confirm("Replace your chain with one built from your board, right to left?")) return;
    edit((g) => autoArrange(g, items), "Arranged From Your Board");
  };

  // Dragging (mouse and pen; touch uses the menus). A tile dropped on a "+" moves there, on another pedal goes in
  // parallel with it (or, for a controller, starts controlling it), and on the tray leaves the chain.
  const [drag, setDrag] = useState<Drag | null>(null);
  const justDragged = useRef(false);
  const startDrag = (e: React.PointerEvent, id: string) => {
    if (e.pointerType === "touch" || e.button !== 0) return;
    const d: Drag = { id, startX: e.clientX, startY: e.clientY, x: e.clientX, y: e.clientY, started: false, over: null };
    const move = (ev: PointerEvent) => {
      if (!d.started && Math.hypot(ev.clientX - d.startX, ev.clientY - d.startY) < DRAG_START_PX) return;
      d.started = true;
      d.x = ev.clientX;
      d.y = ev.clientY;
      d.over = dropTargetAt(ev.clientX, ev.clientY, id);
      hideTip();
      setDrag({ ...d });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      setDrag(null);
      if (!d.started) return;
      justDragged.current = true;
      setTimeout(() => (justDragged.current = false));
      drop(d.id, d.over);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };

  const drop = (id: string, over: DropTarget) => {
    const controller = isController(nodeById(usePlayground.getState().signal, id));
    if (over?.type === "slot") edit((g) => insertOnCable(g, over.id, id), "Moved");
    else if (over?.type === "tile" && controller) edit((g) => toggleControl(g, id, over.id), "Now Controlling It");
    else if (over?.type === "tile") edit((g) => parallelTo(g, over.id, id), "Added in Parallel");
    else if (over?.type === "tray") edit((g) => (nodeById(g, id) ? removeNode(g, id, { heal: true }) : g), "Removed From Chain");
  };

  const openMenu = (target: SignalMenuTarget, el: Element) => {
    if (!justDragged.current) openSignalMenu(target, el);
  };

  // Keys: undo/redo, arrows move between tiles, Alt+arrows move the pedal, Delete takes it out of the chain.
  const diagram = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (typing(e.target) || useSignalMenu.getState().open) return;
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();
      const s = usePlayground.getState();
      if (mod && key === "z") {
        e.preventDefault();
        (e.shiftKey ? s.redo : s.undo)();
        return;
      }
      if (mod && key === "y") {
        e.preventDefault();
        s.redo();
        return;
      }
      const focused = (document.activeElement as HTMLElement | null)?.closest<HTMLElement>("[data-node]");
      if (!focused || !diagram.current?.contains(focused)) return;
      const id = focused.dataset.node!;
      const isItem = focused.dataset.kind === "item" || focused.dataset.kind === "controller";
      if (e.altKey && (key === "arrowleft" || key === "arrowright") && focused.dataset.kind === "item") {
        e.preventDefault();
        edit((g) => moveAlong(g, id, key === "arrowleft" ? -1 : 1), "Moved");
      } else if ((key === "delete" || key === "backspace") && isItem) {
        e.preventDefault();
        edit((g) => removeNode(g, id, { heal: true }), "Removed From Chain");
      } else if (key.startsWith("arrow") && !e.altKey) {
        // Reading order: left to right, then down.
        const tiles = [...diagram.current.querySelectorAll<HTMLElement>("[data-node]")].sort(
          (a, b) => a.offsetTop - b.offsetTop || a.offsetLeft - b.offsetLeft,
        );
        const n = tiles.indexOf(focused);
        const step = key === "arrowleft" || key === "arrowup" ? -1 : 1;
        tiles[n + step]?.focus();
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const draggedItem = drag?.started ? byId.get(drag.id) : undefined;
  const nothingWired = inChain === 0 && pedals.length > 0;

  return (
    <div className="animate-fade absolute inset-0 z-10 overflow-y-auto overscroll-contain bg-canvas">
      {/* Clears the floating mode rail: beside it on larger screens, below it on phones. */}
      <div className="flex w-full flex-col gap-3 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] pt-[76px] sm:pl-[calc(max(1rem,env(safe-area-inset-left))+64px)] sm:pr-[max(1.5rem,env(safe-area-inset-right))] sm:pt-3">
        <header className="animate-enter flex items-center gap-3 px-1 py-1 [--enter-y:4px]">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold tracking-[-0.02em]">Signal Path</h2>
            <p className="truncate text-[13px] text-ink-muted">
              {pedals.length === 0 ? "Nothing on this playground yet" : `${plural(inChain, "Pedal")} in Chain · ${trayItems.length} Not in Chain`}
            </p>
          </div>
          {pedals.length > 0 && (
            <button {...tip("Chain every pedal in the order it sits on your board, right to left")} onClick={arrange} className={barSoftButton}>
              <Wand2 size={14} />
              Auto Arrange
            </button>
          )}
        </header>

        {pedals.length === 0 && (
          <div className="animate-enter flex flex-col items-center gap-3 rounded-panel bg-surface px-6 py-10 text-center shadow-panel">
            <span className="grid size-10 place-items-center rounded-full bg-brand/10 text-brand">
              <Route size={18} />
            </span>
            <p className="max-w-xs text-sm text-ink-muted">Add pedals to your playground to wire them up here.</p>
            <button
              onClick={addGear}
              className="btn-primary h-[30px] rounded-[5px] px-4 text-[13px] tracking-[-0.01em] outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1 pointer-coarse:h-10"
            >
              Add Gear
            </button>
          </div>
        )}

        {nothingWired && (
          <p className="animate-enter px-1 text-[13px] text-ink-muted">
            Your pedals aren't wired up yet. Auto Arrange chains them in the order they sit on your board, or tap a pedal under Not in Chain, or a + on a cable, to add them one at a time.
          </p>
        )}

        <div ref={box} className={`group/diagram animate-enter overflow-x-auto rounded-panel bg-surface shadow-panel ${pedals.length === 0 ? "hidden" : ""}`}>
          {layout && (
            <div ref={diagram} className="relative" style={{ width: layout.width, height: layout.height }} aria-label={describe(signal.nodes, layout, byId)} role="group">
              <svg className="absolute inset-0 overflow-visible" width={layout.width} height={layout.height} aria-hidden>
                {layout.wires.map((w) => (
                  <WirePath key={w.id} wire={w} />
                ))}
                {layout.deadEnds.map((d, n) => (
                  <path key={n} d={`M${d.x} ${d.y}h10m0 -7v14`} className="fill-none stroke-ink-muted" strokeWidth={2} strokeLinecap="round" />
                ))}
              </svg>
              {layout.junctions.map((j) => (
                <span
                  key={j.id}
                  {...tip(j.type === "split" ? "Split" : "Merge")}
                  className="absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-ink-muted bg-surface"
                  style={{ left: j.x, top: j.y }}
                />
              ))}
              {layout.wires.map(
                (w) =>
                  w.slot && (
                    <button
                      key={`slot-${w.id}`}
                      data-slot={w.id}
                      aria-label="Insert a pedal here"
                      {...tip("Insert a Pedal Here")}
                      onClick={(e) => openMenu({ kind: "slot", cableId: w.id }, e.currentTarget)}
                      className={`absolute grid size-[18px] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border bg-surface text-brand outline-none transition-[opacity,transform] duration-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-brand pointer-coarse:size-6 pointer-coarse:opacity-100 ${
                        drag?.started
                          ? drag.over?.type === "slot" && drag.over.id === w.id
                            ? "scale-125 border-brand opacity-100"
                            : "border-brand/40 opacity-100"
                          : "border-brand/40 opacity-0 hover:scale-110 group-hover/diagram:opacity-100"
                      }`}
                      style={{ left: w.slot[0], top: w.slot[1] }}
                    >
                      <Plus size={12} strokeWidth={2.5} />
                    </button>
                  ),
              )}
              {layout.tiles.map((t) => (
                <Tile
                  key={t.id}
                  box={t}
                  node={nodeById(signal, t.id)}
                  item={byId.get(t.id)}
                  manifest={manifest}
                  warn={layout.warnings.includes(t.id)}
                  small={room < 640}
                  target={drag?.over?.type === "tile" && drag.over.id === t.id}
                  dragging={drag?.started === true && drag.id === t.id}
                  onPointerDown={(e) => (t.kind === "item" || t.kind === "controller") && startDrag(e, t.id)}
                  onClick={(e) => openMenu({ kind: "tile", id: t.id }, e.currentTarget)}
                />
              ))}
            </div>
          )}
        </div>

        {(trayItems.length > 0 || drag?.started) && pedals.length > 0 && (
          <section
            data-drop="tray"
            className={`animate-enter flex flex-col gap-2 rounded-panel p-1 transition-colors ${drag?.over?.type === "tray" ? "bg-brand/10 ring-2 ring-brand/40" : ""}`}
          >
            <h3 className="px-1 text-[13px] font-semibold tracking-[-0.01em] text-ink-muted">Not in Chain</h3>
            <div className="flex min-h-9 flex-wrap gap-2">
              {trayItems.length === 0 && <p className="px-1 text-[13px] text-ink-muted">Drop a pedal here to take it out of the chain.</p>}
              {trayItems.map((item) => {
                const controller = isController(nodeById(signal, item.id));
                return (
                  <button
                    key={item.id}
                    data-tray-item={item.id}
                    {...tip(controller ? "Controller: pick what it controls" : "Add to the chain")}
                    onPointerDown={(e) => startDrag(e, item.id)}
                    onClick={(e) => openMenu({ kind: "tray", id: item.id }, e.currentTarget)}
                    className={`press flex h-9 items-center gap-2 rounded-control bg-surface pl-1 pr-3 shadow-panel outline-none hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-brand ${drag?.started && drag.id === item.id ? "opacity-40" : ""}`}
                  >
                    <Art item={item} manifest={manifest} size={28} />
                    <span className="max-w-40 truncate text-sm">{itemName(item)}</span>
                    {controller && <span className="text-xs text-ink-muted">Controller</span>}
                  </button>
                );
              })}
            </div>
          </section>
        )}
      </div>

      {draggedItem && drag && (
        <div className="pointer-events-none fixed z-50 flex h-9 -translate-x-1/2 -translate-y-1/2 items-center gap-2 rounded-control bg-surface pl-1 pr-3 shadow-panel" style={{ left: drag.x, top: drag.y }}>
          <Art item={draggedItem} manifest={manifest} size={28} />
          <span className="max-w-40 truncate text-sm">{itemName(draggedItem)}</span>
        </div>
      )}

      <SignalMenu items={items} onDiagram={onDiagram} />
    </div>
  );
}

/** A plain reading of the main path for screen readers: "Guitar, then Boost, then Amp". */
function describe(nodes: SignalNode[], layout: { tiles: TileBox[] }, byId: Map<string, Item>) {
  const names = layout.tiles.map((t) => {
    const n = nodes.find((x) => x.id === t.id);
    if (n?.type === "source" || n?.type === "destination") return n.label;
    const item = byId.get(t.id);
    return item ? itemName(item) : "Pedal";
  });
  return `Signal path: ${names.join(", then ")}`;
}

/** An orthogonal polyline with softly rounded corners. */
function roundedPath(points: [number, number][], r = 8) {
  let d = `M${points[0][0]} ${points[0][1]}`;
  for (let i = 1; i < points.length; i++) {
    const [x, y] = points[i];
    const next = points[i + 1];
    if (!next) {
      d += `L${x} ${y}`;
      break;
    }
    const [px, py] = points[i - 1];
    const lenIn = Math.hypot(x - px, y - py);
    const lenOut = Math.hypot(next[0] - x, next[1] - y);
    const k = Math.min(r, lenIn / 2, lenOut / 2);
    const ax = x - (Math.sign(x - px) * k);
    const ay = y - (Math.sign(y - py) * k);
    const bx = x + Math.sign(next[0] - x) * k;
    const by = y + Math.sign(next[1] - y) * k;
    d += `L${ax} ${ay}Q${x} ${y} ${bx} ${by}`;
  }
  return d;
}

function WirePath({ wire }: { wire: Wire }) {
  const d = roundedPath(wire.points);
  if (wire.kind === "control") {
    return <path d={d} className="fill-none stroke-brand" strokeWidth={1.5} strokeDasharray="4 4" />;
  }
  // Wrapping wires get a small arrow on their run back to the left, so the direction reads at a glance.
  const arrow = wire.wraps && wire.points.length >= 4 ? arrowAt(wire.points[2], wire.points[3]) : null;
  return (
    <g>
      {wire.channels === "stereo" ? (
        <>
          {/* Two strands: a thick line with the background drawn down its middle. */}
          <path d={d} className="fill-none stroke-ink-muted" strokeWidth={5} />
          <path d={d} className="fill-none stroke-surface" strokeWidth={1.5} />
        </>
      ) : (
        <path d={d} className="fill-none stroke-ink-muted" strokeWidth={2} />
      )}
      {arrow && <path d={arrow} className="fill-none stroke-ink-muted" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />}
    </g>
  );
}

function arrowAt([x0, y0]: [number, number], [x1, y1]: [number, number]) {
  if (y0 !== y1) return null;
  const x = (x0 + x1) / 2;
  const dir = Math.sign(x1 - x0) || -1;
  return `M${x - dir * 5} ${y0 - 5}L${x} ${y0}L${x - dir * 5} ${y0 + 5}`;
}

function Tile({
  box,
  node,
  item,
  manifest,
  warn,
  small,
  target,
  dragging,
  onPointerDown,
  onClick,
}: {
  box: TileBox;
  node: SignalNode | undefined;
  item: Item | undefined;
  manifest: Manifest | null;
  warn: boolean;
  small: boolean;
  /** A dragged pedal is over this one. */
  target: boolean;
  dragging: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  const badge = channelBadge(node);
  const style = { left: box.x, top: box.y, width: box.w, height: box.h };
  const focus = "outline-none focus-visible:ring-2 focus-visible:ring-brand";

  if (node?.type === "source" || node?.type === "destination") {
    const Icon = node.type === "source" ? Guitar : Speaker;
    return (
      <button
        data-node={node.id}
        data-kind={node.type}
        onClick={onClick}
        aria-label={`${node.label}${badge ? ", stereo" : ""}`}
        className={`press absolute flex flex-col items-center justify-center gap-1.5 rounded-full border border-chrome-line bg-canvas text-center hover:bg-surface-hover ${focus}`}
        style={style}
      >
        <Icon size={small ? 16 : 18} className="text-ink-muted" />
        <span className="w-full truncate px-1 text-xs font-semibold">{node.label}</span>
        {badge && <Badge text={badge} />}
        {warn && <Warning />}
      </button>
    );
  }

  const controller = node?.type === "item" ? node.io?.control : undefined;
  const name = item ? itemName(item) : "Pedal";
  const sub = controller ? CONTROL_LABEL[controller] : item?.pedalType;
  return (
    <button
      data-node={box.id}
      data-kind={box.kind}
      {...tip(name)}
      aria-label={`${name}${badge ? `, ${badge}` : ""}${controller ? ", controller" : ""}`}
      onPointerDown={onPointerDown}
      onClick={onClick}
      className={`press absolute flex flex-col items-center gap-1 rounded-[10px] border bg-surface px-1.5 pb-2 pt-2 text-center transition-[opacity,box-shadow] hover:bg-surface-hover ${focus} ${
        controller ? "border-dashed border-brand/50" : "border-chrome-line"
      } ${target ? "ring-2 ring-brand" : ""} ${dragging ? "opacity-40" : ""}`}
      style={style}
    >
      <div className="grid min-h-0 w-full flex-1 place-items-center">{item && <Art item={item} manifest={manifest} size={small ? 44 : 56} />}</div>
      <span className="w-full truncate text-xs font-medium leading-tight">{name}</span>
      <span className="h-3.5 w-full truncate text-[11px] leading-tight text-ink-muted">{sub}</span>
      {badge && <Badge text={badge} />}
      {warn && <Warning />}
    </button>
  );
}

function Badge({ text }: { text: string }) {
  // Sits on the tile's top edge like a tag, clear of the pedal art.
  return (
    <span className="absolute -top-2 right-2 rounded-[4px] border border-brand/30 bg-surface px-1 text-[10px] font-semibold leading-[14px] text-brand">
      {text}
    </span>
  );
}

function Warning() {
  return (
    <span
      {...tip("Stereo into a mono input: the right side is dropped.")}
      className="absolute -left-1 -top-1 size-3 rounded-full border-2 border-surface bg-danger"
    />
  );
}

/** A pedal's picture, fitted into a `size` px square: the catalog thumbnail, or the drawn custom pedal. */
function Art({ item, manifest, size }: { item: Item; manifest: Manifest | null; size: number }) {
  const src = item.image ? thumbUrl(manifest, item.kind, item.image) : null;
  const w = item.width * PX_PER_INCH;
  const h = item.height * PX_PER_INCH;
  const scale = Math.min(size / w, size / h);
  if (src) return <img src={src} alt="" draggable={false} className="select-none object-contain" style={{ width: w * scale, height: h * scale }} />;
  if (!item.custom) return <span className="rounded-[4px] bg-surface-hover" style={{ width: w * scale, height: h * scale }} />;
  return (
    <span className="relative block" style={{ width: w * scale, height: h * scale }}>
      <span className="absolute left-0 top-0 origin-top-left" style={{ width: w, height: h, transform: `scale(${scale})` }}>
        <PedalArt template={item.template} jacks={item.jacks} w={w} h={h} color={item.color ?? DEFAULT_PEDAL_COLOR} label={item.label} />
      </span>
    </span>
  );
}
