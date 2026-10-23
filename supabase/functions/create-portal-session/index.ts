// Opens Stripe's customer portal (update card, switch plan, cancel, invoices) for the signed-in user.
import { admin, HttpError, requireUser, siteUrl, stripe } from "../_shared/clients.ts";
import { handler } from "../_shared/http.ts";

Deno.serve(
  handler(async (req) => {
    const user = await requireUser(req);
    const { data: row, error } = await admin
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) throw error;
    if (!row?.stripe_customer_id) throw new HttpError(404, "There's no subscription to manage yet.");

    const session = await stripe.billingPortal.sessions.create({
      customer: row.stripe_customer_id,
      return_url: siteUrl(),
    });
    return { url: session.url };
  }),
);
