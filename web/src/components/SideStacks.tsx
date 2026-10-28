import {
  AlignHorizontalSpaceBetween,
  ArrowDownToLine,
  ArrowUpToLine,
  ChevronDown,
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
import { createPortal } from "react-dom";
import { useState, type ReactNode } from "react";
import { itemName } from "../lib/itemName";
import { plainField } from "../lib/inputProps";
import { isOneGroup, usePlayground } from "../store/playground";
import { useUi } from "../store/ui";
import { Modal } from "./Modal";
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

/** Thin side of common right-angle 1/4" plugs: the room one needs between two pedals. */
const PLUGS = [
  { id: "sp400", name: "SP400", mm: 8.3 },
  { id: "pancake", name: "Pancake", mm: 10 },
  { id: "neutrik", name: "Neutrik", mm: 14.5 },
];

const PLUG_BODY_MM = 26;
const BARREL_MM = [6.35, 14] as const;

/** Top-down view of two right-angle plugs back to back, each an upside-down L: the barrel runs out to its pedal, the body stands between. */
function PlugDrawing({ left, right }: { left: number; right: number }) {
  const k = 3.2;
  const pad = 8;
  const bodyH = PLUG_BODY_MM * k;
  const barrelW = BARREL_MM[1] * k;
  const barrelH = BARREL_MM[0] * k;
  const lw = left * k;
  const rw = right * k;
  const w = pad * 2 + barrelW * 2 + 14.5 * k * 2;
  const seam = w / 2;
  const y0 = 6;
  const fill = "currentColor";
  return (
    <svg viewBox={`0 0 ${w} ${bodyH + 28}`} className="mx-auto h-[88px] w-full text-ink-muted" role="img" aria-label="Two plugs side by side">
      {/* Left plug: body hugging the seam, barrel running left from its top. */}
      <rect x={seam - lw} y={y0} width={lw} height={bodyH} rx={2} fill={fill} opacity={0.55} stroke="var(--color-surface)" strokeWidth={1.5} />
      <rect x={seam - lw - barrelW} y={y0} width={barrelW + 2} height={barrelH} rx={2} fill={fill} opacity={0.55} stroke="var(--color-surface)" strokeWidth={1.5} />
      {right > 0 && (
        <>
          <rect x={seam} y={y0} width={rw} height={bodyH} rx={2} fill={fill} opacity={0.85} stroke="var(--color-surface)" strokeWidth={1.5} />
          <rect x={seam + rw - 2} y={y0} width={barrelW + 2} height={barrelH} rx={2} fill={fill} opacity={0.85} stroke="var(--color-surface)" strokeWidth={1.5} />
        </>
      )}
      {/* Gap measure under the bodies. */}
      <line x1={seam - lw} x2={seam + rw} y1={y0 + bodyH + 8} y2={y0 + bodyH + 8} stroke="currentColor" strokeWidth={1.5} />
      <line x1={seam - lw} x2={seam - lw} y1={y0 + bodyH + 4} y2={y0 + bodyH + 12} stroke="currentColor" strokeWidth={1.5} />
      <line x1={seam + rw} x2={seam + rw} y1={y0 + bodyH + 4} y2={y0 + bodyH + 12} stroke="currentColor" strokeWidth={1.5} />
    </svg>
  );
}

const plugSeg = (on: boolean) =>
  `h-6 rounded-[5px] px-2.5 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-brand ${on ? "bg-surface text-ink shadow-sm" : "text-ink-muted hover:text-ink"}`;

/** "Space By…": type a gap, or pick the plugs that sit between the gear, and the selection lines up left to right with that between them. */
function SpaceByModal({ onClose }: { onClose: () => void }) {
  const units = useUi((u) => u.units);
  const setUnits = useUi((u) => u.setUnits);
  const spaceByGap = usePlayground((s) => s.spaceByGap);
  const fmt = (inches: number, u = units) => (u === "mm" ? String(Math.round(inches * MM_PER_INCH * 10) / 10) : String(+inches.toFixed(3)));
  const [value, setValue] = useState(fmt(lastGap));
  const [plug1, setPlug1] = useState<string | null>(null);
  const [plug2, setPlug2] = useState<string | null>(null);
  const [guideOpen, setGuideOpen] = useState(() => {
    try {
      return localStorage.getItem("pp:plug-guide") !== "closed";
    } catch {
      return true;
    }
  });
  const gap = parseFloat(value);
  const mmOf = (id: string | null) => PLUGS.find((p) => p.id === id)?.mm ?? 0;

  const pick = (which: 1 | 2, id: string | null) => {
    const a = which === 1 ? id : plug1;
    const b = which === 2 ? id : plug2;
    if (which === 1) setPlug1(id);
    else setPlug2(id);
    if (a || b) setValue(fmt((mmOf(a) + mmOf(b)) / MM_PER_INCH));
  };
  const changeUnits = (u: typeof units) => {
    if (u === units) return;
    if (gap >= 0) setValue(fmt(units === "mm" ? gap / MM_PER_INCH : gap, u));
    setUnits(u);
  };
  const toggleGuide = () =>
    setGuideOpen((o) => {
      try {
        localStorage.setItem("pp:plug-guide", o ? "closed" : "open");
      } catch {
        /* storage unavailable */
      }
      return !o;
    });
  const apply = () => {
    if (!(gap >= 0)) return;
    const inches = units === "mm" ? gap / MM_PER_INCH : gap;
    lastGap = inches;
    spaceByGap(inches);
    onClose();
  };
  const cell = (on: boolean) =>
    `h-7 rounded-[5px] text-xs outline-none focus-visible:ring-2 focus-visible:ring-brand ${on ? "bg-brand/15 font-medium text-brand" : "bg-surface-hover text-ink hover:bg-ink/10"}`;
  const size = (mm: number) => (units === "mm" ? `${mm} mm` : `${(mm / MM_PER_INCH).toFixed(2)} in`);

  return (
    <Modal title="Space By" onClose={onClose} closeX>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          apply();
        }}
      >
        <div className="mb-3 flex items-center gap-2">
          <label className="flex h-9 min-w-0 flex-1 items-center gap-1 rounded-control bg-surface-hover px-3 focus-within:ring-2 focus-within:ring-brand">
            <input
              autoFocus
              aria-label={`Gap between items (${units})`}
              inputMode="decimal"
              {...plainField}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onFocus={(e) => e.target.select()}
              className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none"
            />
          </label>
          <div role="group" aria-label="Units" className="flex rounded-control bg-surface-hover p-0.5">
            {(["in", "mm"] as const).map((u) => (
              <button key={u} type="button" aria-pressed={units === u} onClick={() => changeUnits(u)} className={plugSeg(units === u)}>
                {u}
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={toggleGuide}
          aria-expanded={guideOpen}
          className="mb-1 flex w-full items-center gap-1 rounded-[5px] text-xs text-ink-muted outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-brand"
        >
          <ChevronDown size={14} className={guideOpen ? "" : "-rotate-90"} />
          Plug guide
        </button>
        {guideOpen && (
          <div className="mb-3 rounded-control bg-surface-hover/60 p-2">
            <PlugDrawing left={mmOf(plug1) || 10} right={mmOf(plug2)} />
            <div className="mt-1 grid grid-cols-[3.5rem_1fr_1fr] items-center gap-1 text-[11px] text-ink-muted">
              <span />
              <span className="text-center">Plug 1</span>
              <span className="text-center">Plug 2</span>
              {PLUGS.map((p) => (
                <div key={p.id} className="contents">
                  <span className="truncate">{p.name}</span>
                  <button type="button" aria-pressed={plug1 === p.id} onClick={() => pick(1, plug1 === p.id ? null : p.id)} className={cell(plug1 === p.id)}>
                    {size(p.mm)}
                  </button>
                  <button type="button" aria-pressed={plug2 === p.id} onClick={() => pick(2, plug2 === p.id ? null : p.id)} className={cell(plug2 === p.id)}>
                    {size(p.mm)}
                  </button>
                </div>
              ))}
            </div>
            <p className="mt-1.5 text-center text-[11px] text-ink-muted">Pick one plug, or two where jacks face each other. Sizes are approximate.</p>
          </div>
        )}
        <button type="submit" disabled={!(gap >= 0)} className="h-9 w-full btn-primary disabled:opacity-50">
          Apply
        </button>
      </form>
    </Modal>
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
          <Row {...row} icon={<MoveHorizontal size={16} />} label="Space By…" onClick={() => setSpacing(true)} />
          {/* Portaled: the stack is transformed, which would trap a fixed-position modal inside it. */}
          {spacing && createPortal(<SpaceByModal onClose={() => setSpacing(false)} />, document.body)}
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
      className="btn-primary flex h-11 items-center gap-2.5 whitespace-nowrap rounded-[8px] pl-2.5 pr-5 text-[15px] font-semibold tracking-[-0.01em] shadow-[0_6px_20px_rgb(0_0_0/0.25)] outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
    >
      <span className="grid size-6 place-items-center rounded-[6px] bg-white/20">
        <Plus size={16} strokeWidth={2.75} />
      </span>
      Add Gear
    </button>
  );
}
