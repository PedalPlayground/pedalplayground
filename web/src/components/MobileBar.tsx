import * as Dropdown from "@radix-ui/react-dropdown-menu";
import { ChevronUp, Maximize2, Plus, Redo2, Undo2 } from "lucide-react";
import { usePlayground } from "../store/playground";
import { useUi } from "../store/ui";
import { modes } from "./ModeRail";

/**
 * Phone bottom bar: a floating glass pill (modes menu, undo, redo) with the Place button floating apart from it.
 * Only the Playground mode exists so far; the other two modes sit in the menu as "Soon".
 */
export function MobileBar({ onPlace }: { onPlace: () => void }) {
  const mode = useUi((u) => u.mode);
  const fit = usePlayground((s) => s.fitToContent);
  const undo = usePlayground((s) => s.undo);
  const redo = usePlayground((s) => s.redo);
  const canUndo = usePlayground((s) => s.past.length > 0);
  const canRedo = usePlayground((s) => s.future.length > 0);
  const current = modes.find((m) => m.id === mode) ?? modes[0];
  const btn = "grid h-11 flex-1 place-items-center rounded-full text-ink-muted outline-none disabled:opacity-35 active:bg-surface-hover";

  return (
    <div className="flex w-full items-center gap-3 sm:hidden">
      <div className="glass flex h-14 flex-1 items-center justify-around rounded-full px-2">
        <Dropdown.Root>
          <Dropdown.Trigger aria-label="Modes" className={`${btn} text-brand data-[state=open]:bg-surface-hover`}>
            <span className="flex items-center gap-1">
              {current.icon}
              <ChevronUp size={12} />
            </span>
          </Dropdown.Trigger>
          <Dropdown.Portal>
            <Dropdown.Content side="top" align="start" sideOffset={10} className="glass z-50 min-w-48 rounded-3xl p-2">
              {modes
                .filter((m) => m.id !== mode)
                .map((m) => (
                  <Dropdown.Item
                    key={m.id}
                    disabled
                    className="flex select-none items-center gap-3 rounded-full px-3 py-2.5 text-sm text-ink-muted outline-none data-[disabled]:opacity-70"
                  >
                    {m.icon}
                    {m.label}
                    <span className="ml-auto text-xs">Soon</span>
                  </Dropdown.Item>
                ))}
            </Dropdown.Content>
          </Dropdown.Portal>
        </Dropdown.Root>
        <button aria-label="Zoom to fit" onClick={fit} className={btn}>
          <Maximize2 size={20} />
        </button>
        <button aria-label="Undo" disabled={!canUndo} onClick={undo} className={btn}>
          <Undo2 size={20} />
        </button>
        <button aria-label="Redo" disabled={!canRedo} onClick={redo} className={btn}>
          <Redo2 size={20} />
        </button>
      </div>
      <button
        onClick={onPlace}
        aria-label="Place a Product"
        className="btn-primary grid size-14 shrink-0 place-items-center rounded-full shadow-panel"
      >
        <Plus size={24} />
      </button>
    </div>
  );
}
