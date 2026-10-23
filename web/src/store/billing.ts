import { create } from "zustand";
import { BillingUnavailableError, fetchEntitlements, type Entitlements } from "../lib/billing";
import { supabase } from "../lib/supabase";
import { useAuth } from "./auth";

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
  billingEnabled: true,

  refresh: async () => {
    if (!supabase || !useAuth.getState().user) {
      set({ entitlements: null });
      return null;
    }
    try {
      const entitlements = await fetchEntitlements();
      set({ entitlements, billingEnabled: true });
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
