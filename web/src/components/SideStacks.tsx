import {
  AlignHorizontalSpaceBetween,
  ArrowDownToLine,
  ArrowUpToLine,
  ChevronsLeft,
  ChevronsRight,
  Fullscreen,
  Group,
  Lock,
  LockOpen,
  Pencil,
  Plus,
  Redo2,
  Replace,
  RotateCw,
  SquareArrowOutUpRight,
  MoveHorizontal,
  Trash2,
  Undo2,
  Ungroup,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { itemName } from "../lib/itemName";
import { plainField } from "../lib/inputProps";
import { isOneGroup, usePlayground } from "../store/playground";
import { useUi } from "../store/ui";
import { tip } from "./Tooltip";
import { barPanel } from "./toolbarStyles";

/** Larger screens: the selection menu and the canvas controls float down the sides as stacks, instead of bars. */
export const WIDE_QUERY = "(min-width: 1024px)";

const useCollapsed = (key: string) => {
  const storageKey = `pp:stack-${key}`;
  const [collapsed, set] = useState(() => {
    try {
      return localStorage.getItem(storageKey) === "collapsed";
    } catch {
      return false;
    }
  });
  const toggle = () =>
    set((c) => {
      try {
        localStorage.setItem(storageKey, c ? "open" : "collapsed");
      } catch {
        /* storage unavailable */
      }
      return !c;
    });
  return [collapsed, toggle] as const;
};

interface RowProps {
  icon: ReactNode;
  label: string;
  shortcut?: string;
  onClick: () => void;
  collapsed: boolean;
  /** Which way a tooltip points when collapsed (away from the screen edge the stack hangs on). */
  side: "left" | "right";
  danger?: boolean;
  pressed?: boolean;
  disabled?: boolean;
  dataTour?: string;
}

/** One stack row: icon + text, or just the icon when the stack is collapsed (its name moves to a tooltip). */
function Row({ icon, label, shortcut, onClick, collapsed, side, danger, pressed, disabled, dataTour }: RowProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={pressed}
      data-tour={dataTour}
      {...(collapsed ? tip(label, { shortcut, side }) : {})}
      className={`press flex h-8 shrink-0 items-center rounded-[5px] text-[13px] font-medium tracking-[-0.01em] outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-40 ${
        collapsed ? "w-8 justify-center" : "w-full gap-2.5 px-2"
      } ${
        danger
          ? "text-danger hover:bg-danger/10 active:bg-danger/20"
          : pressed
            ? "bg-brand/10 text-brand active:bg-brand/20"
            : "text-ink hover:bg-surface-hover active:bg-chrome-line"
      }`}
    >
      <span className="grid size-[18px] shrink-0 place-items-center">{icon}</span>
      {!collapsed && (
        <>
          <span className="flex-1 truncate text-left">{label}</span>
          {shortcut && <span className="text-[11px] font-normal text-ink-muted">{shortcut}</span>}
        </>
      )}
    </button>
  );
}

const Divider = () => <span className="my-1 h-px shrink-0 bg-line" />;

/** The stack's frame: a header with the collapse toggle (and an optional title), then its rows. */
function Shell({
  edge,
  title,
  collapsed,
  onToggle,
  children,
  className = "",
  style,
  dataTour,
}: {
  edge: "left" | "right";
  title?: string;
  collapsed: boolean;
  onToggle: () => void;
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
  dataTour?: string;
}) {
  // The chevrons point toward the screen edge to collapse, and away from it to expand.
  const Chevron = (edge === "left") === !collapsed ? ChevronsLeft : ChevronsRight;
  return (
    <div
      data-tour={dataTour}
      style={style}
      className={`animate-enter absolute top-1/2 z-10 flex -translate-y-1/2 flex-col gap-0.5 ${barPanel} ${collapsed ? "w-[calc(2rem+0.75rem+2px)]" : "w-48"} [--enter-y:0px] ${edge === "left" ? "[--enter-x:-10px]" : "[--enter-x:10px]"} ${className}`}
    >
      <div className={`flex h-8 items-center ${collapsed ? "justify-center" : "justify-between pl-2"}`}>
        {!collapsed && <span className="truncate text-[12px] font-semibold tracking-[-0.01em] text-ink-muted">{title}</span>}
        <button
          type="button"
          onClick={onToggle}
          aria-label={collapsed ? "Expand menu" : "Collapse menu"}
          aria-expanded={!collapsed}
          {...tip(collapsed ? "Expand" : "Collapse", { side: edge === "left" ? "right" : "left" })}
          className="press grid size-8 place-items-center rounded-[5px] text-ink-muted outline-none hover:bg-surface-hover hover:text-ink focus-visible:ring-2 focus-visible:ring-brand"
        >
          <Chevron size={16} />
        </button>
      </div>
      {children}
    </div>
  );
}

