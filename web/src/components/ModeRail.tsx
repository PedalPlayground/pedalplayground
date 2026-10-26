import { LayoutGrid, List, Route } from "lucide-react";
import type { ReactNode } from "react";
import { useUi, type Mode } from "../store/ui";
import { tip } from "./Tooltip";

export const modes: { id: Mode; label: string; icon: ReactNode }[] = [
  { id: "playground", label: "Playground", icon: <LayoutGrid size={18} /> },
  { id: "signal", label: "Signal Path", icon: <Route size={18} /> },
  { id: "list", label: "Equipment List", icon: <List size={18} /> },
];

export function ModeRail() {
  const { mode, setMode } = useUi();
  return (
    <nav className="box-content flex w-12 shrink-0 pl-[env(safe-area-inset-left)] flex-col items-center gap-1 border-r border-line bg-surface py-2 max-sm:hidden">
      {modes.map((m) => (
        <button
          key={m.id}
          {...tip(m.label, { side: "right" })}
          aria-label={m.label}
          aria-pressed={mode === m.id}
          onClick={() => setMode(m.id)}
          className={`press grid size-9 place-items-center rounded-control outline-none ${
            mode === m.id ? "bg-brand/10 text-brand active:bg-brand/20" : "text-ink-muted hover:bg-surface-hover active:bg-chrome-line"
          }`}
        >
          {m.icon}
        </button>
      ))}
    </nav>
  );
}
