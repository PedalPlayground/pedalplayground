import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import Stripe from "https://esm.sh/stripe@17.7.0?target=denonext";

/** Secrets are set with `supabase secrets set` (see docs/billing.md); never hard-code them. */
const env = (name: string) => {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing environment variable ${name}`);
  return v;
};

export const stripe = new Stripe(env("STRIPE_SECRET_KEY"), { httpClient: Stripe.createFetchHttpClient() });

/** Verifies webhook signatures in Deno (no Node crypto). */
export const cryptoProvider = Stripe.createSubtleCryptoProvider();

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

export const siteUrl = () => env("SITE_URL").replace(/\/$/, "");

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Subscription states that count as paying; must match public.user_plan() in the migration. */
export const ACTIVE_STATUSES = ["active", "trialing", "past_due"];
