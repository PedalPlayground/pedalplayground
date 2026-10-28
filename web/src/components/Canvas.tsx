import { useEffect, useRef, useState } from "react";
import { canvasImageUrl } from "../lib/catalog";
import { clamp, itemBounds, PX_PER_INCH } from "../lib/geometry";
import { gridLayers } from "../lib/scale";
import { snapMove, type Guides } from "../lib/snap";
import type { Item } from "../lib/types";
import { useCatalog } from "../store/catalog";
import { usePlayground } from "../store/playground";
import { openContextMenu, useContextMenu } from "./ContextMenu";
import { CustomItemView } from "./CustomItem";
import { isMac, tip } from "./Tooltip";
import { itemName } from "../lib/itemName";
import { useUi } from "../store/ui";

/** Screen-space distance (px) within which a dragged item snaps to another's edge or center. */
const SNAP_PX = 6;
const DRAG_START_PX = 3;
/** A touch that moves less than this still counts as a tap. */
const TAP_SLOP_PX = 6;
const NO_GUIDES: Guides = { x: [], y: [] };
/** Two taps on the same product within this window add it to the earlier selection. */
const DOUBLE_TAP_MS = 350;
/** Holding a finger still this long opens the right-click menu on touch screens. */
const LONG_PRESS_MS = 500;

type Rect = { x: number; y: number; w: number; h: number };

type Gesture =
  | { type: "pan"; lastX: number; lastY: number; /** Touch: a tap that never moved clears the selection. */ tap?: boolean; moved?: boolean }
  | {
      type: "drag";
      origins: Record<string, { x: number; y: number }>;
      startX: number;
      startY: number;
      started: boolean;
      /** Fingers wobble, so a touch needs to travel a little further before it counts as a drag. */
      touch: boolean;
    }
  | { type: "marquee"; startX: number; startY: number; additive: boolean }
  | { type: "pinch"; dist: number; mx: number; my: number };

/** Halo look, in screen pixels so it stays crisp at any zoom. */
const HALO_GAP = 4;
const HALO_STROKE = 2;
const HALO_RADIUS = 7;
/** Half the break in the top edge where the lock sits, and the lock's size. */
const LOCK_GAP = 8;
const LOCK_SIZE = 12;

/**
 * The rounded selection outline around an item. It follows the item's rotated bounds, so the
 * lock badge on a locked item always sits upright at the top center, in a break in the outline.
 */
/** `tour` marks it as the onboarding tour's "selection" target. */
function SelectionHalo({ item, zoom, tour }: { item: Item; zoom: number; tour?: boolean }) {
  // Steps aside (fades to nothing) while the gear is being moved.
  const moving = useUi((u) => u.dragging || u.nudging);
  const b = itemBounds(item);
  const pad = (HALO_GAP + HALO_STROKE) / zoom;
  const w = (b.right - b.left) * PX_PER_INCH + pad * 2;
  const h = (b.bottom - b.top) * PX_PER_INCH + pad * 2;
  const sw = HALO_STROKE / zoom;
  const r = Math.min(HALO_RADIUS / zoom, w / 2, h / 2);
  const g = item.locked ? LOCK_GAP / zoom : 0;
  const [x0, y0, x1, y1, cx] = [sw / 2, sw / 2, w - sw / 2, h - sw / 2, w / 2];
  const d =
    `M${cx + g} ${y0}H${x1 - r}A${r} ${r} 0 0 1 ${x1} ${y0 + r}V${y1 - r}A${r} ${r} 0 0 1 ${x1 - r} ${y1}` +
    `H${x0 + r}A${r} ${r} 0 0 1 ${x0} ${y1 - r}V${y0 + r}A${r} ${r} 0 0 1 ${x0 + r} ${y0}H${cx - g}${g ? "" : "Z"}`;
  const lock = LOCK_SIZE / zoom;
  return (
    <svg
      aria-hidden
      data-tour={tour ? "selection" : undefined}
      className="animate-fade pointer-events-none absolute overflow-visible transition-opacity duration-150"
      style={{ left: b.left * PX_PER_INCH - pad, top: b.top * PX_PER_INCH - pad, width: w, height: h, opacity: moving ? 0 : 1 }}
    >
      <path d={d} fill="none" stroke="var(--color-brand)" strokeWidth={sw} />
      {item.locked && (
        // A solid padlock: rounded body plus shackle, drawn on a 12px box centered on the top edge.
        <g transform={`translate(${cx - lock / 2} ${y0 - lock / 2}) scale(${lock / 12})`}>
          <path d="M3.5 5.5V4a2.5 2.5 0 0 1 5 0v1.5" fill="none" stroke="var(--color-brand)" strokeWidth={1.6} />
          <rect x={1.75} y={5} width={8.5} height={6.5} rx={1.5} fill="var(--color-brand)" />
        </g>
      )}
    </svg>
  );
}

