import { Cable, SlidersHorizontal } from "lucide-react";
import type { ReactNode } from "react";
import { withTool } from "../lib/analytics";
import { useAuth } from "../store/auth";
import { useUi } from "../store/ui";
import { PedalboardIcon } from "./SiteTabs";
import { barDivider, barPanel } from "./toolbarStyles";

const item =
  "press flex h-7 shrink-0 items-center gap-2 whitespace-nowrap rounded-control px-2 text-sm font-semibold tracking-[-0.01em] text-ink outline-none hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-brand";

function ModeButton({ label, icon, on, onClick }: { label: string; icon: ReactNode; on?: boolean; onClick: () => void }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick} className={item}>
      <span className={`flex ${on ? "text-brand" : "text-icon-solo"}`}>{icon}</span>
      {label}
    </button>
  );
}

/**
 * The board's modes along the bottom center: Arrange Board (placing gear) and Add Cables (Signal Flow), plus Board
 * Settings (Playground Settings). The mode that's on has its icon in the brand color.
 */
export function ModeBar({ onSettings }: { onSettings: () => void }) {
  const cablesOpen = useUi((u) => u.cablesOpen);
  const setCablesOpen = useUi((u) => u.setCablesOpen);
  const user = useAuth((s) => s.user);
  return (
    <div role="toolbar" aria-label="Modes" className={`flex max-w-full items-center gap-2 overflow-x-auto ${barPanel}`}>
      <ModeButton label="Arrange Board" icon={<PedalboardIcon size={16} />} on={!cablesOpen} onClick={withTool("mode_arrange", "mode_bar", () => setCablesOpen(false))} />
      <span className={barDivider} />
      <ModeButton label="Add Cables" icon={<Cable size={16} />} on={cablesOpen} onClick={withTool("cables", "mode_bar", () => setCablesOpen(true))} />
      {user && (
        <>
          <span className={barDivider} />
          <ModeButton label="Board Settings" icon={<SlidersHorizontal size={16} />} onClick={withTool("playground_settings", "mode_bar", onSettings)} />
        </>
      )}
    </div>
  );
}
