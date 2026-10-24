import { Hand, MousePointer2, Plus, Redo2, Undo2, ZoomIn, ZoomOut } from "lucide-react";
import type { ReactNode } from "react";
import { usePlayground } from "../store/playground";
import { useUi } from "../store/ui";
import { MobileBar } from "./MobileBar";

function IconButton({
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <button
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={`grid size-9 place-items-center rounded-control outline-none pointer-coarse:size-11 disabled:opacity-40 ${
        active ? "bg-brand/10 text-brand" : "text-ink-muted hover:bg-surface-hover"
      }`}
    >
      {children}
    </button>
  );
}

export function Toolbar({ onPlace }: { onPlace: () => void }) {
  const { tool, setTool } = useUi();
  const zoom = usePlayground((s) => s.view.zoom);
  const zoomBy = usePlayground((s) => s.zoomBy);
  const fit = usePlayground((s) => s.fitToContent);
  const undo = usePlayground((s) => s.undo);
  const redo = usePlayground((s) => s.redo);
  const canUndo = usePlayground((s) => s.past.length > 0);
  const canRedo = usePlayground((s) => s.future.length > 0);
  return (
    <>
    <MobileBar onPlace={onPlace} />
    <div className="flex max-w-full items-center gap-1 overflow-x-auto rounded-panel bg-surface p-1.5 shadow-panel max-sm:hidden">
      {/* Touch screens pan and select automatically, so the tool switch is only for mouse and trackpad. */}
      <span className="contents pointer-coarse:hidden max-sm:hidden">
        <IconButton label="Pan (hand)" active={tool === "hand"} onClick={() => setTool("hand")}>
          <Hand size={18} />
        </IconButton>
        <IconButton label="Select" active={tool === "select"} onClick={() => setTool("select")}>
          <MousePointer2 size={18} />
        </IconButton>
        <span className="mx-1 h-5 w-px bg-line" />
      </span>
      <span className="hidden sm:contents">
        <IconButton label="Zoom out" onClick={() => zoomBy(0.8)}>
          <ZoomOut size={18} />
        </IconButton>
      </span>
      <button
        title="Fit to content"
        onClick={fit}
        className="h-9 w-12 rounded-control text-xs tabular-nums text-ink-muted hover:bg-surface-hover pointer-coarse:h-11 pointer-coarse:w-14"
      >
        {Math.round(zoom * 100)}%
      </button>
      <span className="hidden sm:contents">
        <IconButton label="Zoom in" onClick={() => zoomBy(1.25)}>
          <ZoomIn size={18} />
        </IconButton>
      </span>
      <span className="mx-1 h-5 w-px bg-line max-sm:hidden" />
      <IconButton label="Undo (⌘Z)" disabled={!canUndo} onClick={undo}>
        <Undo2 size={18} />
      </IconButton>
      <IconButton label="Redo (⇧⌘Z)" disabled={!canRedo} onClick={redo}>
        <Redo2 size={18} />
      </IconButton>
      <button
        onClick={onPlace}
        aria-label="Place a Product"
        title="Place a Product"
        className="ml-1 flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap px-3 outline-none max-sm:size-11 max-sm:justify-center max-sm:px-0 pointer-coarse:h-11 btn-primary"
      >
        <Plus size={18} />
        <span className="max-sm:hidden">Place a Product</span>
      </button>
    </div>
    </>
  );
}
