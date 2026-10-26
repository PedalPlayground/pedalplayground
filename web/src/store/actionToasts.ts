import type { Item } from "../lib/types";
import { usePlayground } from "./playground";
import { toast } from "./toast";

type State = ReturnType<typeof usePlayground.getState>;

const changed = (a: Item[], b: Item[]) => a.length !== b.length || a.some((item, n) => item !== b[n]);
const selectedLabel = (s: State) => s.items.find((i) => i.id === s.selected[0])?.label;

/** How each action describes itself once it has changed the canvas. Catalog adds confirm in the search panel instead. */
const messages: Partial<Record<keyof State, (after: State, before: State) => string | undefined>> = {
  undo: () => "Undo",
  redo: () => "Redo",
  rotateSelected: () => "Rotated 90°",
  toggleLockSelected: (s) => (s.items.some((i) => s.selected.includes(i.id) && i.locked) ? "Locked in Place" : "Unlocked"),
  bringForward: () => "Moved Forward",
  sendBackward: () => "Moved Behind",
  bringToFront: () => "Moved to Front",
  sendToBack: () => "Moved to Back",
  distributeHorizontally: () => "Spaced Evenly",
  deleteSelected: (s, b) => {
    const n = b.items.length - s.items.length;
    return n > 1 ? `Deleted ${n} Items` : "Deleted";
  },
  addCustomItem: (s) => `Added ${selectedLabel(s) ?? ""}`.trim(),
  replaceItem: (s) => `Replaced with ${selectedLabel(s) ?? "new item"}`,
};

// Wrap the store's actions so each one that changes the items announces itself.
const patch: Partial<State> = {};
for (const [key, describe] of Object.entries(messages)) {
  const name = key as keyof State;
  const original = usePlayground.getState()[name] as (...args: unknown[]) => void;
  (patch as Record<string, unknown>)[name] = (...args: unknown[]) => {
    const before = usePlayground.getState();
    original(...args);
    const after = usePlayground.getState();
    if (!changed(before.items, after.items)) return;
    const msg = describe!(after, before);
    if (msg) toast(msg);
  };
}
usePlayground.setState(patch);
