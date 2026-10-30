import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

/** Secrets are set with `supabase secrets set`; never hard-code them. */
export const env = (name: string) => {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing environment variable ${name}`);
  return v;
};

/** Service-role client: bypasses RLS. Only ever used server-side, after the caller is verified. */
export const admin = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false },
});

/** Resolves the signed-in user from the request's bearer token, or throws. */
export async function requireUser(req: Request) {
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) throw new HttpError(401, "Sign in first.");
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, "Sign in first.");
  return data.user;
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}
