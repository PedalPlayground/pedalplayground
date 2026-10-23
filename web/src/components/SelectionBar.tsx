import { ArrowDownToLine, ArrowUpToLine, FlipHorizontal2, RotateCw, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { usePlayground } from "../store/playground";

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

export function SelectionBar() {
  const s = usePlayground();
  if (!s.selected.length) return null;
  return (
    <div className="absolute left-1/2 top-16 flex lg:top-4 -translate-x-1/2 items-center gap-1 rounded-panel bg-surface p-1.5 shadow-panel">
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
