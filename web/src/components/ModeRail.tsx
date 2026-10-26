import { LayoutGrid, List, Route } from "lucide-react";
import type { ReactNode } from "react";
import { useUi, type Mode } from "../store/ui";
import { tip } from "./Tooltip";
import { barIconActive, barIconButton, barIconIdle, barPanel } from "./toolbarStyles";

export const modes: { id: Mode; label: string; icon: ReactNode; soon?: boolean }[] = [
  { id: "playground", label: "Playground", icon: <LayoutGrid size={18} /> },
  { id: "signal", label: "Signal Path", icon: <Route size={18} />, soon: true },
  { id: "list", label: "Equipment List", icon: <List size={18} /> },
];

export function ModeRail() {
  const { mode, setMode } = useUi();
  return (
    // Floats over the canvas like the other bars. Its buttons line up under the header logo: both are centered
    // 16px (or the safe-area inset) + 16px from the left edge, so the panel sits 5px in from the logo's left edge.
    // Phones get a row instead, tucked in the top-left corner.
    <nav
      aria-label="Modes"
      className={`absolute left-[calc(max(1rem,env(safe-area-inset-left))-5px)] top-3 z-10 flex flex-col gap-1 ${barPanel} max-sm:left-[max(0.75rem,env(safe-area-inset-left))] max-sm:flex-row`}
    >
      {modes.map((m) => (
        <button
          key={m.id}
          // Not built yet: aria-disabled instead of disabled, so the tooltip still shows on hover.
          {...tip(m.soon ? `${m.label} (Soon)` : m.label, { side: "right" })}
          aria-label={m.soon ? `${m.label} (Soon)` : m.label}
          aria-pressed={mode === m.id}
          aria-disabled={m.soon || undefined}
          onClick={() => !m.soon && setMode(m.id)}
          className={`${barIconButton} ${m.soon ? "cursor-default text-ink opacity-40" : mode === m.id ? barIconActive : barIconIdle}`}
        >
          {m.icon}
        </button>
      ))}
    </nav>
  );
}
