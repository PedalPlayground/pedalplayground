import { create } from "zustand";
import type { User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";

interface AuthState {
  user: User | null;
  ready: boolean;
  cloudEnabled: boolean;
  init: () => void;
  sendMagicLink: (email: string) => Promise<string | null>;
  signOut: () => Promise<void>;
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  ready: !supabase,
  cloudEnabled: !!supabase,

  init: () => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => set({ user: data.session?.user ?? null, ready: true }));
    supabase.auth.onAuthStateChange((_event, session) => set({ user: session?.user ?? null }));
  },

  sendMagicLink: async (email) => {
    if (!supabase) return "Cloud sign-in is not configured.";
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    });
    return error ? error.message : null;
  },

  signOut: async () => {
    await supabase?.auth.signOut();
  },
}));
