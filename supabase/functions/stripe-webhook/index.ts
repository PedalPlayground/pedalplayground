// Receives Stripe events and keeps public.subscriptions in step.
//
// Deploy with --no-verify-jwt: Stripe doesn't send a Supabase token. Authenticity comes from the
// signature check below instead.
//
// Every relevant event re-reads the subscription from Stripe and writes that, rather than trusting the
// event payload. That makes handling idempotent and immune to events arriving out of order.
import type Stripe from "https://esm.sh/stripe@17.7.0?target=denonext";
import { ACTIVE_STATUSES, admin, cryptoProvider, stripe } from "../_shared/clients.ts";

const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");

/** Which user does this Stripe customer/subscription belong to? */
async function resolveUserId(sub: Stripe.Subscription, hint?: string | null): Promise<string | null> {
  if (sub.metadata?.user_id) return sub.metadata.user_id;
  if (hint) return hint;
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const { data } = await admin.from("subscriptions").select("user_id").eq("stripe_customer_id", customerId).maybeSingle();
  return data?.user_id ?? null;
}

async function syncSubscription(subscriptionId: string, userHint?: string | null) {
  const sub = await stripe.subscriptions.retrieve(subscriptionId);
  const userId = await resolveUserId(sub, userHint);
  if (!userId) {
    console.warn(`No user found for subscription ${sub.id}; ignoring`);
    return;
  }

  // A late "deleted" event for an old subscription must not wipe out a newer active one.
  const { data: existing } = await admin
    .from("subscriptions")
    .select("stripe_subscription_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (existing?.stripe_subscription_id && existing.stripe_subscription_id !== sub.id && !ACTIVE_STATUSES.includes(sub.status)) {
    return;
  }

  // The period end moved onto the subscription item in newer Stripe API versions.
  const periodEnd = (sub as unknown as { current_period_end?: number }).current_period_end ??
    (sub.items.data[0] as unknown as { current_period_end?: number } | undefined)?.current_period_end;

  const { error } = await admin.from("subscriptions").upsert(
    {
      user_id: userId,
      stripe_customer_id: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
      stripe_subscription_id: sub.id,
      status: sub.status,
      price_id: sub.items.data[0]?.price.id ?? null,
      current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
      cancel_at_period_end: sub.cancel_at_period_end,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) throw error;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  if (!webhookSecret) return new Response("Webhook secret not configured", { status: 500 });

  const signature = req.headers.get("stripe-signature");
  if (!signature) return new Response("Missing signature", { status: 400 });

  let event: Stripe.Event;
  try {
    // The raw body is required for the signature to verify.
    event = await stripe.webhooks.constructEventAsync(await req.text(), signature, webhookSecret, undefined, cryptoProvider);
  } catch (e) {
    console.warn("Bad webhook signature", e instanceof Error ? e.message : e);
    return new Response("Invalid signature", { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode === "subscription" && session.subscription) {
          const id = typeof session.subscription === "string" ? session.subscription : session.subscription.id;
          await syncSubscription(id, session.client_reference_id);
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await syncSubscription((event.data.object as Stripe.Subscription).id);
        break;
      default:
        break; // other events are acknowledged and ignored
    }
  } catch (e) {
    console.error(`Failed handling ${event.type}`, e);
    return new Response("Handler error", { status: 500 }); // Stripe retries on non-2xx
  }
  return new Response(JSON.stringify({ received: true }), { headers: { "Content-Type": "application/json" } });
});
