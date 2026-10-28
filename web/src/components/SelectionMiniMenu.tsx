import { Ellipsis, Lock, LockOpen, RotateCw } from "lucide-react";
import { useRef } from "react";
import { itemBounds, PX_PER_INCH } from "../lib/geometry";
import { usePlayground } from "../store/playground";
import { useUi } from "../store/ui";
import { openContextMenu } from "./ContextMenu";
import { tip } from "./Tooltip";
import { barIconButton, barIconIdle, barIconActive } from "./toolbarStyles";

const GAP = 12; // between the selection and the pill
const HALF_W = 54; // half the pill's width, for keeping it on screen
const H = 36;

/** A little menu that follows the selection: Lock, Rotate, and ••• for the full right-click menu. Not on phones. */
export function SelectionMiniMenu() {
  const s = usePlayground();
  const dragging = useUi((u) => u.dragging || u.nudging);
  const viewing = useUi((u) => !!u.viewing);
  const wrap = useRef<HTMLDivElement>(null);
  if (!s.selected.length || dragging || viewing || !s.viewport.w) return null;
  const chosen = s.items.filter((i) => s.selected.includes(i.id));
  if (!chosen.length) return null;

  // The selection's box on screen.
  const b = chosen.map(itemBounds);
  const scale = s.view.zoom * PX_PER_INCH;
  const left = s.view.x + Math.min(...b.map((v) => v.left)) * scale;
  const right = s.view.x + Math.max(...b.map((v) => v.right)) * scale;
  const bottom = s.view.y + Math.max(...b.map((v) => v.bottom)) * scale;
  const top = s.view.y + Math.min(...b.map((v) => v.top)) * scale;
  // Centered under it; above it when there's no room below; kept on screen, clear of the docked gear panel.
  const cx = Math.min(Math.max((left + right) / 2, s.coverLeft + HALF_W + 8), s.viewport.w - HALF_W - 8);
  const below = bottom + GAP;
  const y = below + H > s.viewport.h - 8 ? Math.max(8, top - GAP - H) : below;
  const locked = chosen.every((i) => i.locked);

  const more = () => {
    const el = wrap.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const canvas = el.offsetParent?.getBoundingClientRect();
    openContextMenu({
      kind: "object",
      x: r.right - 8,
      y: r.bottom + 6,
      canvasX: r.right - 8 - (canvas?.left ?? 0),
      canvasY: r.bottom + 6 - (canvas?.top ?? 0),
    });
  };

  return (
    <div
      ref={wrap}
      className="absolute z-10 flex -translate-x-1/2 items-center gap-0.5 rounded-[10px] border border-chrome-line bg-surface p-1 shadow-[0_4px_16px_rgb(0_0_0/0.18)]"
      style={{ left: cx, top: y }}
      // Clicks here are for the menu, not the canvas behind it.
      onPointerDown={(e) => e.stopPropagation()}
    >
      <button
        aria-label={locked ? "Unlock" : "Lock in Place"}
        aria-pressed={locked}
        {...tip(locked ? "Unlock" : "Lock in Place", { shortcut: "L", side: "bottom" })}
        onClick={s.toggleLockSelected}
        className={`${barIconButton} ${locked ? barIconActive : barIconIdle}`}
      >
        {locked ? <Lock size={16} /> : <LockOpen size={16} />}
      </button>
      <button aria-label="Rotate 90°" {...tip("Rotate 90°", { shortcut: "R", side: "bottom" })} onClick={s.rotateSelected} className={`${barIconButton} ${barIconIdle}`}>
        <RotateCw size={16} />
      </button>
      <button aria-label="More" aria-haspopup="menu" {...tip("More", { side: "bottom" })} onClick={more} className={`${barIconButton} ${barIconIdle}`}>
        <Ellipsis size={16} />
      </button>
    </div>
  );
}
