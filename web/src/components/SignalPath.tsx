import { Route } from "lucide-react";
import { itemName } from "../lib/itemName";
import { nodeById, type SignalGraph, type SignalNode } from "../lib/signal";
import type { Item } from "../lib/types";
import { usePlayground } from "../store/playground";

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

/** Follows the first audio cable out of each node from the first source. A stand-in until the diagram lands. */
function mainPath(g: SignalGraph): SignalNode[] {
  const path: SignalNode[] = [];
  let node = g.nodes.find((n) => n.type === "source");
  while (node && !path.includes(node)) {
    path.push(node);
    const next = g.cables.find((c) => c.kind === "audio" && c.from === node!.id);
    node = next && nodeById(g, next.to);
  }
  return path;
}

function label(node: SignalNode, items: Item[]) {
  if (node.type === "source" || node.type === "destination") return node.label;
  if (node.type === "split") return "Split";
  if (node.type === "merge") return "Merge";
  const item = items.find((i) => i.id === node.id);
  return item ? itemName(item) : "Pedal";
}

/** The Signal Path mode. Covers the canvas like the Equipment List. The grid diagram comes in the next step. */
export function SignalPath() {
  const items = usePlayground((p) => p.items);
  const signal = usePlayground((p) => p.signal);
  const pedals = items.filter((i) => i.kind === "pedal");
  const inChain = pedals.filter((p) => signal.nodes.some((n) => n.id === p.id)).length;
  const path = mainPath(signal);

  return (
    <div className="animate-fade absolute inset-0 z-10 overflow-y-auto overscroll-contain bg-canvas">
      {/* Clears the floating mode rail: beside it on larger screens, below it on phones. */}
      <div className="mx-auto flex w-full max-w-[720px] flex-col gap-3 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] pt-[76px] sm:pl-[calc(max(1rem,env(safe-area-inset-left))+64px)] sm:pr-[max(1.5rem,env(safe-area-inset-right))] sm:pt-3">
        <header className="animate-enter px-1 py-1 [--enter-y:4px]">
          <h2 className="text-lg font-semibold tracking-[-0.02em]">Signal Path</h2>
          <p className="text-[13px] text-ink-muted">
            {plural(inChain, "Pedal")} in Chain · {pedals.length - inChain} Not in Chain
          </p>
        </header>
        <div className="animate-enter flex flex-col items-center gap-3 rounded-panel bg-surface px-6 py-10 text-center shadow-panel">
          <span className="grid size-10 place-items-center rounded-full bg-brand/10 text-brand">
            <Route size={18} />
          </span>
          <p className="text-sm font-medium">{path.map((n) => label(n, items)).join(" → ")}</p>
          <p className="max-w-xs text-sm text-ink-muted">The signal path diagram is on its way. Your chain saves with this playground.</p>
        </div>
      </div>
    </div>
  );
}
