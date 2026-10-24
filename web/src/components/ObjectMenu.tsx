import { ArrowDownToLine, ArrowUpToLine, FlipHorizontal2, Replace, RotateCw, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { usePlayground } from "../store/playground";
import { useUi } from "../store/ui";

function Action({ label, onClick, children, danger }: { label: string; onClick: () => void; children: ReactNode; danger?: boolean }) {
  return (
    <button
      title={label}
      aria-label={label}
      onClick={onClick}
      className={`grid size-9 place-items-center rounded-control outline-none hover:bg-surface-hover ${
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
  if (!s.selected.length) return null;
  const single = s.selected.length === 1 ? s.items.find((i) => i.id === s.selected[0]) : undefined;
  return (
    <div className="absolute left-1/2 top-16 flex lg:top-4 -translate-x-1/2 items-center gap-1 rounded-panel bg-surface p-1.5 shadow-panel">
      <span className="max-w-48 truncate px-2 text-sm font-medium" title={single?.label}>
        {single ? single.label : `${s.selected.length} selected`}
      </span>
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
      <span className="mx-1 h-5 w-px bg-line" />
      <Action label="Rotate (R)" onClick={s.rotateSelected}>
        <RotateCw size={18} />
      </Action>
      <Action label="Flip (F)" onClick={s.flipSelected}>
        <FlipHorizontal2 size={18} />
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
  );
}
