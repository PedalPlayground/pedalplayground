# Launch: production setup

Two things to do by hand before the live site switches to the new app. Both are outside the repository (the server and the
Supabase and Stripe dashboards), so nothing here can be done by a deploy. The beta guide (`docs/deploy-beta.md`) has the full
background for each; this page is the short version, in the order to do them.

Use the production address in place of `pedalplayground.com` below if the live site differs.

## 1. Let search engines index the live site

The beta tells search engines to stay away with a response header. Production must **not** send it, and it has to be set up
as its own site, because the nginx snippet in the beta guide is only for the beta site.

1. In Forge, open the **live site** (not the beta site) → **Files → Edit Nginx Configuration**.
2. Look through the file for `X-Robots-Tag`. If the line `add_header X-Robots-Tag "noindex, nofollow" always;` is there,
   delete it. If the live site was cloned from the beta site's config, it will be.
3. Make sure the single-page app fallback is in the `location /` block, so a pasted share link or a reload on a deep link
   opens the app instead of a 404:

   ```nginx
   location / {
       try_files $uri $uri/ /index.html;
   }
   ```

4. Copy in the cache rules from the beta guide (the `/catalog/…`, `/assets/` and `/index.html` blocks and the `gzip` lines),
   but **not** the `X-Robots-Tag` line. Save; Forge reloads nginx and keeps the old config if the new one has an error.
5. Deploy the app to the live site's folder (the `root` path in that same nginx file):

   ```bash
   cd web
   BUILD_MODE=production DRY_RUN=1 DEPLOY_TARGET=forge@<droplet-ip>:<live-site-root> ./scripts/deploy.sh   # preview
   BUILD_MODE=production DEPLOY_TARGET=forge@<droplet-ip>:<live-site-root> ./scripts/deploy.sh               # for real
   ```

   `BUILD_MODE=production` matters: it builds with `web/.env.production`, which carries the Google Analytics and Clarity IDs
   (the beta build has none). The first run uploads the whole catalog, which takes a while.
6. Check it from your terminal. Both of these should show **no** `x-robots-tag` line:

   ```bash
   curl -sI https://pedalplayground.com/ | grep -i x-robots-tag
   curl -sI https://pedalplayground.com/catalog/catalog.json | grep -i x-robots-tag
   ```

   Then in Google Search Console, add the site (if it isn't there already) and use **URL inspection → Request indexing**
   on the home page.
7. Optional: put a `robots.txt` in `web/public/` that allows everything, and a sitemap line if you add one. Without a
   `robots.txt`, crawlers assume everything is allowed, so this isn't required.

## 2. Supabase and Stripe in production

### Decide first: one Supabase project, or two

The beta and the live site currently share one Supabase project. That is fine for the database (both see the same accounts
and playgrounds), but **Stripe is configured per project**, not per site. The function secrets (`STRIPE_SECRET_KEY`,
`STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_*`, `SITE_URL`) are single values, so once you put live Stripe keys in, the beta's
checkout also charges real cards, and its checkout redirects back to `SITE_URL`, which is the live site.

Pick one:

- **Recommended: a second Supabase project for production.** The beta keeps Stripe test mode and its own accounts. Live gets
  clean accounts and live Stripe. Apply the migrations to the new project (`supabase link` to it, then `supabase db push`),
  deploy the functions to it, and point the live build at it (`VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in
  `web/.env.production`). Existing beta accounts do not carry over.
- **Keep one project, and take the beta off Stripe test mode.** Everyone, including beta testers, pays for real. Simpler,
  but you lose a safe place to test checkout.

The rest assumes the first choice. If you keep one project, run the same steps against it.

### Stripe dashboard (switch to **live mode** with the toggle at the top)

1. **Product:** create "Pedal Playground Pro" again in live mode, with the monthly and annual prices. Copy both live price IDs
   (they differ from the test ones).
2. **Customer portal** (Settings → Billing → Customer portal): turn on cancel, update payment method, invoice history and plan
   switching between the two prices. Live and test have separate portal settings. Save.
3. **Tax:** decide on Stripe Tax. If you use it, set it up in live mode and set `STRIPE_AUTOMATIC_TAX=true` below.
4. **Webhook:** Developers → Webhooks → Add endpoint, in live mode.
   - URL: `https://<production-project-ref>.supabase.co/functions/v1/stripe-webhook`
   - Events: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`,
     `customer.subscription.deleted`
   - Copy the signing secret (`whsec_…`) it shows.
5. Developers → API keys: copy the live **secret key** (`sk_live_…`). Keep it out of the repo and out of chat.

### Supabase (production project)

1. **Authentication → URL Configuration:** Site URL `https://pedalplayground.com` (no trailing slash). Redirect URLs:
   `https://pedalplayground.com`.
2. **Authentication → SMTP:** custom SMTP is required before launch (the built-in sender only emails your own team and is
   limited to 2 emails an hour). Use a sender on your domain, add the provider's SPF, DKIM and DMARC records, and turn off
   click and open tracking. Raise the email rate limit above the default.
3. **Authentication → Email Templates:** paste `docs/auth-email-template.html` into **Magic Link** and **Confirm signup**
   (details in `docs/auth.md`).
4. **Function secrets**, from a terminal linked to the production project:

   ```bash
   supabase secrets set \
     STRIPE_SECRET_KEY=sk_live_… \
     STRIPE_WEBHOOK_SECRET=whsec_… \
     STRIPE_PRICE_MONTHLY=price_… \
     STRIPE_PRICE_YEARLY=price_… \
     SITE_URL=https://pedalplayground.com \
     ALLOWED_ORIGINS=https://pedalplayground.com
   ```

   Do not include `localhost` in the live `ALLOWED_ORIGINS`. Add `STRIPE_AUTOMATIC_TAX=true` if you turned on Stripe Tax.
5. **Deploy the functions** (the webhook and `get-prices` must be public; Stripe and signed-out visitors don't send a token):

   ```bash
   supabase functions deploy create-checkout-session
   supabase functions deploy create-portal-session
   supabase functions deploy stripe-webhook --no-verify-jwt
   supabase functions deploy get-prices --no-verify-jwt
   ```

6. Make sure the migrations are applied to this project (`supabase db push --linked`). Never apply schema changes without
   Trav's go-ahead.

### Test it with one real purchase

1. In a private window on the live site, make a new account, hit the one-playground limit, and open the upgrade dialog.
   The prices should show without an error.
2. Buy the monthly plan with a real card (you can refund it right after). You should land back on `/?billing=success`, see
   "You're on Pro" within a few seconds, and be able to create more playgrounds.
3. **Manage subscription** opens the Stripe portal. Cancel from there; the account should show "Ends <date>" and keep Pro
   until then. Refund the test charge in the Stripe dashboard.
4. In Stripe → Developers → Webhooks, open the endpoint and check the recent deliveries all show a 200. Watch it for the
   first week.
5. Confirm the sign-in email arrives from your own domain, in the inbox, and that its button opens the live site.

### Before the first customer

- Publish the refund and cancellation policy, and link it from the upgrade dialog or checkout. The Terms and Privacy text is
  in the app already; the legal review is separate.
- Decide on sales tax or VAT (Stripe Tax is one way).
- Add a way for users to delete their account and data.
