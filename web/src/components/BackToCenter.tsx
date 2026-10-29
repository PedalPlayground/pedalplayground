import { LocateFixed } from "lucide-react";
import { itemBounds, PX_PER_INCH } from "../lib/geometry";
import { usePlayground } from "../store/playground";

/** True when more than half of the items have their centers outside the visible canvas. */
function mostlyOffScreen(s: ReturnType<typeof usePlayground.getState>) {
  const { items, view, viewport } = s;
  if (!items.length || !viewport.w) return false;
  const scale = PX_PER_INCH * view.zoom;
  const off = items.filter((i) => {
    const b = itemBounds(i);
    const x = view.x + ((b.left + b.right) / 2) * scale;
    const y = view.y + ((b.top + b.bottom) / 2) * scale;
    return x < 0 || y < 0 || x > viewport.w || y > viewport.h;
  }).length;
  return off > items.length / 2;
}

/** A ghost button in the middle of the canvas that brings the user's gear back into view once they've wandered off. */
export function BackToCenter() {
  const lost = usePlayground(mostlyOffScreen);
  const fit = usePlayground((s) => s.fitToContent);
  if (!lost) return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center">
      <button
        onClick={fit}
        className="press animate-enter pointer-events-auto flex h-9 items-center gap-2 rounded-full border border-chrome-line bg-surface/80 px-4 text-[13px] font-semibold tracking-[-0.01em] text-ink shadow-[0_0_12px_rgb(0_0_0/0.08)] backdrop-blur-sm outline-none hover:bg-surface active:bg-surface-hover focus-visible:ring-2 focus-visible:ring-brand pointer-coarse:h-10"
      >
        <LocateFixed size={15} strokeWidth={2.25} />
        Back to Center
      </button>
    </div>
  );
}