const MM_PER_INCH = 25.4;
/** The last custom gap used (in inches), so the next "Space By…" starts there. */
let lastGap = 0.25;

/** "Space By…": type a gap in the current units and the selection lines up left to right with exactly that between them. */
function SpaceByEditor({ onClose }: { onClose: () => void }) {
  const units = useUi((u) => u.units);
  const spaceByGap = usePlayground((s) => s.spaceByGap);
  const [value, setValue] = useState(units === "mm" ? String(Math.round(lastGap * MM_PER_INCH)) : String(+lastGap.toFixed(3)));
  const input = useRef<HTMLInputElement>(null);
  const gap = parseFloat(value);
  const apply = () => {
    if (!(gap >= 0)) return;
    const inches = units === "mm" ? gap / MM_PER_INCH : gap;
    lastGap = inches;
    spaceByGap(inches);
    onClose();
  };
  return (
    <form
      className="flex items-center gap-1.5 px-1 pb-1"
      onSubmit={(e) => {
        e.preventDefault();
        apply();
      }}
    >
      <label className="flex h-8 min-w-0 flex-1 items-center gap-1 rounded-[5px] bg-surface-hover px-2 focus-within:ring-2 focus-within:ring-brand">
        <input
          ref={input}
          autoFocus
          aria-label={`Gap between items (${units})`}
          inputMode="decimal"
          {...plainField}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && (e.stopPropagation(), onClose())}
          onFocus={(e) => e.target.select()}
          className="h-full min-w-0 flex-1 bg-transparent text-right text-[13px] outline-none"
        />
        <span aria-hidden className="text-xs text-ink-muted">
          {units}
        </span>
      </label>
      <button type="submit" disabled={!(gap >= 0)} className="h-8 rounded-[5px] px-2.5 text-[13px] btn-primary disabled:opacity-50">
        Apply
      </button>
    </form>
  );
}

