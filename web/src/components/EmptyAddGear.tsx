import { Plus } from "lucide-react";
import { usePlayground } from "../store/playground";
import { useUi } from "../store/ui";

/** An outlined "Add Gear" button in the middle of an empty Playground, twin to the toolbar's. Opens the same search panel as the toolbar's. */
export function EmptyAddGear() {
  const empty = usePlayground((s) => s.items.length === 0);
  const searchOpen = useUi((u) => u.searchOpen);
  const viewing = useUi((u) => !!u.viewing);
  const setSearchOpen = useUi((u) => u.setSearchOpen);
  if (!empty || searchOpen || viewing) return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center">
      {/* A bigger twin of the toolbar's Add Gear: a +, the same corners and type, outlined over a faint tint. */}
      <button
        onClick={() => setSearchOpen(true)}
        className="press animate-enter pointer-events-auto flex h-11 items-center gap-2.5 rounded-[8px] border-[1.5px] border-brand bg-brand/10 pl-2.5 pr-5 text-[15px] font-semibold tracking-[-0.01em] text-brand outline-none hover:bg-brand/15 active:bg-brand/20 focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
      >
        <span className="grid size-6 place-items-center rounded-[6px] bg-brand/15">
          <Plus size={16} strokeWidth={2.75} />
        </span>
        Add Gear
      </button>
    </div>
  );
}
