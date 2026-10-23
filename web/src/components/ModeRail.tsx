import { LayoutGrid, List, Route } from "lucide-react";
import type { ReactNode } from "react";
import { useUi, type Mode } from "../store/ui";

const modes: { id: Mode; label: string; icon: ReactNode }[] = [
  { id: "playground", label: "Playground", icon: <LayoutGrid size={18} /> },
  { id: "signal", label: "Signal path", icon: <Route size={18} /> },
  { id: "list", label: "Equipment list", icon: <List size={18} /> },
];

export function ModeRail() {
  const { mode, setMode } = useUi();
  return (
    <nav className="flex w-12 flex-col items-center gap-1 border-r border-line bg-surface py-2">
      {modes.map((m) => (
        <button
          key={m.id}
          title={m.label}
          aria-label={m.label}
          aria-pressed={mode === m.id}
          onClick={() => setMode(m.id)}
          className={`grid size-9 place-items-center rounded-control outline-none ${
            mode === m.id ? "bg-brand/10 text-brand" : "text-ink-muted hover:bg-surface-hover"
          }`}
        >
          {m.icon}
        </button>
      ))}
    </nav>
  );
}
