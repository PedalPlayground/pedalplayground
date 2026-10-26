import { AlignHorizontalSpaceBetween, ArrowDownToLine, ArrowUpToLine, Lock, LockOpen, Replace, RotateCw, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { usePlayground } from "../store/playground";
import { useUi } from "../store/ui";
import { barDivider, barIconActive, barIconIdle, barSoftButton } from "./toolbarStyles";

function Action({
  label,
  onClick,
  children,
  danger,
  pressed,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  danger?: boolean;
  pressed?: boolean;
}) {
  return (
    <button
      title={label}
      aria-label={label}
      aria-pressed={pressed}
      onClick={onClick}
      className={`grid size-10 place-items-center rounded-control outline-none focus-visible:ring-2 focus-visible:ring-brand sm:size-7 sm:rounded-[5px] sm:pointer-coarse:size-11 ${
        danger ? "text-danger hover:bg-surface-hover" : pressed ? barIconActive : barIconIdle
      }`}
    >
      {children}
    </button>
  );
}

/** The floating menu for the selected object(s): what it is, replace it, rotate, flip, reorder, delete. */
export function ObjectMenu() {
  const s = usePlayground();
  const setReplacing = useUi((u) => u.setReplacing);
  const searchOpen = useUi((u) => u.searchOpen);
  if (!s.selected.length) return null;
  const single = s.selected.length === 1 ? s.items.find((i) => i.id === s.selected[0]) : undefined;
  const locked = s.items.filter((i) => s.selected.includes(i.id)).every((i) => i.locked);
  return (
    // On phones it sits at the bottom, in thumb reach above the toolbar (hidden while the search sheet is open).
    <div className={`absolute left-1/2 z-10 flex -translate-x-1/2 flex-col items-center gap-0.5 glass-sm p-1.5 max-sm:rounded-3xl max-sm:bottom-[88px] sm:top-4 sm:flex-row sm:gap-1.5 sm:rounded-[10px] sm:border sm:border-chrome-line sm:bg-surface sm:shadow-[0_0_12px_rgb(0_0_0/0.05)] ${searchOpen ? "max-sm:hidden" : ""}`}>
      <div className="flex items-center gap-1 max-sm:w-full max-sm:justify-center">
        <span className="max-w-64 truncate px-2 text-xs font-medium sm:max-w-48 sm:pl-1.5 sm:pr-0.5 sm:text-[13px] sm:font-semibold sm:tracking-[-0.01em]" title={single?.label}>
          {single ? single.label : `${s.selected.length} selected`}
        </span>
      </div>
      <div className="flex items-center gap-1 sm:gap-1.5">
      {single && (
        <button
          onClick={() => setReplacing(true)}
          title="Replace with another product"
          className={`max-sm:grid max-sm:size-10 max-sm:place-items-center max-sm:rounded-control max-sm:bg-transparent max-sm:px-0 ${barSoftButton}`}
        >
          <Replace size={16} />
          <span className="hidden sm:inline">Replace</span>
        </button>
      )}
      {single && <span className={barDivider} />}
      <Action label={locked ? "Unlock position" : "Lock position"} onClick={s.toggleLockSelected} pressed={locked}>
        {locked ? <Lock size={18} /> : <LockOpen size={18} />}
      </Action>
      <Action label="Rotate (R)" onClick={s.rotateSelected}>
        <RotateCw size={18} />
      </Action>
      {s.selected.length >= 3 && (
        <Action label="Distribute horizontally" onClick={s.distributeHorizontally}>
          <AlignHorizontalSpaceBetween size={18} />
        </Action>
      )}
      <span className={barDivider} />
      <Action label="Bring forward (])" onClick={s.bringForward}>
        <ArrowUpToLine size={18} />
      </Action>
      <Action label="Send backward ([)" onClick={s.sendBackward}>
        <ArrowDownToLine size={18} />
      </Action>
      <span className={barDivider} />
      <Action label="Delete" onClick={s.deleteSelected} danger>
        <Trash2 size={18} />
      </Action>
      </div>
    </div>
  );
}
