import { useEffect, useRef, useState } from "react";
import { canvasImageUrl } from "../lib/catalog";
import { clamp, itemBounds, PX_PER_INCH } from "../lib/geometry";
import { snapMove, type Guides } from "../lib/snap";
import type { Item } from "../lib/types";
import { useCatalog } from "../store/catalog";
import { usePlayground } from "../store/playground";
import { CustomItemView } from "./CustomItem";
import { useUi } from "../store/ui";

/** Screen-space distance (px) within which a dragged item snaps to another's edge or center. */
const SNAP_PX = 6;
const DRAG_START_PX = 3;
const NO_GUIDES: Guides = { x: [], y: [] };

type Rect = { x: number; y: number; w: number; h: number };

type Gesture =
  | { type: "pan"; lastX: number; lastY: number }
  | {
      type: "drag";
      origins: Record<string, { x: number; y: number }>;
      startX: number;
      startY: number;
      started: boolean;
    }
  | { type: "marquee"; startX: number; startY: number; additive: boolean }
  | { type: "pinch"; dist: number; mx: number; my: number };

function ItemView({ item, selected, zoom }: { item: Item; selected: boolean; zoom: number }) {
  const manifest = useCatalog((s) => s.manifest);
  const src = item.image ? canvasImageUrl(manifest, item.kind, item.image) : null;
  return (
    <div
      data-item-id={item.id}
      title={item.label}
      className="absolute"
      style={{
        left: item.x * PX_PER_INCH,
        top: item.y * PX_PER_INCH,
        width: item.width * PX_PER_INCH,
        height: item.height * PX_PER_INCH,
        transform: `rotate(${item.rotation}deg) scaleX(${item.flipX ? -1 : 1})`,
        outline: selected ? `${2 / zoom}px solid var(--color-brand)` : "none",
        outlineOffset: 1 / zoom,
      }}
    >
      {src ? (
        <img src={src} alt={item.label} draggable={false} className="size-full select-none object-fill" />
      ) : item.custom ? (
        <CustomItemView item={item} />
      ) : (
        <div className="size-full bg-surface-hover" />
      )}
    </div>
  );
}

export function Canvas() {
  const ref = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const spaceDown = useRef(false);
  const tool = useUi((u) => u.tool);

  useEffect(() => {
    void useCatalog.getState().load();
  }, []);

  const [marquee, setMarquee] = useState<Rect | null>(null);
  const [guides, setGuides] = useState<Guides>(NO_GUIDES);

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
      const s = usePlayground.getState();
      const has = s.selected.length > 0;
      const mod = e.metaKey || e.ctrlKey;
      const nudge = (e.shiftKey ? 8 : 1) / PX_PER_INCH;
      const key = e.key.toLowerCase();

      if (e.code === "Space") {
        spaceDown.current = true;
        e.preventDefault();
      } else if (mod && key === "z") {
        e.preventDefault();
        (e.shiftKey ? s.redo : s.undo)();
      } else if (mod && key === "y") {
        e.preventDefault();
        s.redo();
      } else if (mod && key === "a") {
        e.preventDefault();
        s.selectMany(s.items.map((i) => i.id));
      } else if (mod && (key === "=" || key === "+")) {
        e.preventDefault();
        s.zoomBy(1.25);
      } else if (mod && key === "-") {
        e.preventDefault();
        s.zoomBy(0.8);
      } else if (key === "r" && has && !mod) s.rotateSelected();
      else if (key === "f" && has && !mod) s.flipSelected();
      else if ((key === "delete" || key === "backspace" || (key === "d" && !mod)) && has) {
        e.preventDefault();
        s.deleteSelected();
      } else if (key === "]" && has) (mod ? s.bringToFront : s.bringForward)();
      else if (key === "[" && has) (mod ? s.sendToBack : s.sendBackward)();
      else if (key === "escape") s.clearSelection();
      else if (key === "arrowleft" && has) (e.preventDefault(), s.nudgeSelected(-nudge, 0));
      else if (key === "arrowright" && has) (e.preventDefault(), s.nudgeSelected(nudge, 0));
      else if (key === "arrowup" && has) (e.preventDefault(), s.nudgeSelected(0, -nudge));
      else if (key === "arrowdown" && has) (e.preventDefault(), s.nudgeSelected(0, nudge));
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") spaceDown.current = false;
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
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

  const onPointerDown = (e: React.PointerEvent) => {
    useUi.getState().setSearchOpen(false);
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

    if (tool === "hand" || spaceDown.current || e.button === 1) {
      gesture.current = { type: "pan", lastX: e.clientX, lastY: e.clientY };
    } else if (itemEl) {
      const id = itemEl.dataset.itemId!;
      if (e.shiftKey) s.select(id, true);
      else if (!s.selected.includes(id)) s.select(id);
      const state = usePlayground.getState();
      const origins: Record<string, { x: number; y: number }> = {};
      for (const i of state.items) if (state.selected.includes(i.id)) origins[i.id] = { x: i.x, y: i.y };
      gesture.current = { type: "drag", origins, startX: e.clientX, startY: e.clientY, started: false };
    } else {
      if (!e.shiftKey) s.clearSelection();
      gesture.current = { type: "marquee", startX: p.x, startY: p.y, additive: e.shiftKey };
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
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
      s.panBy(e.clientX - g.lastX, e.clientY - g.lastY);
      g.lastX = e.clientX;
      g.lastY = e.clientY;
    } else if (g.type === "drag") {
      const rawX = e.clientX - g.startX;
      const rawY = e.clientY - g.startY;
      if (!g.started) {
        if (Math.hypot(rawX, rawY) < DRAG_START_PX) return;
        g.started = true;
        s.beginTransaction(); // the whole drag is one undo step
      }
      const scale = s.view.zoom * PX_PER_INCH;
      let dx = rawX / scale;
      let dy = rawY / scale;
      if (e.altKey) {
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
    if (ref.current?.hasPointerCapture(e.pointerId)) ref.current.releasePointerCapture(e.pointerId);
    gesture.current = null; // a lifted pinch finger shouldn't turn into a drag, so just end
    setMarquee(null);
    setGuides(NO_GUIDES);
  };

  return (
    <div
      ref={ref}
      className="absolute inset-0 touch-none"
      style={{
        cursor: tool === "hand" ? "grab" : "default",
        backgroundImage: "radial-gradient(circle, var(--color-grid) 1px, transparent 1px)",
        backgroundSize: `${24 * view.zoom}px ${24 * view.zoom}px`,
        backgroundPosition: `${view.x}px ${view.y}px`,
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endGesture}
      onPointerCancel={endGesture}
    >
      <div
        className="absolute left-0 top-0 origin-top-left"
        style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` }}
      >
        {items.map((item, index) => (
          <div key={item.id} style={{ position: "absolute", zIndex: index }}>
            <ItemView item={item} selected={selected.includes(item.id)} zoom={view.zoom} />
          </div>
        ))}

        {guides.x.map((x) => (
          <div
            key={`gx${x}`}
            className="pointer-events-none absolute bg-[#ff3b8d]"
            style={{ left: x * PX_PER_INCH, top: -5000, height: 10000, width: 1 / view.zoom, zIndex: 100000 }}
          />
        ))}
        {guides.y.map((y) => (
          <div
            key={`gy${y}`}
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
