import type { Kind } from "./catalog";
import type { Item } from "./types";

/** A catalog item's page on the Gear site: /gear/?item=<image key>, plus kind=boards for a board. */
export const gearItemHref = (kind: Kind, image: string) =>
  `/gear/?item=${encodeURIComponent(image.replace(/\.png$/, ""))}${kind === "pedalboard" ? "&kind=boards" : ""}`;

/** The Gear page for a placed catalog item, or null for custom gear (it has no page). */
export const placedItemHref = (item: Item | undefined) => (item && !item.custom && item.image ? gearItemHref(item.kind, item.image) : null);

/** Opens a placed item's Gear page in a new tab, so the playground stays as it is. */
export const openGearInfo = (item: Item | undefined) => {
  const href = placedItemHref(item);
  if (href) window.open(href, "_blank", "noopener");
};
