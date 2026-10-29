// Starts a Stripe Checkout session for the signed-in user and returns its URL.
// Card details are entered on Stripe's hosted page; this code never sees them.
import { ACTIVE_STATUSES, admin, HttpError, requireUser, siteUrl, stripe } from "../_shared/clients.ts";
import { handler } from "../_shared/http.ts";

Deno.serve(
  handler(async (req) => {
    const user = await requireUser(req);
    const body = await req.json().catch(() => ({}));
    const price = body.interval === "year" ? Deno.env.get("STRIPE_PRICE_YEARLY") : Deno.env.get("STRIPE_PRICE_MONTHLY");
    if (!price) throw new HttpError(500, "Pricing isn't configured yet.");

    const { data: row, error } = await admin
      .from("subscriptions")
      .select("stripe_customer_id,status")
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) throw error;
    if (row && ACTIVE_STATUSES.includes(row.status)) throw new HttpError(409, "You already have an active subscription.");

    let customer = row?.stripe_customer_id ?? null;
    if (!customer) {
      const created = await stripe.customers.create({ email: user.email ?? undefined, metadata: { user_id: user.id } });
      customer = created.id;
      const { error: upsertError } = await admin
        .from("subscriptions")
        .upsert({ user_id: user.id, stripe_customer_id: customer, status: "none" }, { onConflict: "user_id" });
      if (upsertError) throw upsertError;
    }

    const site = siteUrl();
    const tax = Deno.env.get("STRIPE_AUTOMATIC_TAX") === "true";
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer,
      client_reference_id: user.id,
      line_items: [{ price, quantity: 1 }],
      allow_promotion_codes: true,
      subscription_data: { metadata: { user_id: user.id } },
      success_url: `${site}/?billing=success`,
      cancel_url: `${site}/?billing=canceled`,
      ...(tax ? { automatic_tax: { enabled: true }, customer_update: { address: "auto" as const } } : {}),
    });
    if (!session.url) throw new HttpError(502, "Could not start checkout.");
    return { url: session.url };
  }),
);
