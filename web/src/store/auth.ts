import { create } from "zustand";
import type { EmailOtpType, User } from "@supabase/supabase-js";
import { identifyUser, track } from "../lib/analytics";
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
  /**
   * Emails a password reset code and link. Supabase answers the same way whether or not the email has an account.
   * Returns an error message, or null on success.
   */
  sendPasswordReset: (email: string) => Promise<string | null>;
  /**
   * Completes sign-in with the emailed code. `recovery` is a password reset code, which signs in and then asks for
   * a new password. Returns an error message, or null on success.
   */
  verifyCode: (email: string, code: string, type?: "email" | "recovery") => Promise<string | null>;
  /** Signed in from a password reset: the Set a New Password dialog is showing. */
  recovering: boolean;
  /** Ends the reset step without setting a password (they stay signed in). */
  endRecovery: () => void;
  /** Sets a new password for the signed-in user. Returns an error message, or null on success. */
  updatePassword: (password: string) => Promise<string | null>;
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
  recovering: false,

  init: () => {
    if (!supabase) return;
    let loadedFor: string | null = null;
    const apply = (user: User | null) => {
      set({ user });
      if (!user) {
        loadedFor = null;
        set({ recovering: false });
        identifyUser(null);
        return set({ username: undefined });
      }
      if (user.id === loadedFor) return;
      loadedFor = user.id;
      set({ username: undefined });
      void fetchUsername(user.id).then((username) => {
        if (get().user?.id !== user.id) return;
        set({ username });
        identifyUser(user.id, username);
      });
    };
    supabase.auth.getSession().then(({ data }) => {
      apply(data.session?.user ?? null);
      set({ ready: true });
    });
    supabase.auth.onAuthStateChange((event, session) => {
      apply(session?.user ?? null);
      if (event === "PASSWORD_RECOVERY") set({ recovering: true });
    });
  },

  setUsername: (username) => {
    set({ username });
    const id = get().user?.id;
    if (id) identifyUser(id, username);
  },

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

  sendPasswordReset: async (email) => {
    if (!supabase) return "Cloud sign-in is not configured.";
    // The reset email's link goes to redirectTo when it's on the Redirect URLs allowlist, so beta stays on beta.
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
    return error ? error.message : null;
  },

  verifyCode: async (email, code, type = "email") => {
    if (!supabase) return "Cloud sign-in is not configured.";
    const { error } = await supabase.auth.verifyOtp({ email, token: code.replace(/\s/g, ""), type });
    if (error) return friendly(error.message);
    if (type === "recovery") set({ recovering: true });
    return null;
  },

  confirmTokenHash: async (tokenHash, type) => {
    if (!supabase) return "Cloud sign-in is not configured.";
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (error) return friendly(error.message);
    if (type === "recovery") set({ recovering: true });
    return null;
  },

  endRecovery: () => set({ recovering: false }),

  updatePassword: async (password) => {
    if (!supabase) return "Cloud sign-in is not configured.";
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      if (/different from the old/i.test(error.message)) return "That's your current password. Choose a new one.";
      if (/reauthenticat/i.test(error.message)) return "For security, sign out and back in, then change your password.";
      return error.message;
    }
    track("password_set");
    return null;
  },

  signOut: async () => {
    await supabase?.auth.signOut();
  },
}));
