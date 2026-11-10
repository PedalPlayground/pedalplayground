import { Cable, Ellipsis, Group, Lock, LockOpen, Pencil, Ruler, RotateCw, Ungroup } from "lucide-react";
import { useRef } from "react";
import { itemBounds, PX_PER_INCH } from "../lib/geometry";
import { isOneGroup, usePlayground } from "../store/playground";
import { useUi } from "../store/ui";
import { PHONE_QUERY, useMediaQuery } from "../lib/viewport";
import { openContextMenu } from "./ContextMenu";
import { tip } from "./Tooltip";
import { barIconIdle, barIconActive } from "./toolbarStyles";

const GAP = 12; // between the selection and the pill
const GAP_BETWEEN = 2; // between buttons
const PAD = 6; // inside the pill (as the side menus)
/** Where the pill stops short of the bottom edge: touch screens have the full-width nav there. */
const NAV_ROOM = 84;

/** Icon buttons: bigger on touch screens. */
const button = "press grid size-8 place-items-center rounded-control outline-none focus-visible:ring-2 focus-visible:ring-brand pointer-coarse:size-11 pointer-coarse:rounded-control [&_svg]:size-4 pointer-coarse:[&_svg]:size-[21px]";

/**
 * A little menu that follows the selection: Lock, Rotate, Plugs (one pedal), Edit (custom gear) and ••• for the full
 * right-click menu. On phones (`rail`) the same buttons stack in the right-hand rail under Add Gear instead.
 */
export function SelectionMiniMenu({ rail = false }: { rail?: boolean }) {
  const s = usePlayground();
  const touch = useMediaQuery("(pointer: coarse)");
  const setEditing = useUi((u) => u.setEditing);
  const setSpacing = useUi((u) => u.setSpacingOpen);
  const dragging = useUi((u) => u.dragging || u.nudging);
  const viewing = useUi((u) => !!u.viewing);
  // Phones: the Add Gear / Replace / Edit and Space Between sheets cover the bottom of the screen, and the pill would peek out above it.
  const phone = useMediaQuery(PHONE_QUERY);
  const sheetOpen = useUi((u) => u.searchOpen || u.spacingOpen) && phone;
  const wrap = useRef<HTMLDivElement>(null);
  if (!s.selected.length || dragging || viewing || sheetOpen || !s.viewport.w) return null;
  // Phones show it in the rail; elsewhere it follows the selection.
  if (rail !== phone) return null;
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
  const spaceable = chosen.length > 1;
  const pedal = chosen.length === 1 && chosen[0].kind === "pedal" ? chosen[0] : undefined;
  const buttons = 3 + (editable ? 1 : 0) + (spaceable ? 1 : 0) + (pedal ? 1 : 0);
  const size = touch ? 44 : 32;
  const H = size + PAD * 2;
  const halfW = (buttons * size + (buttons - 1) * GAP_BETWEEN + PAD * 2) / 2;
  const cx = Math.min(Math.max((left + right) / 2, s.coverLeft + halfW + 8), s.viewport.w - halfW - 8);
  const below = bottom + GAP;
  const y = below + H > s.viewport.h - (touch ? NAV_ROOM : 8) ? Math.max(8, top - GAP - H) : below;
  const locked = chosen.every((i) => i.locked);
  const several = chosen.length > 1;
  const grouped = several && isOneGroup(chosen);

  const side = rail ? "left" : "bottom";
  const more = () => {
    const el = wrap.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const canvas = el.closest("main")?.getBoundingClientRect();
    // In the rail the menu opens to its left; under the selection, below it.
    const x = rail ? r.left - 8 : r.right - 8;
    const y = rail ? r.top : r.bottom + 6;
    openContextMenu({ kind: "object", x, y, canvasX: x - (canvas?.left ?? 0), canvasY: y - (canvas?.top ?? 0) });
  };

  return (
    <div
      ref={wrap}
      className={
        rail
          ? "flex flex-col items-center gap-0.5 rounded-full bg-surface p-1.5 shadow-float"
          : "absolute z-10 flex -translate-x-1/2 items-center gap-0.5 rounded-panel bg-surface p-1.5 shadow-float"
      }
      style={rail ? undefined : { left: cx, top: y }}
      // Clicks here are for the menu, not the canvas behind it.
      onPointerDown={(e) => e.stopPropagation()}
    >
      <button
        aria-label={locked ? "Unlock" : "Lock in Place"}
        aria-pressed={locked}
        {...tip(locked ? "Unlock" : "Lock in Place", { shortcut: "L", side })}
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
          {...tip(grouped ? "Ungroup" : "Group", { shortcut: "G", side })}
          onClick={s.toggleGroupSelected}
          className={`${button} ${grouped ? barIconActive : barIconIdle}`}
        >
          {grouped ? <Ungroup size={16} /> : <Group size={16} />}
        </button>
      ) : (
        <button aria-label="Rotate 90°" {...tip("Rotate 90°", { shortcut: "R", side })} onClick={s.rotateSelected} className={`${button} ${barIconIdle}`}>
          <RotateCw size={16} />
        </button>
      )}
      {spaceable && (
        <button aria-label="Space Between" {...tip("Space Between", { side })} onClick={() => setSpacing(true)} className={`${button} ${barIconIdle}`}>
          <Ruler size={16} />
        </button>
      )}
      {pedal && (
        <button aria-label="Plugs" {...tip("Plugs", { shortcut: "P", side })} onClick={() => useUi.getState().setPlugEditing(pedal.id)} className={`${button} ${barIconIdle}`}>
          <Cable size={16} />
        </button>
      )}
      {editable && (
        <button
          aria-label={editable.kind === "pedalboard" ? "Edit Board" : "Edit"}
          {...tip(editable.kind === "pedalboard" ? "Edit Board" : "Edit", { side })}
          onClick={() => setEditing(true)}
          className={`${button} ${barIconIdle}`}
        >
          <Pencil size={15} />
        </button>
      )}
      <button aria-label="More" aria-haspopup="menu" {...tip("More", { side })} onClick={more} className={`${button} ${barIconIdle}`}>
        <Ellipsis size={16} />
      </button>
    </div>
  );
}
