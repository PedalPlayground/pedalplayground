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

`deploy-beta-app.yml` deploys the beta app automatically on pushes to `beta` that change `web/`: it typechecks, builds and
uploads the app. Fast (about a minute), downloads only `web/`. Nothing here touches the live site.

The catalog (`/catalog/` on the server) isn't deployed from the repo any more. The *Catalog publish* workflow copies it from
Supabase to both servers; see docs/catalog-backend.md.

The app workflow can also be run by hand from the repository's **Actions** tab ("Run workflow"). Until you finish the setup
below, it's skipped (it checks that `BETA_DEPLOY_TARGET` is set), so pushing the branch first is safe.

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
The playground, Gallery and Gear pages all load it; Admin (`/editor/`) doesn't, so editors' work isn't counted.

**Page views.** GA's own page views are off (`send_page_view: false`). Instead `trackPage` in
`web/src/lib/analytics.ts` sends one `page_view` per screen, titled "<screen> · Pedal Playground": Playground, Shared
Board, Gallery, Gear, and "Gear: <brand> <name>" for each gear item. The address sent keeps only the parts that say
which screen it is (`p`, `item`, `kind`, `brand`, `type`, `sort`, `user`), so sign-in tokens and typed searches never
reach GA. In GA4, turn off Admin → Data streams → (the web stream) → Enhanced measurement → gear icon → "Page changes
based on browser history events", or the Gallery and Gear filters get counted as extra page views.

**Events.** `dialog_open` (`dialog`: the dialog's title, sent by `Modal` for every dialog), `panel_open` (`panel`: Add
Gear or Board Details), `gallery_filter` (`type`, `sort`, `one_person`), `gear_filter` (`kind`, `brand`, `type`,
`sort`), `login` (`method`), `sign_up`, `password_set`, `board_like`, `board_unlike`, `shared_board_copied`, `add_gear`,
`custom_item_created`, `share_link_created`, `upgrade_opened`, `whats_new_open`, `whats_new_pedals`, `whats_new_link`.
`add_gear` also says how the gear was found (`source`: `search`, `trending`, `new`, `replace` or `gear_page`).
`view_gear` is sent when a Gear item page opens (from the Gear site or a playground's Info button). Both gear events
carry `gearParams` from `web/src/lib/analytics.ts`: `gear_id` (the image key, as in `/gear/?item=`), `gear_name`
("Brand Name"), `gear_brand`, `gear_type` (main type, or "Pedalboard") and `kind`. Catalog names are public, so they're
fine to send; custom gear is never named. `board_view` is sent when someone opens another person's shared board, with
`board_id` (the slug in its `/?p=` link, never the board's name) and `from` (`gallery`, `gear_page`, `site` or `link`).
`board_like`, `board_unlike` and `shared_board_copied` carry the same `board_id`.
`tutorial_end` (`step`, `steps`, `finished`) says how far people get through the tour.
Never send names, emails, board contents or typed text. To see an event's details in reports, add each detail as an
event-scoped custom dimension (Admin → Custom definitions). Mark `sign_up` and `upgrade_opened` as key events if you
want them as conversions.

**Playground tools.** Every playground control sends one event, `tool_use`, through `trackTool(tool, via)` (or the
`withTool` wrapper for click handlers) in `web/src/lib/analytics.ts`. New controls should use it too, so one report
ranks them all.

- `tool`: which tool. Canvas: `add_gear`, `zoom_in`, `zoom_out`, `fit`, `back_to_center`, `undo`, `redo`, `share`,
  `select_all`, `context_menu`, `more`, `pan`, `zoom_gesture`, `move` (dragging gear), `box_select`. Selected gear:
  `lock`, `unlock`, `rotate`, `duplicate`, `group`, `ungroup`, `space_evenly`, `space_between`, `space_between_apply`,
  `move_forward`, `move_back`, `move_to_front`, `move_to_back`, `edit`, `replace`, `plugs`, `gear_info`, `suggest_fix`,
  `remove`, `nudge`. Plugs: `plug_add`, `plug_type`, `plug_remove`, `plug_done` (with `plug_type`). Add Gear panel:
  `gear_search` (once per open panel, never the words), `gear_feed` (`feed`), `make_your_own`. Settings cog:
  `snapping` (`on`), `tutorial`, `terms_privacy`, `send_feedback`, `export_file`, `import_file`. Playground menu:
  `new_playground`, `open_playground`, `all_playgrounds`, `playground_settings`. Share dialog: `share_copy_link`,
  `share_stop`. Side menus: `side_menu_expand`, `side_menu_collapse`.
- `via`: where it was used from. `toolbar` (bottom bar, and the big Add Gear button on wide screens), `side_menu` (the
  stacks down the sides on wide screens), `object_menu` (the bar across the top on tablets), `mini_menu` (the pill under
  the selection), `right_click`, `shortcut`, `gesture` (wheel, trackpad, pinch, drag), `panel`, `settings`, `canvas`,
  `switcher`, `dialog`.

Nudges, pans and wheel or pinch zooms count once per burst (a burst ends after 2 seconds without another), so holding
an arrow key is one `nudge`, not fifty.

To see the ranking in GA4: register `tool` and `via` as event-scoped custom dimensions (Admin → Custom definitions →
Create custom dimension, the "Event parameter" is `tool` or `via`), plus `source`, `feed`, `plug_type`, `on`, `step`
and `finished` if you want those. Then Explore → Free form: dimensions Event name, tool, via; metric Event count;
rows `tool`; filter Event name exactly matches `tool_use`. Add `via` as columns to see buttons against shortcuts.
**Popularity reports.** Register these event-scoped custom dimensions too: `gear_name`, `gear_brand`, `gear_type`,
`gear_id`, `kind`, `board_id`, `from`. Then build one Free form exploration per question (rows, metric Event count,
filter on Event name):

| Report | Event name | Rows | Columns |
| --- | --- | --- | --- |
| Most added gear | `add_gear` | `gear_name` | `source` |
| Most viewed gear | `view_gear` | `gear_name` | |
| Top brands | `add_gear` | `gear_brand` | |
| Top pedal types | `add_gear` | `gear_type` | |
| Most viewed boards | `board_view` | `board_id` | `from` |
| Most liked boards | `board_like` | `board_id` | |
| Most copied boards | `shared_board_copied` | `board_id` | |
| Tool rank | `tool_use` | `tool` | `via` |

Open a board from its `board_id` at `/?p=<board_id>`. GA's standard reports fold rare values into "(other)" once a
dimension has thousands of values a day; explorations show them all.

Dimensions only collect from the day they're registered, and reports lag by up to a day; Realtime and DebugView show
events at once.

**Checking events locally.** Analytics never sends from localhost, but `localStorage["pp:analytics-debug"] = "1"` (in
the browser console) logs every event to the console as `[analytics] tool_use {tool: "rotate", via: "shortcut"}`,
locally or on beta.

## Microsoft Clarity

Set `VITE_CLARITY_ID` (the project ID from Clarity → Settings → Setup) the same way as the GA ID, in
`web/.env.production`. It follows the same rules: production builds only, never on localhost, and stopped by the
consent banner or the Terms & Privacy switch. Text inside dialogs is masked from recordings. In Clarity, also set
masking to at least Balanced (Settings → Masking) so typed fields in the rest of the app stay hidden.

## Consent banner

`VITE_CONSENT` in `web/.env.production` decides who is asked before analytics starts: `off` (never, the current setting
for launch), `regional` (visitors whose time zone is in Europe) or `all`. Switching `off` to `regional` brings the
banner back for Europe with no other change. The opt-out in Settings → Terms & Privacy works in every mode.
