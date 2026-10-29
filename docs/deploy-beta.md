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

   # The page itself must always revalidate so a deploy takes effect at once. The deploy replaces the hashed
   # files in /assets/, so a stale cached page would point at files that no longer exist.
   location = /index.html {
       expires -1;
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

The first deploy uploads about 376 MB of catalog; later ones skip images the server already has (their names contain a
hash of the source). The script builds in `--mode beta`, uploads the app, then the hashed catalog images, and the manifest last.
Use `DEPLOY_PARTS=app` or `DEPLOY_PARTS=catalog` to deploy just one half (the default is both).

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

## Automated deploys (GitHub Actions)

Two workflows deploy the beta automatically on pushes to `beta`; nothing here touches the live site or `master`:

- `deploy-beta-app.yml`: when `web/` changes. Typechecks, builds, uploads the app. Fast (about a minute), downloads only `web/`.
- `deploy-beta-catalog.yml`: when `public/data`, the pedal/pedalboard images, or the catalog scripts change. Validates the catalog,
  rebuilds it, uploads only the images the server doesn't have, then the manifest.

Both can also be run by hand from the repository's **Actions** tab ("Run workflow"). Until you finish the setup below, both
jobs are skipped (they check that `BETA_DEPLOY_TARGET` is set), so pushing the branch first is safe.

### One-time setup

1. **Create a deploy key just for CI.** Use a new key, not your personal one, so you can revoke it independently.
   It needs no passphrase because CI can't type one; GitHub stores it encrypted.
   ```bash
   ssh-keygen -t ed25519 -f ~/.ssh/pedalplayground_deploy -N "" -C "github-actions beta deploy"
   cat ~/.ssh/pedalplayground_deploy.pub
   ```
2. **Authorize it on the droplet:** Forge → your server → **SSH Keys** → add the public line printed above.
3. **GitHub → the repository → Settings → Environments → New environment**, named exactly `beta`:
   - **Deployment branches:** *Selected branches* → `beta`. This stops any other branch (or a changed workflow
     on another branch) from using the key.
   - **Secret** `BETA_SSH_PRIVATE_KEY`: the *private* key file. Copy it with `pbcopy < ~/.ssh/pedalplayground_deploy`.
     Never paste it anywhere else.
   - **Variables** (not secrets; none of these are sensitive):
     - `BETA_DEPLOY_TARGET`: `forge@<droplet-ip>:/home/forge/beta.pedalplayground.com/public`. Also add this one as a
       **repository** variable (Settings → Secrets and variables → Actions → Variables): the jobs' `if` check runs before the
       environment loads, so it can't see environment variables, and the jobs would be skipped.
     - `BETA_KNOWN_HOSTS`: the server's host key, so CI never trusts an unknown or changed server. Get it with
       `ssh-keyscan -t ed25519 <droplet-ip>`, check that `ssh-keyscan -t ed25519 <droplet-ip> | ssh-keygen -lf -` shows the fingerprint
       you verified the first time you connected, then paste the one line it prints.
     - `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`: the same two values as in `web/.env.local` (public by design).
4. **Run it once by hand:** Actions → *Deploy beta (app)* → Run workflow. Then check the live site.

### What the key can do, and how it's limited

A key added in Forge logs in as the `forge` user, which can write every site on that server, including the live one.
So treat the key and the repository's write access as sensitive:
- Secrets aren't available to workflows triggered by pull requests from forks, and the `beta` environment only releases the key
  to `beta`. Keep write access to the repository limited to people you trust, and consider branch protection on `beta`.
- The workflows pin their actions to exact commits. Update those pins deliberately.
- To stop automated deploys at once: delete the key in Forge, or clear the `BETA_DEPLOY_TARGET` variable (the jobs then skip).
- To rotate: create a new key, update the secret, then remove the old key in Forge. If Forge offers per-site isolation for the beta site,
  using it narrows what the key can reach; check that option in the site's settings.

## Rollback and cleanup

Nothing here touches the live site. To undo the beta: delete the Forge site and remove the `beta` DNS record. The
Supabase project and Stripe test data stay as they are.


## Analytics (Google Analytics 4)

Set `VITE_GA_ID=G-XXXXXXXXXX` (the GA4 web stream's measurement ID) in the environment the build runs in, for example
the `.env.production` that the deploy uses or the GitHub environment's variables. With no ID the build contains no
analytics code at all. It never runs on localhost, and visitors can turn it off in Settings → Terms & Privacy.
Events sent: `add_gear`, `custom_item_created`, `share_link_created`, `sign_up`, `upgrade_opened`. Mark
`sign_up` and `upgrade_opened` as key events in GA4 if you want them as conversions.

## Microsoft Clarity

Set `VITE_CLARITY_ID` (the project ID from Clarity → Settings → Setup) the same way as the GA ID, in
`web/.env.production`. It follows the same rules: production builds only, never on localhost, and stopped by the
consent banner or the Terms & Privacy switch. Text inside dialogs is masked from recordings. In Clarity, also set
masking to at least Balanced (Settings → Masking) so typed fields in the rest of the app stay hidden.

## Consent banner

`VITE_CONSENT` in `web/.env.production` decides who is asked before analytics starts: `off` (never, the current setting
for launch), `regional` (visitors whose time zone is in Europe) or `all`. Switching `off` to `regional` brings the
banner back for Europe with no other change. The opt-out in Settings → Terms & Privacy works in every mode.
