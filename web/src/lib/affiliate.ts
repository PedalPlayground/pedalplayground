/**
 * Affiliate "Buy" links for the Equipment List. Every store goes through Awin, so the
 * publisher ID and each store's Awin advertiser ID live here and nowhere else.
 *
 * Off unless VITE_BUY_LINKS=true, so nothing shows before a store approves the account.
 */
export const BUY_LINKS = import.meta.env.VITE_BUY_LINKS === "true";

/** Pedal Playground's Awin publisher ID. */
const AWIN_PUBLISHER_ID = "3135663";

interface Store {
  name: string;
  /** Awin advertiser ID (awinmid). */
  awinId: string;
  /** The store's own search page for a query. */
  search: (query: string) => string;
  /** Turn a store on once it has approved the account. */
  enabled: boolean;
}

const STORES: Store[] = [
  {
    name: "Reverb",
    awinId: "67144",
    search: (q) => `https://reverb.com/marketplace?query=${encodeURIComponent(q)}`,
    enabled: true,
  },
  {
    // Not approved yet: fill in the Awin advertiser ID and the search URL, then enable.
    name: "Sweetwater",
    awinId: "",
    search: (q) => `https://www.sweetwater.com/store/search.php?s=${encodeURIComponent(q)}`,
    enabled: false,
  },
];

/** Wraps a store URL in an Awin tracking link. */
const awin = (store: Store, url: string) =>
  `https://www.awin1.com/cread.php?awinmid=${store.awinId}&awinaffid=${AWIN_PUBLISHER_ID}&ued=${encodeURIComponent(url)}`;

export interface BuyLink {
  store: string;
  href: string;
}

/** Search links for a piece of gear at each enabled store, or none when Buy links are off. */
export function buyLinks(brand: string, name: string): BuyLink[] {
  if (!BUY_LINKS) return [];
  const query = [brand === "Custom" ? "" : brand, name].filter(Boolean).join(" ").trim();
  if (!query || query === "Untitled") return [];
  return STORES.filter((s) => s.enabled && s.awinId).map((s) => ({ store: s.name, href: awin(s, s.search(query)) }));
}

/** Shown under the list whenever Buy links are on. */
export const DISCLOSURE = "Buy links go to our retail partners. Pedal Playground may earn a commission on purchases, at no extra cost to you.";

/** Props for every outbound affiliate link. */
export const affiliateProps = { target: "_blank", rel: "sponsored noopener" } as const;
