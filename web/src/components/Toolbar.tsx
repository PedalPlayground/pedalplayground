import { Fullscreen, Hand, MousePointer2, Plus, Redo2, SquareArrowOutUpRight, Undo2, ZoomIn, ZoomOut } from "lucide-react";
import type { ReactNode } from "react";
import { PHONE_QUERY, useMediaQuery } from "../lib/viewport";
import { usePlayground } from "../store/playground";
import { useUi } from "../store/ui";
import { SettingsMenu } from "./SettingsMenu";
import { tip } from "./Tooltip";
import { barDivider, barGhostButton, barIconActive, barIconButton, barIconIdle, barPanel, phoneBar } from "./toolbarStyles";

function IconButton({
  label,
  shortcut,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  shortcut?: string;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <button
      {...tip(label, { shortcut })}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={`${barIconButton} ${active ? barIconActive : barIconIdle}`}
    >
      {children}
    </button>
  );
}

/** The "pedal and board" glyph on the Add button, drawn from the Figma mockup. Also on the empty canvas's Add Gear. */
export function AddGlyph() {
  return (
    <span className="flex items-center gap-1" aria-hidden>
      <svg width="10" height="12" viewBox="0 0 10 12" className="drop-shadow-[0_0_1px_rgb(255_255_255/0.25)]">
        <rect width="10" height="12" rx="2" fill="#000" />
        <rect x="1" y="1" width="2" height="2" rx="1" fill="currentColor" className="text-brand" />
        <rect x="4" y="1" width="2" height="2" rx="1" fill="currentColor" className="text-brand" />
        <rect x="7" y="1" width="2" height="2" rx="1" fill="currentColor" className="text-brand" />
        <path d="M1.5 4.9 Q5 6.6 8.5 4.9" fill="none" stroke="currentColor" strokeWidth="0.8" strokeLinecap="round" className="text-brand" />
        <rect x="1" y="7" width="8" height="4" rx="1" fill="currentColor" opacity="0.7" className="text-brand" />
      </svg>
      {/* Same pedalboard shape as the logo icon. */}
      <svg width="18" height="12" viewBox="0 0 24 16" fill="#000" className="drop-shadow-[0_0_1px_rgb(255_255_255/0.25)]">
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M24 16H0V0H24V16ZM2.08696 11V13H21.913V11H2.08696ZM2.08696 7V9H21.913V7H2.08696ZM2.08696 3V5H21.913V3H2.08696Z"
        />
      </svg>
    </span>
  );
}

/** Phones: Add Gear as a round purple button at the top of the right-hand rail. */
export function PhoneAddButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      data-tour="add"
      aria-label="Add Gear"
      className="btn-primary press grid size-14 place-items-center rounded-full shadow-pop outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
    >
      <Plus size={26} strokeWidth={2.75} />
    </button>
  );
}

/**
 * The hand/select tool buttons are hidden for now: select is the default, and space-drag or the middle mouse button
 * still pans. Set to true to bring them back.
 */
const SHOW_TOOL_SWITCH = false;

const divider = <span className={barDivider} />;

/** `viewOnly` (a shared playground being viewed) keeps just the zoom controls. */
export function Toolbar({ onPlace, onShare, viewOnly = false }: { onPlace: () => void; onShare: () => void; viewOnly?: boolean }) {
  const { tool, setTool } = useUi();
  const zoomBy = usePlayground((s) => s.zoomBy);
  const fit = usePlayground((s) => s.fitToContent);
  const undo = usePlayground((s) => s.undo);
  const redo = usePlayground((s) => s.redo);
  const canUndo = usePlayground((s) => s.past.length > 0);
  const canRedo = usePlayground((s) => s.future.length > 0);
  const phone = useMediaQuery(PHONE_QUERY);

  // Phones: a floating dark bar like the browse pages' tab bar (icons over labels). Add Gear lives in the right-hand rail
  // (PhoneRail) instead. Pinch zooms.
  if (phone) {
    const btn =
      "press flex min-w-0 flex-1 flex-col items-center justify-center gap-1 self-stretch rounded-full text-[11px] font-medium leading-none text-tip-ink outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-40 [&>svg]:opacity-80";
    return (
      <div className={phoneBar}>
        <button onClick={fit} aria-label="Center & Fit" className={btn}>
          <Fullscreen size={20} />
          Fit
        </button>
        {!viewOnly && (
          <>
            <button onClick={undo} disabled={!canUndo} className={btn}>
              <Undo2 size={20} />
              Undo
            </button>
            <button onClick={redo} disabled={!canRedo} className={btn}>
              <Redo2 size={20} />
              Redo
            </button>
            <button onClick={onShare} data-tour="share" className={btn}>
              <SquareArrowOutUpRight size={19} />
              Share
            </button>
          </>
        )}
        <SettingsMenu className="flex min-w-0 flex-1 self-stretch" triggerClassName={`${btn} w-full [&_svg]:size-5`} label="Settings" />
      </div>
    );
  }

  return (
    <div className={`flex max-w-full items-center gap-1.5 overflow-x-auto ${barPanel}`}>
      {!viewOnly && (
      <>
      <button
        onClick={onPlace}
        data-tour="add"
        {...tip("Add Gear", { shortcut: "+" })}
        className="btn-primary flex h-[26px] shrink-0 items-center gap-2 whitespace-nowrap rounded-control pl-1.5 pr-3 text-[13px] tracking-[-0.01em] outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1 pointer-coarse:h-10"
      >
        <span className="grid size-[18px] place-items-center rounded-inner bg-white/20">
          <Plus size={13} strokeWidth={3} />
        </span>
        Add Gear
      </button>
      {divider}
      </>
      )}
      {/* Touch screens pan and select automatically, so the tool switch is only for mouse and trackpad. */}
      {SHOW_TOOL_SWITCH && (
        <span className="contents pointer-coarse:hidden">
          <IconButton label="Pan Around" shortcut="Space" active={tool === "hand"} onClick={() => setTool("hand")}>
            <Hand size={18} />
          </IconButton>
          <IconButton label="Select and Move" active={tool === "select"} onClick={() => setTool("select")}>
            <MousePointer2 size={18} />
          </IconButton>
          {divider}
        </span>
      )}
      {/* Phones zoom with a pinch, so only "zoom to fit" stays. */}
      <span className="contents max-sm:hidden">
        <IconButton label="Zoom In" shortcut="⌘+" onClick={() => zoomBy(1.25)}>
          <ZoomIn size={20} />
        </IconButton>
      </span>
      <IconButton label="Center & Fit" shortcut="1" onClick={fit}>
        <Fullscreen size={17} />
      </IconButton>
      <span className="contents max-sm:hidden">
        <IconButton label="Zoom Out" shortcut="⌘−" onClick={() => zoomBy(0.8)}>
          <ZoomOut size={20} />
        </IconButton>
      </span>
      {!viewOnly && (
      <>
      {divider}
      <IconButton label="Undo" shortcut="⌘Z" disabled={!canUndo} onClick={undo}>
        <Undo2 size={17} />
      </IconButton>
      <IconButton label="Redo" shortcut="⇧⌘Z" disabled={!canRedo} onClick={redo}>
        <Redo2 size={17} />
      </IconButton>
      {divider}
      <button onClick={onShare} data-tour="share" className={barGhostButton}>
        <SquareArrowOutUpRight size={14} strokeWidth={2.25} />
        Share
      </button>
      </>
      )}
    </div>
  );
}
