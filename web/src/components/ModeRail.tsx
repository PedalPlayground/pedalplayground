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
    <nav className="order-last flex shrink-0 items-center justify-around border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] sm:order-none sm:w-12 sm:flex-col sm:justify-start sm:gap-1 sm:border-r sm:border-t-0 sm:py-2 sm:pb-2">
      {modes.map((m) => (
        <button
          key={m.id}
          title={m.label}
          aria-label={m.label}
          aria-pressed={mode === m.id}
          onClick={() => setMode(m.id)}
          className={`grid size-11 place-items-center rounded-control outline-none sm:size-9 ${
            mode === m.id ? "bg-brand/10 text-brand" : "text-ink-muted hover:bg-surface-hover"
          }`}
        >
          {m.icon}
        </button>
      ))}
    </nav>
  );
}
