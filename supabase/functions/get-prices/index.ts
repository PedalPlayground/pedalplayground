// Returns the Pro prices straight from Stripe, so the upgrade dialog always shows what checkout will charge.
// Public and read-only: it uses the same price IDs as create-checkout-session and exposes nothing private.
import { stripe } from "../_shared/clients.ts";
import { handler } from "../_shared/http.ts";

interface PriceInfo {
  /** Smallest currency unit, e.g. cents. */
  amount: number;
  currency: string;
  interval: string;
}

const CACHE_MS = 10 * 60 * 1000;
let cached: { at: number; prices: Record<"month" | "year", PriceInfo | null> } | null = null;

async function load(id: string | undefined): Promise<PriceInfo | null> {
  if (!id) return null;
  const p = await stripe.prices.retrieve(id);
  if (p.unit_amount == null || !p.active) return null;
  return { amount: p.unit_amount, currency: p.currency, interval: p.recurring?.interval ?? "" };
}

Deno.serve(
  handler(async () => {
    // Warm function instances reuse this, which keeps Stripe calls rare. Price changes show up within 10 minutes.
    if (!cached || Date.now() - cached.at > CACHE_MS) {
      const [month, year] = await Promise.all([
        load(Deno.env.get("STRIPE_PRICE_MONTHLY")),
        load(Deno.env.get("STRIPE_PRICE_YEARLY")),
      ]);
      cached = { at: Date.now(), prices: { month, year } };
    }
    return cached.prices;
  }),
);
