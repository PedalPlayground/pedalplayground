# Billing and plans

Free accounts keep **one saved playground**; Pro accounts keep **unlimited**. Payments run through
Stripe Checkout (hosted by Stripe, so card details never touch our code) and the Stripe customer portal
(update card, switch plan, cancel, invoices).

## How it fits together

```
App ──(signed-in user)──▶ create-checkout-session ──▶ Stripe Checkout ──▶ back to /?billing=success
App ──(signed-in user)──▶ create-portal-session   ──▶ Stripe customer portal
Stripe ──(webhook)──────▶ stripe-webhook ──▶ public.subscriptions ──▶ user_plan() ──▶ limit trigger
App ◀── my_entitlements() (plan, limit, usage) ───────────────────────────────────────┘
```

- `supabase/migrations/20261023000000_billing.sql`: `plan_limits`, `subscriptions`, `user_plan()`,
  the limit trigger on `playgrounds`, and `my_entitlements()`.
- `supabase/functions/`: `create-checkout-session`, `create-portal-session`, `stripe-webhook`.
- The **database enforces the limit**, not the UI: inserting a playground past the limit fails with
  HTTP 402 (`playground_limit_reached`). The UI only reads `my_entitlements()` to explain it nicely.
- The webhook is the only writer of `subscriptions`. Clients can read their own row and nothing else.

## Rules built in (change them in one place each)

| Rule | Where |
| --- | --- |
| Free = 1 playground, Pro = unlimited | `plan_limits` table (edit the numbers, no deploy) |
| Sharing and forking are free | nothing gates them; forks count toward the limit like any playground |
| Downgrade or lapse | Existing playgrounds are never removed or locked; only *creating new* ones is blocked |
| `past_due` keeps Pro while Stripe retries payment | `user_plan()` and `ACTIVE_STATUSES` in `_shared/clients.ts` (keep the two in sync) |
| 3 day grace after the paid period ends | `user_plan()` (covers a late renewal webhook) |
| When a free user hits the limit | "New playground" opens the upgrade dialog; a save that would create one shows "Not saved to your account · Upgrade" and the board stays on this device |

## One-time setup

### 1. Stripe dashboard (use **test mode** first)

1. **Product:** create "Pedal Playground Pro" with two recurring prices (monthly and annual). Copy both price IDs.
2. **Customer portal** (Settings → Billing → Customer portal): enable cancel, update payment method, invoice history
   and plan switching between the two prices.
3. **Tax:** decide whether to use Stripe Tax. If yes, set it up and then set `STRIPE_AUTOMATIC_TAX=true` below.
4. **Webhook endpoint:** `https://<project-ref>.supabase.co/functions/v1/stripe-webhook`, listening for
   `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`,
   `customer.subscription.deleted`. Copy the signing secret.

### 2. Supabase

1. Run `supabase/migrations/20261023000000_billing.sql` in the SQL editor (safe to re-run).
2. Set function secrets (never commit these; the secret key and webhook secret are credentials):
   ```bash
   supabase secrets set \
     STRIPE_SECRET_KEY=sk_test_… \
     STRIPE_WEBHOOK_SECRET=whsec_… \
     STRIPE_PRICE_MONTHLY=price_… \
     STRIPE_PRICE_YEARLY=price_… \
     SITE_URL=https://pedalplayground.com \
     ALLOWED_ORIGINS=https://pedalplayground.com,http://localhost:5173
   ```
   `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided to functions automatically.
3. Deploy:
   ```bash
   supabase functions deploy create-checkout-session
   supabase functions deploy create-portal-session
   supabase functions deploy stripe-webhook --no-verify-jwt
   ```
   The webhook must be deployed with `--no-verify-jwt` because Stripe doesn't send a Supabase token;
   its authenticity comes from the Stripe signature check inside the function.

### 3. App (optional display labels)

In `web/.env.local`, `VITE_PRO_PRICE_MONTHLY="$X / month"` and `VITE_PRO_PRICE_YEARLY="$Y / year"` show prices in the
upgrade dialog. They're labels only; Stripe holds the real prices, so keep them in step by hand.

## Testing (test mode)

1. Run the webhook locally with the Stripe CLI: `stripe listen --forward-to <function URL>`, and use its signing secret
   for `STRIPE_WEBHOOK_SECRET` while testing.
2. Sign in, hit the free limit (create a second playground), and confirm the upgrade dialog appears.
3. Check out with Stripe's published test card `4242 4242 4242 4242` (any future expiry, any CVC). You should land
   on `/?billing=success`, see "You're on Pro" within a few seconds, and be able to create more playgrounds.
4. Open **Manage subscription**, cancel, and confirm Account shows "Ends <date>" and Pro continues until then.
5. Check these edge cases: a declined card (`4000 0000 0000 0341` fails on renewal), re-subscribing after cancel,
   two browser tabs creating a playground at the same time at the limit (the database serializes these), and
   a webhook that arrives twice or out of order (the handler re-reads the subscription from Stripe each time).

## Comping a user (free Pro, no Stripe)

```sql
insert into public.subscriptions (user_id, status)
values ('<user uuid>', 'active')
on conflict (user_id) do update set status = 'active';
```
Leaving `current_period_end` null means it never expires. Set `status = 'canceled'` to revoke.

## Before going live

- Switch Stripe to live mode: new keys, new webhook endpoint and secret, live price IDs, then re-set the secrets and
  redeploy. Test mode and live mode are completely separate in Stripe.
- Publish terms of service, a privacy policy and a refund/cancellation policy, and link them from the upgrade
  dialog and checkout. Sales tax or VAT handling needs a decision (Stripe Tax is one option).
- Legal, tax and compliance sign-off belongs to your responsible team or counsel, not to this document.
- Add a way for users to delete their account and data.
- Watch the webhook's delivery log in Stripe for the first week; failed deliveries are retried automatically.

## Not verified yet

The migration was parsed with a real Postgres parser but not run against a database. The Edge Functions were
type-checked against Stripe's and supabase-js's types but not run. Nothing has been exercised end to end against
Stripe, so do the test-mode walkthrough above before trusting any of it.
