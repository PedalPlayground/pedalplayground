import { create } from "zustand";
import type { EmailOtpType, User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";

interface AuthState {
  user: User | null;
  ready: boolean;
  cloudEnabled: boolean;
  init: () => void;
  /** Emails a 6-digit code (and a link). Returns an error message, or null on success. */
  sendCode: (email: string) => Promise<string | null>;
  /** Completes sign-in with the emailed code. Returns an error message, or null on success. */
  verifyCode: (email: string, code: string) => Promise<string | null>;
  /** Completes sign-in from an emailed link's token hash. Returns an error message, or null on success. */
  confirmTokenHash: (tokenHash: string, type: EmailOtpType) => Promise<string | null>;
  signOut: () => Promise<void>;
}

const friendly = (message: string) =>
  /expired|invalid/i.test(message) ? "That code or link is invalid or has expired. Request a new code." : message;

export const useAuth = create<AuthState>((set) => ({
  user: null,
  ready: !supabase,
  cloudEnabled: !!supabase,

  init: () => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => set({ user: data.session?.user ?? null, ready: true }));
    supabase.auth.onAuthStateChange((_event, session) => set({ user: session?.user ?? null }));
  },

  sendCode: async (email) => {
    if (!supabase) return "Cloud sign-in is not configured.";
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin } });
    return error ? error.message : null;
  },

  verifyCode: async (email, code) => {
    if (!supabase) return "Cloud sign-in is not configured.";
    const { error } = await supabase.auth.verifyOtp({ email, token: code.replace(/\s/g, ""), type: "email" });
    return error ? friendly(error.message) : null;
  },

  confirmTokenHash: async (tokenHash, type) => {
    if (!supabase) return "Cloud sign-in is not configured.";
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    return error ? friendly(error.message) : null;
  },

  signOut: async () => {
    await supabase?.auth.signOut();
  },
}));
