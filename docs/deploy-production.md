# Production deploy

The live site (pedalplayground.com) runs on the same droplet as the beta. The new app is uploaded to its own folder,
**`/home/forge/pedalplayground-web`**, outside the old site's folder, so uploading it changes nothing for visitors.
Visitors only see it once the live site's nginx `root` points there (the "switch" below). Rolling back is changing
that one line back.

Releases go out when the `production` branch moves (`.github/workflows/deploy-production.yml`). Beta keeps deploying
from `react-rebuild` as before.

## One-time setup (GitHub)

Reuse the deploy key the beta already uses (it's authorized on the droplet as the `forge` user).

1. **GitHub → the repository → Settings → Environments → New environment**, named exactly `production`:
   - **Deployment branches:** *Selected branches* → `production`.
   - **Secret** `PROD_SSH_PRIVATE_KEY`: the same private key as the beta. On the Mac: `pbcopy < ~/.ssh/pedalplayground_deploy`.
   - **Variables:**
     - `PROD_DEPLOY_TARGET`: `forge@<droplet-ip>:/home/forge/pedalplayground-web`
     - `PROD_KNOWN_HOSTS`: same value as `BETA_KNOWN_HOSTS`.
     - `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`: same values as the beta environment (one Supabase project for both).
2. **Create the branch and deploy:** make a `production` branch from `react-rebuild` (GitHub → Branches → New branch,
   source `react-rebuild`). The push starts *Deploy production* in the Actions tab. The first run uploads the whole
   catalog and takes longer; later runs only send what changed.

Nothing is visible to visitors yet. To check the upload, on the droplet: `ls /home/forge/pedalplayground-web` should
show `index.html`, `assets/` and `catalog/`.

## The switch (live site → new app)

1. **Forge → the server → the `pedalplayground.com` site → Files → Edit Nginx Configuration.**
   Copy the whole file somewhere safe first: that copy is the rollback.
2. Change the `root` line to:
   ```nginx
   root /home/forge/pedalplayground-web;
   ```
3. Add this inside `server { … }`, below the existing `location /` block (same caching rules as the beta, minus its
   noindex header, plus redirects for old pages):
   ```nginx
   # Old site pages: send them to the app.
   location = /list.html { return 301 /; }

   location ~ ^/catalog/(thumb|img)/ {
       expires 1y;
       try_files $uri =404;
   }
   location = /catalog/catalog.json {
       expires 5m;
   }
   location /assets/ {
       expires 1y;
       try_files $uri =404;
   }
   location = /index.html {
       expires -1;
   }

   gzip on;
   gzip_types text/css application/javascript application/json image/svg+xml;
   ```
   Save. If Forge reports an error, it keeps the old config; fix the snippet and retry.
4. **Supabase → Authentication → URL Configuration → Site URL:** `https://pedalplayground.com`. (Redirect URLs for
   pedalplayground.com and www were added ahead of time.)
5. **Check it:** open pedalplayground.com in a private window. The app loads with no Beta badge, search shows
   thumbnails, sign-in email arrives and its button opens pedalplayground.com, a saved board survives a reload, and a
   share link opens in another browser. Try it on a phone.

People who used the old site have their board saved in their browser. On their first visit after the switch, the new app loads it automatically (same address, so it can read it).

## Rollback

Paste the saved nginx config back in Forge (or change `root` back), and set the Supabase Site URL back to the beta
address. The old site's files were never touched.

## Later releases

Test on beta, then move `production` up to that commit: GitHub → Pull requests → New, base `production`, compare
`react-rebuild`, and merge. Each merge deploys.
