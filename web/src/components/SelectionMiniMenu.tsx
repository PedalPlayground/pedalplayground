import { Ellipsis, Group, Lock, LockOpen, Pencil, Ruler, RotateCw, Ungroup } from "lucide-react";
import { useRef } from "react";
import { itemBounds, PX_PER_INCH } from "../lib/geometry";
import { isOneGroup, usePlayground } from "../store/playground";
import { useUi } from "../store/ui";
import { useMediaQuery } from "../lib/viewport";
import { WIDE_QUERY } from "./SideStacks";
import { openContextMenu } from "./ContextMenu";
import { tip } from "./Tooltip";
import { barIconIdle, barIconActive } from "./toolbarStyles";

const GAP = 12; // between the selection and the pill
const GAP_BETWEEN = 2; // between buttons
const PAD = 4; // inside the pill
/** Where the pill stops short of the bottom edge: touch screens have the full-width nav there. */
const NAV_ROOM = 84;

/** Icon buttons: bigger on touch screens. */
const button = "press grid size-7 place-items-center rounded-[5px] outline-none focus-visible:ring-2 focus-visible:ring-brand pointer-coarse:size-11 pointer-coarse:rounded-[8px] [&_svg]:size-4 pointer-coarse:[&_svg]:size-[21px]";

/** A little menu that follows the selection: Lock, Rotate, Edit (custom gear) and ••• for the full right-click menu. Not on phones. */
export function SelectionMiniMenu() {
  const s = usePlayground();
  const touch = useMediaQuery("(pointer: coarse)");
  // The Space Between drawer docks beside the canvas, so it only exists on larger screens.
  const wide = useMediaQuery(WIDE_QUERY);
  const setEditing = useUi((u) => u.setEditing);
  const setSpacing = useUi((u) => u.setSpacingOpen);
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
  const editable = chosen.length === 1 && chosen[0].custom ? chosen[0] : undefined;
  // Lock, Rotate/Group, (Edit), More.
  const spaceable = wide && chosen.length > 1;
  const buttons = 3 + (editable ? 1 : 0) + (spaceable ? 1 : 0);
  const size = touch ? 44 : 28;
  const H = size + PAD * 2;
  const halfW = (buttons * size + (buttons - 1) * GAP_BETWEEN + PAD * 2) / 2;
  const cx = Math.min(Math.max((left + right) / 2, s.coverLeft + halfW + 8), s.viewport.w - halfW - 8);
  const below = bottom + GAP;
  const y = below + H > s.viewport.h - (touch ? NAV_ROOM : 8) ? Math.max(8, top - GAP - H) : below;
  const locked = chosen.every((i) => i.locked);
  const several = chosen.length > 1;
  const grouped = several && isOneGroup(chosen);

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
        className={`${button} ${locked ? barIconActive : barIconIdle}`}
      >
        {locked ? <Lock size={16} /> : <LockOpen size={16} />}
      </button>
      {/* With several pieces selected, grouping takes Rotate's place. */}
      {several ? (
        <button
          aria-label={grouped ? "Ungroup" : "Group"}
          aria-pressed={grouped}
          {...tip(grouped ? "Ungroup" : "Group", { shortcut: "G", side: "bottom" })}
          onClick={s.toggleGroupSelected}
          className={`${button} ${grouped ? barIconActive : barIconIdle}`}
        >
          {grouped ? <Ungroup size={16} /> : <Group size={16} />}
        </button>
      ) : (
        <button aria-label="Rotate 90°" {...tip("Rotate 90°", { shortcut: "R", side: "bottom" })} onClick={s.rotateSelected} className={`${button} ${barIconIdle}`}>
          <RotateCw size={16} />
        </button>
      )}
      {spaceable && (
        <button aria-label="Space Between" {...tip("Space Between", { side: "bottom" })} onClick={() => setSpacing(true)} className={`${button} ${barIconIdle}`}>
          <Ruler size={16} />
        </button>
      )}
      {editable && (
        <button
          aria-label={editable.kind === "pedalboard" ? "Edit Board" : "Edit"}
          {...tip(editable.kind === "pedalboard" ? "Edit Board" : "Edit", { side: "bottom" })}
          onClick={() => setEditing(true)}
          className={`${button} ${barIconIdle}`}
        >
          <Pencil size={15} />
        </button>
      )}
      <button aria-label="More" aria-haspopup="menu" {...tip("More", { side: "bottom" })} onClick={more} className={`${button} ${barIconIdle}`}>
        <Ellipsis size={16} />
      </button>
    </div>
  );
}
