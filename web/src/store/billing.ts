import { create } from "zustand";
import { BillingUnavailableError, fetchEntitlements, type Entitlements } from "../lib/billing";
import { supabase } from "../lib/supabase";
import { useAuth } from "./auth";
import { SHOW_PRO } from "./ui";

interface BillingState {
  entitlements: Entitlements | null;
  /** False when the backend has no billing set up; the app then never gates anything. */
  billingEnabled: boolean;
  refresh: () => Promise<Entitlements | null>;
  /** Polls after returning from checkout, since the webhook lands a moment after the redirect. */
  waitForPro: () => Promise<boolean>;
  clear: () => void;
}

export const useBilling = create<BillingState>((set, get) => ({
  entitlements: null,
  // With Pro hidden, billing counts as off: the app shows no plans and gates nothing.
  billingEnabled: SHOW_PRO,

  // Entitlements load even with Pro hidden, for the free plan's "2/4" board count; only SHOW_PRO turns gating on.
  refresh: async () => {
    if (!supabase || !useAuth.getState().user) {
      set({ entitlements: null });
      return null;
    }
    try {
      const entitlements = await fetchEntitlements();
      set({ entitlements, billingEnabled: SHOW_PRO });
      return entitlements;
    } catch (e) {
      if (e instanceof BillingUnavailableError) set({ billingEnabled: false, entitlements: null });
      return null;
    }
  },

  waitForPro: async () => {
    for (let attempt = 0; attempt < 10; attempt++) {
      const e = await get().refresh();
      if (e?.plan === "pro") return true;
      await new Promise((r) => setTimeout(r, 2000));
    }
    return false;
  },

  clear: () => set({ entitlements: null }),
}));

/**
 * "2/4": saved boards out of the plan's allowance, for plans with a limit (Free). Null for Pro (unlimited) or before
 * the plan has loaded. Shown on My Boards and in the My Boards menu.
 */
export function useBoardAllowance(count: number): string | null {
  const max = useBilling((b) => (b.entitlements && b.entitlements.plan !== "pro" ? b.entitlements.maxPlaygrounds : null));
  return max === null ? null : `${count}/${max}`;
}