/** Left side: what you can do with the selected gear. Slides clear of the gear panel when that's open. */
export function ObjectStack() {
  const s = usePlayground();
  const setReplacing = useUi((u) => u.setReplacing);
  const setEditing = useUi((u) => u.setEditing);
  const [collapsed, toggle] = useCollapsed("left");
  const [spacing, setSpacing] = useState(false);
  if (!s.selected.length) return null;
  const single = s.selected.length === 1 ? s.items.find((i) => i.id === s.selected[0]) : undefined;
  const picked = s.items.filter((i) => s.selected.includes(i.id));
  const locked = picked.every((i) => i.locked);
  const grouped = isOneGroup(picked);
  const row = { collapsed, side: "right" as const };
  return (
    <Shell
      edge="left"
      dataTour="object-menu"
      title={single ? itemName(single) : `${s.selected.length} selected`}
      collapsed={collapsed}
      onToggle={toggle}
      className="left-4"
      style={s.coverLeft ? { left: s.coverLeft + 16 } : undefined}
    >
      <Row {...row} icon={locked ? <Lock size={16} /> : <LockOpen size={16} />} label={locked ? "Unlock" : "Lock in Place"} shortcut="L" onClick={s.toggleLockSelected} pressed={locked} />
      <Row {...row} icon={<RotateCw size={16} />} label="Rotate 90°" shortcut="R" onClick={s.rotateSelected} />
      {s.selected.length >= 2 && (
        <Row
          {...row}
          icon={grouped ? <Ungroup size={16} /> : <Group size={16} />}
          label={grouped ? "Ungroup" : "Group"}
          shortcut="G"
          onClick={s.toggleGroupSelected}
          pressed={grouped}
        />
      )}
      {s.selected.length >= 3 && <Row {...row} icon={<AlignHorizontalSpaceBetween size={16} />} label="Space Evenly" onClick={s.distributeHorizontally} />}
      {s.selected.length >= 2 && (
        <>
          <Row
            {...row}
            icon={<MoveHorizontal size={16} />}
            label="Space By…"
            onClick={() => {
              // Collapsed, there's no room for the field: open the stack first.
              if (collapsed) toggle();
              setSpacing((o) => !o);
            }}
            pressed={spacing && !collapsed}
          />
          {spacing && !collapsed && <SpaceByEditor onClose={() => setSpacing(false)} />}
        </>
      )}
      <Divider />
      <Row {...row} icon={<ArrowUpToLine size={16} />} label="Move Forward" shortcut="]" onClick={s.bringForward} />
      <Row {...row} icon={<ArrowDownToLine size={16} />} label="Move Back" shortcut="[" onClick={s.sendBackward} />
      <Divider />
      {single?.custom && (
        <Row {...row} icon={<Pencil size={15} />} label={single.kind === "pedalboard" ? "Edit Board" : "Edit"} onClick={() => setEditing(true)} />
      )}
      {single && !single.custom && <Row {...row} icon={<Replace size={15} />} label="Replace" onClick={() => setReplacing(true)} />}
      <Row {...row} icon={<Trash2 size={16} />} label="Remove" shortcut="Del" onClick={s.deleteSelected} danger />
    </Shell>
  );
}

/** Right side: zoom, undo and share. A shared playground being viewed keeps just the zoom controls. */
export function CanvasStack({ viewOnly, onShare }: { viewOnly: boolean; onShare: () => void }) {
  const zoomBy = usePlayground((s) => s.zoomBy);
  const fit = usePlayground((s) => s.fitToContent);
  const undo = usePlayground((s) => s.undo);
  const redo = usePlayground((s) => s.redo);
  const canUndo = usePlayground((s) => s.past.length > 0);
  const canRedo = usePlayground((s) => s.future.length > 0);
  const [collapsed, toggle] = useCollapsed("right");
  const row = { collapsed, side: "left" as const };
  const mod = /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl+";
  return (
    <Shell edge="right" title="Canvas" collapsed={collapsed} onToggle={toggle} className="right-4">
      <Row {...row} icon={<ZoomIn size={17} />} label="Zoom In" shortcut={`${mod}+`} onClick={() => zoomBy(1.25)} />
      <Row {...row} icon={<ZoomOut size={17} />} label="Zoom Out" shortcut={`${mod}−`} onClick={() => zoomBy(0.8)} />
      <Row {...row} icon={<Fullscreen size={16} />} label="Center & Fit" shortcut="1" onClick={fit} />
      {!viewOnly && (
        <>
          <Divider />
          <Row {...row} icon={<Undo2 size={16} />} label="Undo" shortcut={`${mod}Z`} onClick={undo} disabled={!canUndo} />
          <Row {...row} icon={<Redo2 size={16} />} label="Redo" shortcut={`⇧${mod}Z`} onClick={redo} disabled={!canRedo} />
          <Divider />
          <Row {...row} icon={<SquareArrowOutUpRight size={15} />} label="Share" onClick={onShare} dataTour="share" />
        </>
      )}
    </Shell>
  );
}

/** Bottom center, on its own: the main way to add gear. A little bigger than the buttons it replaces. */
export function AddGearButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      data-tour="add"
      {...tip("Add Gear", { shortcut: "+", side: "top" })}
      className="btn-primary flex h-11 items-center gap-2 whitespace-nowrap rounded-[8px] pl-4 pr-4 text-[15px] font-semibold tracking-[-0.01em] shadow-[0_6px_20px_rgb(0_0_0/0.25)] outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
    >
      <Plus size={18} strokeWidth={2.5} />
      Add Gear
      <kbd className="ml-5 font-sans text-[13px] font-medium opacity-60 pointer-coarse:hidden">+</kbd>
    </button>
  );
}
