import type { Item } from "./types";

/** The name to show for a placed item. Custom items saved without a name fall back to what they are. */
export function itemName(item: Pick<Item, "kind" | "label">): string {
  return item.label.trim() || (item.kind === "pedalboard" ? "Custom Pedalboard" : "Custom Pedal");
}
