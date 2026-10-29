import Stripe from "https://esm.sh/stripe@17.7.0?target=denonext";
import { env } from "./supabase.ts";

// The Supabase helpers live in supabase.ts so functions that don't use Stripe can load without its secrets.
export { admin, HttpError, requireUser } from "./supabase.ts";

// Secrets are set with `supabase secrets set` (see docs/billing.md); never hard-code them.
export const stripe = new Stripe(env("STRIPE_SECRET_KEY"), { httpClient: Stripe.createFetchHttpClient() });

/** Verifies webhook signatures in Deno (no Node crypto). */
export const cryptoProvider = Stripe.createSubtleCryptoProvider();

export const siteUrl = () => env("SITE_URL").replace(/\/$/, "");

/** Subscription states that count as paying; must match public.user_plan() in the migration. */
export const ACTIVE_STATUSES = ["active", "trialing", "past_due"];
