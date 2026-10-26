import { LayoutGrid, List, Route } from "lucide-react";
import type { ReactNode } from "react";
import { useUi, type Mode } from "../store/ui";
import { tip } from "./Tooltip";
import { barIconActive, barIconButton, barIconIdle, barPanel } from "./toolbarStyles";

export const modes: { id: Mode; label: string; icon: ReactNode }[] = [
  { id: "playground", label: "Playground", icon: <LayoutGrid size={18} /> },
  { id: "signal", label: "Signal Path", icon: <Route size={18} /> },
  { id: "list", label: "Equipment List", icon: <List size={18} /> },
];

export function ModeRail() {
  const { mode, setMode } = useUi();
  return (
    // Floats over the canvas like the other bars. Its buttons line up under the header logo: both are centered
    // 16px (or the safe-area inset) + 16px from the left edge, so the panel sits 5px in from the logo's left edge.
    <nav
      aria-label="Modes"
      className={`absolute left-[calc(max(1rem,env(safe-area-inset-left))-5px)] top-3 z-10 flex flex-col gap-1 ${barPanel} max-sm:hidden`}
    >
      {modes.map((m) => (
        <button
          key={m.id}
          {...tip(m.label, { side: "right" })}
          aria-label={m.label}
          aria-pressed={mode === m.id}
          onClick={() => setMode(m.id)}
          className={`${barIconButton} ${mode === m.id ? barIconActive : barIconIdle}`}
        >
          {m.icon}
        </button>
      ))}
    </nav>
  );
}
