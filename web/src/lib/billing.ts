import { supabase } from "./supabase";

export type Plan = "free" | "pro";
export type Interval = "month" | "year";

export interface Entitlements {
  plan: Plan;
  /** null = unlimited */
  maxPlaygrounds: number | null;
  playgroundCount: number;
  status: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

interface EntitlementsRow {
  plan: Plan;
  max_playgrounds: number | null;
  playground_count: number;
  status: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
}

/** Thrown when billing hasn't been set up on the backend yet (the migration isn't applied). */
export class BillingUnavailableError extends Error {}

export async function fetchEntitlements(): Promise<Entitlements> {
  if (!supabase) throw new BillingUnavailableError("Cloud is not configured.");
  const { data, error } = await supabase.rpc("my_entitlements");
  if (error) {
    // PGRST202: function not found in the schema cache (migration not applied).
    if (error.code === "PGRST202" || error.code === "42883") throw new BillingUnavailableError(error.message);
    throw error;
  }
  const r = data as EntitlementsRow;
  return {
    plan: r.plan,
    maxPlaygrounds: r.max_playgrounds,
    playgroundCount: Number(r.playground_count),
    status: r.status,
    currentPeriodEnd: r.current_period_end,
    cancelAtPeriodEnd: r.cancel_at_period_end,
  };
}

/** Free accounts can't create more playgrounds once they reach their limit. */
export const atLimit = (e: Entitlements | null) =>
  !!e && e.maxPlaygrounds !== null && e.playgroundCount >= e.maxPlaygrounds;

async function redirectFromFunction(name: string, body?: Record<string, unknown>): Promise<void> {
  if (!supabase) throw new Error("Cloud is not configured.");
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    // A non-2xx reply carries the server's message in the response body. Network failures and
    // undeployed functions don't have a response, so fall back to a plain explanation.
    const res = (error as { context?: unknown }).context;
    const reply = res instanceof Response ? ((await res.json().catch(() => null)) as { error?: string } | null) : null;
    throw new Error(reply?.error ?? "Couldn't reach billing. Check your connection and try again.");
  }
  const url = (data as { url?: string } | null)?.url;
  if (!url) throw new Error("Billing didn't return a link. Try again.");
  window.location.assign(url);
}

export const startCheckout = (interval: Interval) => redirectFromFunction("create-checkout-session", { interval });
export const openBillingPortal = () => redirectFromFunction("create-portal-session");
