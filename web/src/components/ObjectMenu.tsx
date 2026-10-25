import { ArrowDownToLine, ArrowUpToLine, Replace, RotateCw, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { usePlayground } from "../store/playground";
import { useUi } from "../store/ui";

function Action({ label, onClick, children, danger }: { label: string; onClick: () => void; children: ReactNode; danger?: boolean }) {
  return (
    <button
      title={label}
      aria-label={label}
      onClick={onClick}
      className={`grid size-9 place-items-center rounded-control outline-none hover:bg-surface-hover pointer-coarse:size-10 ${
        danger ? "text-danger" : "text-ink-muted"
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
  return (
    // On phones it sits at the bottom, in thumb reach above the toolbar (hidden while the search sheet is open).
    <div className={`absolute left-1/2 z-10 flex -translate-x-1/2 flex-col items-center gap-0.5 glass-sm p-1.5 max-sm:rounded-3xl max-sm:bottom-[88px] sm:rounded-panel sm:bg-surface sm:shadow-panel sm:top-16 sm:flex-row sm:gap-1 lg:top-4 ${searchOpen ? "max-sm:hidden" : ""}`}>
      <div className="flex items-center gap-1 max-sm:w-full max-sm:justify-center">
        <span className="max-w-64 truncate px-2 text-xs font-medium sm:max-w-48 sm:text-sm" title={single?.label}>
          {single ? single.label : `${s.selected.length} selected`}
        </span>
      </div>
      <div className="flex items-center gap-1">
      {single && (
        <button
          onClick={() => setReplacing(true)}
          title="Replace with another product"
          className="flex h-9 items-center gap-1.5 rounded-control px-2.5 text-sm text-ink-muted outline-none hover:bg-surface-hover"
        >
          <Replace size={16} />
          <span className="hidden sm:inline">Replace</span>
        </button>
      )}
      {single && <span className="mx-1 h-5 w-px bg-line" />}
      <Action label="Rotate (R)" onClick={s.rotateSelected}>
        <RotateCw size={18} />
      </Action>
      <span className="mx-1 h-5 w-px bg-line" />
      <Action label="Bring forward (])" onClick={s.bringForward}>
        <ArrowUpToLine size={18} />
      </Action>
      <Action label="Send backward ([)" onClick={s.sendBackward}>
        <ArrowDownToLine size={18} />
      </Action>
      <span className="mx-1 h-5 w-px bg-line" />
      <Action label="Delete" onClick={s.deleteSelected} danger>
        <Trash2 size={18} />
      </Action>
      </div>
    </div>
  );
}
