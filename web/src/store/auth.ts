import { create } from "zustand";
import type { EmailOtpType, User } from "@supabase/supabase-js";
import { track } from "../lib/analytics";
import { fetchUsername } from "../lib/profiles";
import { supabase } from "../lib/supabase";

interface AuthState {
  user: User | null;
  /** The signed-in user's username: null when they haven't picked one, undefined while loading or unsupported. */
  username: string | null | undefined;
  setUsername: (username: string) => void;
  ready: boolean;
  cloudEnabled: boolean;
  init: () => void;
  /**
   * Emails a 6-digit code (and a link). `username` is for a new account (an existing one ignores it).
   * Returns an error message, or null on success.
   */
  sendCode: (email: string, username?: string) => Promise<string | null>;
  /** Signs in with email and password. Returns an error message, or null on success. */
  signInWithPassword: (email: string, password: string) => Promise<string | null>;
  /**
   * Creates an account with a password. "confirm" means the account exists but the email must be confirmed first
   * (when the project requires it); otherwise the user is signed in.
   */
  signUp: (email: string, password: string, username: string) => Promise<{ error: string | null; confirm?: boolean }>;
  /** Completes sign-in with the emailed code. Returns an error message, or null on success. */
  verifyCode: (email: string, code: string) => Promise<string | null>;
  /** Completes sign-in from an emailed link's token hash. Returns an error message, or null on success. */
  confirmTokenHash: (tokenHash: string, type: EmailOtpType) => Promise<string | null>;
  signOut: () => Promise<void>;
}

const friendly = (message: string) =>
  /expired|invalid/i.test(message) ? "That code or link is invalid or has expired. Request a new code." : message;

/** The profile trigger refuses a username someone grabbed a moment earlier, which surfaces as a database error. */
const signUpError = (message: string) =>
  /database error saving new user/i.test(message) ? "That username was just taken. Try another." : message;

export const useAuth = create<AuthState>((set, get) => ({
  user: null,
  username: undefined,
  ready: !supabase,
  cloudEnabled: !!supabase,

  init: () => {
    if (!supabase) return;
    let loadedFor: string | null = null;
    const apply = (user: User | null) => {
      set({ user });
      if (!user) {
        loadedFor = null;
        return set({ username: undefined });
      }
      if (user.id === loadedFor) return;
      loadedFor = user.id;
      set({ username: undefined });
      void fetchUsername(user.id).then((username) => {
        if (get().user?.id === user.id) set({ username });
      });
    };
    supabase.auth.getSession().then(({ data }) => {
      apply(data.session?.user ?? null);
      set({ ready: true });
    });
    supabase.auth.onAuthStateChange((_event, session) => apply(session?.user ?? null));
  },

  setUsername: (username) => set({ username }),

  sendCode: async (email, username) => {
    if (!supabase) return "Cloud sign-in is not configured.";
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin, ...(username ? { data: { username } } : {}) },
    });
    return error ? signUpError(error.message) : null;
  },

  signInWithPassword: async (email, password) => {
    if (!supabase) return "Cloud sign-in is not configured.";
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (!error) return null;
    return /invalid login credentials/i.test(error.message)
      ? "That email and password don't match. If you signed up with an email link, use a sign-in code instead."
      : error.message;
  },

  signUp: async (email, password, username) => {
    if (!supabase) return { error: "Cloud sign-in is not configured." };
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: window.location.origin, data: { username } },
    });
    if (error) return { error: signUpError(error.message) };
    // Supabase answers an already-registered email with a user that has no identities (so it doesn't leak who has
    // an account); treat it as "sign in instead".
    if (data.user && data.user.identities?.length === 0) return { error: "There's already an account with that email. Sign in instead." };
    track("sign_up");
    return { error: null, confirm: !data.session };
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
