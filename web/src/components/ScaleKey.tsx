import { scaleBar } from "../lib/scale";
import { usePlayground } from "../store/playground";
import { useUi } from "../store/ui";

/**
 * A quiet map-style scale bar: a round length (1 in, 5 cm, ...) and a bracket that long on screen.
 * It picks a new length as the zoom changes, so the bar stays short.
 */
export function ScaleKey({ className = "" }: { className?: string }) {
  const zoom = usePlayground((s) => s.view.zoom);
  const units = useUi((u) => u.units);
  const { label, px } = scaleBar(zoom, units);
  return (
    <div
      role="img"
      aria-label={`Scale: ${label}`}
      className={`pointer-events-none flex select-none flex-col items-start gap-0.5 text-ink-muted opacity-70 ${className}`}
    >
      <span className="text-[11px] font-medium leading-none tracking-[-0.01em] tabular-nums">{label}</span>
      <span
        className="h-[5px] border-x border-b border-current transition-[width] duration-150 ease-out"
        style={{ width: Math.round(px) }}
      />
    </div>
  );
}
