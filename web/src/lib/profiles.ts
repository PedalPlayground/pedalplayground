import { supabase } from "./supabase";

/** Keep in step with the profiles_username_format check in the profiles migration. */
export const USERNAME_PATTERN = /^[A-Za-z0-9_-]{3,24}$/;

const isMissing = (code?: string) => code === "42P01" || code === "PGRST205" || code === "PGRST202" || code === "42883";

/** False once we learn the database has no profiles table yet, so nothing asks for a username. */
export let profilesSupported = true;

/** A short reason the name can't be used, or null when its format is fine. */
export function usernameProblem(name: string): string | null {
  if (name.length < 3) return "At least 3 characters.";
  if (name.length > 24) return "24 characters at most.";
  if (!USERNAME_PATTERN.test(name)) return "Letters, numbers, - and _ only.";
  return null;
}

/** True when nobody has the name (any case). Unknown (true) when the check isn't available. */
export async function usernameAvailable(name: string): Promise<boolean> {
  if (!supabase || !profilesSupported) return true;
  const { data, error } = await supabase.rpc("username_available", { name });
  if (error) {
    if (isMissing(error.code)) profilesSupported = false;
    return true;
  }
  return data === true;
}

/** The user's username, null when they haven't picked one, or undefined when profiles aren't set up. */
export async function fetchUsername(userId: string): Promise<string | null | undefined> {
  if (!supabase || !profilesSupported) return undefined;
  const { data, error } = await supabase.from("profiles").select("username").eq("user_id", userId).maybeSingle();
  if (error) {
    if (isMissing(error.code)) profilesSupported = false;
    return undefined;
  }
  return (data as { username: string } | null)?.username ?? null;
}

/** Saves the user's username. Returns an error message, or null on success. */
export async function saveUsername(userId: string, username: string): Promise<string | null> {
  if (!supabase) return "Accounts aren't set up on this build.";
  const { error } = await supabase.from("profiles").upsert({ user_id: userId, username }, { onConflict: "user_id" });
  if (!error) return null;
  if (error.code === "23505") return "That username is taken.";
  return error.message;
}