function ItemView({ item }: { item: Item }) {
  const manifest = useCatalog((s) => s.manifest);
  const src = item.image ? canvasImageUrl(manifest, item.kind, item.image) : null;
  return (
    <div
      data-item-id={item.id}
      {...tip(itemName(item))}
      className="absolute"
      style={{
        left: item.x * PX_PER_INCH,
        top: item.y * PX_PER_INCH,
        width: item.width * PX_PER_INCH,
        height: item.height * PX_PER_INCH,
        transform: `rotate(${item.rotation}deg) scaleX(${item.flipX ? -1 : 1})`,
      }}
    >
      {src ? (
        <img src={src} alt={itemName(item)} draggable={false} className="size-full select-none object-fill" />
      ) : item.custom ? (
        <CustomItemView item={item} />
      ) : (
        <div className="size-full bg-surface-hover" />
      )}
    </div>
  );
}

/** Briefly marks "nudging" so the selection halo and the little menu step aside while arrow keys move gear. */
let nudgeTimer: ReturnType<typeof setTimeout> | undefined;
function pulseNudge() {
  useUi.setState({ nudging: true });
  clearTimeout(nudgeTimer);
  nudgeTimer = setTimeout(() => useUi.setState({ nudging: false }), 450);
}

export function Canvas() {
  const ref = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const spaceDown = useRef(false);
  const lastTap = useRef<{ id: string; t: number; prev: string[] } | null>(null);
  const longPress = useRef<{ timer: ReturnType<typeof setTimeout>; x: number; y: number } | null>(null);
  /** When a long press last opened the menu, so the browser's own long-press menu event doesn't open it twice. */
  const longPressAt = useRef(0);
  const tool = useUi((u) => u.tool);
  const dragging = useUi((u) => u.dragging);
  const units = useUi((u) => u.units);

  useEffect(() => {
    void useCatalog.getState().load();
  }, []);

  const [marquee, setMarquee] = useState<Rect | null>(null);
  const [guides, setGuides] = useState<Guides>(NO_GUIDES);
  // Drive the cursor: an open hand while space (or the hand tool) is ready to pan, a closed one mid-pan.
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [panning, setPanning] = useState(false);

  const items = usePlayground((s) => s.items);
  const selected = usePlayground((s) => s.selected);
  const view = usePlayground((s) => s.view);

  // Track viewport size so "place" and zoom buttons know the center.
  useEffect(() => {
    const el = ref.current!;
    const ro = new ResizeObserver(() => usePlayground.getState().setViewport(el.clientWidth, el.clientHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Wheel: pinch / ctrl+wheel zooms at the cursor; plain wheel pans. Needs a non-passive listener.
  useEffect(() => {
    const el = ref.current!;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const s = usePlayground.getState();
      if (e.ctrlKey || e.metaKey) {
        const r = el.getBoundingClientRect();
        s.zoomBy(Math.exp(-clamp(e.deltaY, -50, 50) * 0.01), e.clientX - r.left, e.clientY - r.top);
      } else {
        s.panBy(-e.deltaX, -e.deltaY);
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // Keyboard shortcuts.
  useEffect(() => {
    const typing = (t: EventTarget | null) =>
      t instanceof HTMLElement && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);

    const onKeyDown = (e: KeyboardEvent) => {
      if (typing(e.target)) return;
      // Other modes (like the Equipment List) cover the canvas, so its shortcuts are off there.
      if (useUi.getState().mode !== "playground") return;
      // The right-click menu has the keyboard while it's open (arrows move through it, Esc closes it).
      if (useContextMenu.getState().open) return;
      const s = usePlayground.getState();
      // A shared playground being viewed only pans and zooms.
      const viewOnly = !!useUi.getState().viewing;
      const has = !viewOnly && s.selected.length > 0;
      const mod = e.metaKey || e.ctrlKey;
      const nudge = (e.shiftKey ? 8 : 1) / PX_PER_INCH;
      const key = e.key.toLowerCase();

      if (viewOnly && !(e.code === "Space" || (key === "1" && !mod) || (mod && (key === "=" || key === "+" || key === "-")))) return;
      if (key === "contextmenu" || (e.shiftKey && key === "f10")) {
        // The keyboard way to open the right-click menu: on the selection if there is one, else mid-canvas.
        e.preventDefault();
        const r = ref.current!.getBoundingClientRect();
        const chosen = s.items.filter((i) => s.selected.includes(i.id));
        let x = r.width / 2;
        let y = r.height / 2;
        if (chosen.length) {
          const b = chosen.map(itemBounds);
          const scale = s.view.zoom * PX_PER_INCH;
          x = s.view.x + ((Math.min(...b.map((v) => v.left)) + Math.max(...b.map((v) => v.right))) / 2) * scale;
          y = s.view.y + ((Math.min(...b.map((v) => v.top)) + Math.max(...b.map((v) => v.bottom))) / 2) * scale;
        }
        x = clamp(x, 0, r.width);
        y = clamp(y, 0, r.height);
        openContextMenu({ kind: has ? "object" : "canvas", x: r.left + x, y: r.top + y, canvasX: x, canvasY: y });
      } else if (e.code === "Space") {
        e.preventDefault();
        if (!spaceDown.current) setSpaceHeld(true);
        spaceDown.current = true;
      } else if (mod && key === "z") {
        e.preventDefault();
        (e.shiftKey ? s.redo : s.undo)();
      } else if (mod && key === "y") {
        e.preventDefault();
        s.redo();
      } else if (mod && key === "a") {
        e.preventDefault();
        s.selectMany(s.items.map((i) => i.id));
      } else if (key === "1" && !mod && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        s.fitToContent();
      } else if (mod && (key === "=" || key === "+")) {
        e.preventDefault();
        s.zoomBy(1.25);
      } else if (mod && key === "-") {
        e.preventDefault();
        s.zoomBy(0.8);
      } else if (key === "r" && has && !mod) s.rotateSelected();
      else if ((key === "delete" || key === "backspace" || (key === "d" && !mod)) && has) {
        e.preventDefault();
        s.deleteSelected();
      } else if (key === "g" && !mod && !e.altKey && s.selected.length > 1) {
        e.preventDefault(); // G groups the selection, or ungroups it when it's already one group
        s.toggleGroupSelected();
      } else if ((key === "+" || key === "=") && !mod && !e.altKey) {
        // + opens Add Gear, unless a dialog, menu or the panel already has the screen.
        const ui = useUi.getState();
        if (!ui.viewing && !ui.searchOpen && !document.querySelector('[role="dialog"], [role="menu"]')) {
          e.preventDefault();
          ui.setSearchOpen(true);
        }
      } else if (key === "l" && has && !mod) {
        e.preventDefault();
        s.toggleLockSelected();
      } else if (key === "]" && has) (mod ? s.bringToFront : s.bringForward)();
      else if (key === "[" && has) (mod ? s.sendToBack : s.sendBackward)();
      else if (key === "escape") s.clearSelection();
      else if (key === "arrowleft" && has) (e.preventDefault(), pulseNudge(), s.nudgeSelected(-nudge, 0));
      else if (key === "arrowright" && has) (e.preventDefault(), pulseNudge(), s.nudgeSelected(nudge, 0));
      else if (key === "arrowup" && has) (e.preventDefault(), pulseNudge(), s.nudgeSelected(0, -nudge));
      else if (key === "arrowdown" && has) (e.preventDefault(), pulseNudge(), s.nudgeSelected(0, nudge));
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        spaceDown.current = false;
        setSpaceHeld(false);
      }
    };
    // Releasing space in another window would otherwise leave the hand stuck on.
    const onBlur = () => {
      spaceDown.current = false;
      setSpaceHeld(false);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  const local = (e: { clientX: number; clientY: number }) => {
    const r = ref.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const pinchState = () => {
    const [a, b] = [...pointers.current.values()];
    const r = ref.current!.getBoundingClientRect();
    return {
      dist: Math.hypot(a.x - b.x, a.y - b.y),
      mx: (a.x + b.x) / 2 - r.left,
      my: (a.y + b.y) / 2 - r.top,
    };
  };

  const cancelLongPress = () => {
    if (longPress.current) clearTimeout(longPress.current.timer);
    longPress.current = null;
  };

  /** Opens the right-click menu at a window point: the object menu if something is selected, else the canvas menu. */
  const openMenuAt = (clientX: number, clientY: number, onItem: boolean) => {
    if (useUi.getState().mode !== "playground" || useUi.getState().viewing) return;
    const p = local({ clientX, clientY });
    const kind = onItem && usePlayground.getState().selected.length ? "object" : "canvas";
    openContextMenu({ kind, x: clientX, y: clientY, canvasX: p.x, canvasY: p.y });
  };

  const onPointerDown = (e: React.PointerEvent) => {
    useUi.getState().setSearchOpen(false);
    cancelLongPress();

    // Right click (or Control-click on a Mac): pick what's under the pointer, then let the menu open.
    // A right click on something already selected keeps the whole selection, like Figma and Finder.
    if (e.pointerType !== "touch" && (e.button === 2 || (isMac && e.button === 0 && e.ctrlKey))) {
      const s = usePlayground.getState();
      const id = (e.target as HTMLElement).closest<HTMLElement>("[data-item-id]")?.dataset.itemId;
      if (!id) s.clearSelection();
      else if (!s.selected.includes(id)) s.select(id);
      return;
    }
    try {
      ref.current!.setPointerCapture(e.pointerId);
    } catch {
      /* pointer already gone; gestures still work without capture */
    }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size === 2) {
      gesture.current = { type: "pinch", ...pinchState() };
      setMarquee(null);
      setGuides(NO_GUIDES);
      return;
    }

    const s = usePlayground.getState();
    const itemEl = (e.target as HTMLElement).closest<HTMLElement>("[data-item-id]");
    const p = local(e);

    // Touch: dragging a product moves it, dragging empty canvas pans (no marquee, no tool switching).
    const touch = e.pointerType === "touch";

    if (useUi.getState().viewing) {
      // View-only: every drag pans (a touch tap does nothing).
      gesture.current = { type: "pan", lastX: e.clientX, lastY: e.clientY, tap: touch, moved: false };
      setPanning(!touch);
    } else if (tool === "hand" || spaceDown.current || e.button === 1) {
      gesture.current = { type: "pan", lastX: e.clientX, lastY: e.clientY };
      setPanning(true);
    } else if (touch && !itemEl) {
      gesture.current = { type: "pan", lastX: e.clientX, lastY: e.clientY, tap: true, moved: false };
    } else if (itemEl) {
      const id = itemEl.dataset.itemId!;
      const now = Date.now();
      const tap = lastTap.current;
      if (e.shiftKey) {
        s.select(id, true);
        lastTap.current = null;
      } else if (tap && tap.id === id && now - tap.t < DOUBLE_TAP_MS && tap.prev.length) {
        // Double tap: keep what was selected before the first tap and add this product.
        s.selectMany([...tap.prev, id]);
        lastTap.current = null;
      } else {
        // Remember the selection from before this tap, since a plain tap replaces it.
        lastTap.current = { id, t: now, prev: s.selected.filter((x) => x !== id) };
        if (!s.selected.includes(id)) s.select(id);
      }
      const state = usePlayground.getState();
      const origins: Record<string, { x: number; y: number }> = {};
      for (const i of state.items) if (state.selected.includes(i.id) && !i.locked) origins[i.id] = { x: i.x, y: i.y };
      gesture.current = { type: "drag", origins, startX: e.clientX, startY: e.clientY, started: false, touch };
    } else {
      if (!e.shiftKey) s.clearSelection();
      gesture.current = { type: "marquee", startX: p.x, startY: p.y, additive: e.shiftKey };
    }

    // Touch: holding one finger still opens the right-click menu (iPhones and iPads have no right click).
    if (touch && pointers.current.size === 1) {
      const at = { x: e.clientX, y: e.clientY };
      const onItem = !!itemEl;
      longPress.current = {
        ...at,
        timer: setTimeout(() => {
          longPress.current = null;
          const g = gesture.current;
          if (!g || (g.type === "pan" && g.moved) || (g.type === "drag" && g.started)) return;
          gesture.current = null; // lifting the finger now shouldn't count as a tap
          lastTap.current = null;
          longPressAt.current = Date.now();
          openMenuAt(at.x, at.y, onItem);
        }, LONG_PRESS_MS),
      };
    }
  };

  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault(); // never the browser's own menu on the canvas
    cancelLongPress();
    if (Date.now() - longPressAt.current < 1000) return; // a long press already opened it
    if (gesture.current?.type === "pan" || gesture.current?.type === "drag") gesture.current = null;
    openMenuAt(e.clientX, e.clientY, !!(e.target as HTMLElement).closest("[data-item-id]"));
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const lp = longPress.current;
    if (lp && Math.hypot(e.clientX - lp.x, e.clientY - lp.y) >= TAP_SLOP_PX) cancelLongPress();
    const g = gesture.current;
    if (!g) return;
    const s = usePlayground.getState();

    if (g.type === "pinch") {
      if (pointers.current.size < 2) return;
      const next = pinchState();
      s.zoomBy(next.dist / g.dist, next.mx, next.my);
      s.panBy(next.mx - g.mx, next.my - g.my);
      gesture.current = { type: "pinch", ...next };
    } else if (g.type === "pan") {
      if (g.tap && !g.moved && Math.hypot(e.clientX - g.lastX, e.clientY - g.lastY) < TAP_SLOP_PX) return;
      g.moved = true;
      s.panBy(e.clientX - g.lastX, e.clientY - g.lastY);
      g.lastX = e.clientX;
      g.lastY = e.clientY;
    } else if (g.type === "drag") {
      if (!Object.keys(g.origins).length) return; // everything selected is locked
      const rawX = e.clientX - g.startX;
      const rawY = e.clientY - g.startY;
      if (!g.started) {
        if (Math.hypot(rawX, rawY) < (g.touch ? TAP_SLOP_PX : DRAG_START_PX)) return;
        g.started = true;
        useUi.setState({ dragging: true });
        lastTap.current = null; // a drag isn't a tap
        s.beginTransaction(); // the whole drag is one undo step
      }
      const scale = s.view.zoom * PX_PER_INCH;
      let dx = rawX / scale;
      let dy = rawY / scale;
      // Alt/Option skips snapping for one drag; the Snapping setting turns it off for good.
      if (e.altKey || !useUi.getState().snapping) {
        setGuides(NO_GUIDES);
      } else {
        const moving = s.items.filter((i) => g.origins[i.id]).map((i) => ({ ...i, ...g.origins[i.id] }));
        const others = s.items.filter((i) => !g.origins[i.id]);
        const snapped = snapMove(moving, others, dx, dy, SNAP_PX / scale);
        dx = snapped.dx;
        dy = snapped.dy;
        setGuides(snapped.guides);
      }
      s.dragTo(g.origins, dx, dy);
    } else if (g.type === "marquee") {
      const p = local(e);
      const rect = {
        x: Math.min(g.startX, p.x),
        y: Math.min(g.startY, p.y),
        w: Math.abs(p.x - g.startX),
        h: Math.abs(p.y - g.startY),
      };
      setMarquee(rect);
      const toWorld = (px: number, py: number) => ({
        x: (px - s.view.x) / s.view.zoom / PX_PER_INCH,
        y: (py - s.view.y) / s.view.zoom / PX_PER_INCH,
      });
      const a = toWorld(rect.x, rect.y);
      const b = toWorld(rect.x + rect.w, rect.y + rect.h);
      const hits = s.items
        .filter((i) => {
          const r = itemBounds(i);
          return r.left < b.x && r.right > a.x && r.top < b.y && r.bottom > a.y;
        })
        .map((i) => i.id);
      s.selectMany(hits, g.additive);
    }
  };

  const endGesture = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    cancelLongPress();
    setPanning(false);
    const g = gesture.current;
    if (e.type === "pointerup" && g?.type === "pan" && g.tap && !g.moved) usePlayground.getState().clearSelection();
    if (ref.current?.hasPointerCapture(e.pointerId)) ref.current.releasePointerCapture(e.pointerId);
    if (useUi.getState().dragging) useUi.setState({ dragging: false });
    gesture.current = null; // a lifted pinch finger shouldn't turn into a drag, so just end
    setMarquee(null);
    setGuides(NO_GUIDES);
  };

  // A ½ in or 1 cm dot grid, anchored to the playground's origin. Zoomed out, crowded dots fade to a coarser grid.
  const grid = gridLayers(view.zoom, units);

  return (
    <div
      ref={ref}
      className="absolute inset-0 touch-none"
      style={{
        cursor: panning ? "grabbing" : dragging ? "move" : spaceHeld || tool === "hand" ? "grab" : "default",
        backgroundImage: grid
          .map(
            (g) =>
              `radial-gradient(circle at 1px 1px, color-mix(in srgb, var(--color-grid) ${Math.round(g.opacity * 100)}%, transparent) 0.625px, transparent 0.875px)`,
          )
          .join(", "),
        backgroundSize: grid.map((g) => `${g.step}px ${g.step}px`).join(", "),
        backgroundPosition: grid.map(() => `${view.x - 1}px ${view.y - 1}px`).join(", "),
        WebkitTouchCallout: "none", // no iOS "save image" sheet on a long press
      }}
      onPointerDown={onPointerDown}
      onContextMenu={onContextMenu}
      onPointerMove={onPointerMove}
      onPointerUp={endGesture}
      onPointerCancel={endGesture}
      onLostPointerCapture={endGesture}
    >
      <div
        className="absolute left-0 top-0 origin-top-left"
        style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` }}
      >
        {items.map((item, index) => (
          <div key={item.id} style={{ position: "absolute", zIndex: index }}>
            <ItemView item={item} />
            {selected.includes(item.id) && <SelectionHalo item={item} zoom={view.zoom} tour={selected.length === 1} />}
          </div>
        ))}

        {guides.x.map((x, i) => (
          <div
            key={`gx${i}`}
            className="pointer-events-none absolute bg-[#ff3b8d]"
            style={{ left: x * PX_PER_INCH, top: -5000, height: 10000, width: 1 / view.zoom, zIndex: 100000 }}
          />
        ))}
        {guides.y.map((y, i) => (
          <div
            key={`gy${i}`}
            className="pointer-events-none absolute bg-[#ff3b8d]"
            style={{ top: y * PX_PER_INCH, left: -5000, width: 10000, height: 1 / view.zoom, zIndex: 100000 }}
          />
        ))}
      </div>

      {marquee && (
        <div
          className="pointer-events-none absolute border border-brand bg-brand/10"
          style={{ left: marquee.x, top: marquee.y, width: marquee.w, height: marquee.h }}
        />
      )}
    </div>
  );
}
