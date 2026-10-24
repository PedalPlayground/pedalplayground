# Deploying the beta (beta.pedalplayground.com)

The beta runs from the existing droplet, as a separate Forge site. The live site is untouched. The catalog is
served from the same site (`/catalog/`), so it needs no CDN and no CORS setup. When the beta has proved itself,
moving to a static host and dropping Forge is a separate step (see `docs/handoff.md`).

Replace `beta.pedalplayground.com` and the droplet details below if yours differ.

## 1. DNS (DigitalOcean: Networking → Domains → pedalplayground.com)

Add one record: type `A`, hostname `beta`, value = the droplet's IP address. Leave every other record alone.
Check it with `nslookup beta.pedalplayground.com`.

## 2. Forge site

1. Forge → your server → **New Site**. Domain `beta.pedalplayground.com`. Project type **Static HTML** (or the closest
   equivalent). No repository: files are uploaded by `scripts/deploy.sh`.
2. Open the site → **SSL** → **Let's Encrypt** for the domain (the DNS record must already resolve).
3. Open the site → **Files → Edit Nginx Configuration**. Note the `root` line: that path is where files go
   (`DEPLOY_TARGET` below). Then add the following inside the `server { … }` block, below the existing `location /` block.
   Uses `expires` (not `add_header`) on purpose: an `add_header` inside a `location` would silently drop the
   server-level headers Forge sets.

   ```nginx
   # Beta: ask search engines not to index it.
   add_header X-Robots-Tag "noindex, nofollow" always;

   # Hashed catalog images never change for a given name: cache them for a year.
   location ~ ^/catalog/(thumb|img)/ {
       expires 1y;
       try_files $uri =404;
   }

   # The manifest changes on every catalog deploy: keep its cache short.
   location = /catalog/catalog.json {
       expires 5m;
   }

   # Built app assets are hashed too.
   location /assets/ {
       expires 1y;
       try_files $uri =404;
   }

   gzip on;
   gzip_types text/css application/javascript application/json image/svg+xml;
   ```

   Save, and Forge reloads nginx. If it reports an error, Forge keeps the old config; fix the snippet and retry.

## 3. Build settings

- `web/.env.local` holds the Supabase URL and anon key (already set for local development; Vite also loads it in
  beta mode). Never commit it.
- `web/.env.beta` holds the non-secret beta flags. Set `VITE_FEEDBACK_URL` (a `mailto:` or form link) if you want a
  "Send feedback" link.
- Optional price labels shown in the upgrade dialog: `VITE_PRO_PRICE_MONTHLY`, `VITE_PRO_PRICE_YEARLY` in `.env.beta`.

## 4. Deploy

```bash
cd web
DRY_RUN=1 DEPLOY_TARGET=forge@<droplet-ip>:<site-root-from-nginx> ./scripts/deploy.sh   # preview
DEPLOY_TARGET=forge@<droplet-ip>:<site-root-from-nginx> ./scripts/deploy.sh               # for real
```

The first deploy uploads about 376 MB of catalog; later ones only send what changed. The script builds in
`--mode beta`, uploads the app, then the hashed catalog images, and the manifest last.

## 5. Supabase settings for the beta address

Authentication → URL Configuration:
- **Site URL:** `https://beta.pedalplayground.com` (no trailing slash; the sign-in email's button is built from it).
- **Redirect URLs:** keep `http://localhost:5173` and add `https://beta.pedalplayground.com`.

## 6. Stripe (test mode)

See `docs/billing.md` for the full explanation. For the beta:
- Function secrets: `SITE_URL=https://beta.pedalplayground.com` and
  `ALLOWED_ORIGINS=https://beta.pedalplayground.com,http://localhost:5173`.
- Webhook endpoint: `https://<project-ref>.supabase.co/functions/v1/stripe-webhook`.
- Tell testers it's a beta in Stripe's test mode: the test card `4242 4242 4242 4242` works and real cards do not.

## 7. Smoke test on the live beta URL

- Page loads over HTTPS with a Beta badge; view-source or response headers show `noindex`.
- Search shows thumbnails, and placed pedals show their images (served from `/catalog/…`).
- Sign in with a new address and an existing one; the email's one-click button opens the beta URL, not localhost.
- Autosave, reload, second device; share link in a private window; fork; playground limit and upgrade flow.
- Create a share-preview thumbnail (save a playground, then open Playgrounds): it proves same-origin image export works.
- Dark mode, a phone, and a tablet.

## Rollback and cleanup

Nothing here touches the live site. To undo the beta: delete the Forge site and remove the `beta` DNS record. The
Supabase project and Stripe test data stay as they are.
