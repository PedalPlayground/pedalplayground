# Handoff: Pedal Playground React rebuild

State as of **2026-10-24**, branch `react-rebuild` (pushed to GitHub, well ahead of `master`). Written for a fresh
Claude session (or a person) picking this up with no prior context. It contains no credentials: secrets are named, never
included, and none are in the repository.

## Start here: prompt for a new Claude session

Paste this into the first message, with the repository open on branch `react-rebuild`:

> I'm continuing a project from an earlier session. Read `docs/handoff.md` completely before doing anything, then
> `docs/billing.md`, `docs/auth.md`, `docs/catalog.md` and `docs/deploy-beta.md` as needed. Summarize back to me in
> ten lines or fewer: what exists, what's pending right now, and what you'd do first. Don't change anything, push,
> deploy, or touch any external account until I've confirmed the plan. Follow the working agreements in the handoff.

## What this is

Pedal Playground is an interactive planner for guitar pedalboards: users pick real pedals and pedalboards from a catalog
(real dimensions and photos) and arrange them at scale on a canvas.

- **Legacy site:** a jQuery app (repo root: `index.html`, `app/`, `public/`), served in production from a DigitalOcean droplet
  managed by Laravel Forge. Forge auto-deploys `master`, and the live site serves the repository root as static files.
- **The rebuild:** a React app in `web/` with accounts, cloud-saved playgrounds, sharing, and a paid tier. This is what the
  work on `react-rebuild` is.
- **Catalog:** about 8,900 pedals and 270 pedalboards, contributed by the community through pull requests (JSON entries plus
  PNG photos). That contribution flow must keep working.
- **Business model, decided:** launch with billing from day one. **Free:** one saved playground (sharing and forking allowed).
  **Pro:** unlimited playgrounds. Guests can use the app locally without an account.

## Where things stand

| Area | Status |
| --- | --- |
| App: canvas (pan/zoom/pinch, select, marquee, drag, snapping, rotate, flip, z-order, undo/redo), search, custom pedals/boards, dark mode, import of old saves | Built, exercised in a browser |
| Catalog pipeline (thumbnails and canvas images, hashed names, manifest), contributor validator, CI | Built and working |
| Sign-in by emailed 6-digit code (link as backup) via Supabase + Resend | Built; **real email test passed** (new-account path) |
| Cloud autosave with versions, playground switcher, rename, delete, share links, fork-on-open | Built; manually tested by the owner |
| Billing (Stripe test mode): checkout, webhook, plan limits, upgrade UI, portal | **Tested end to end:** purchase, cancel, undo cancel all synced correctly |
| Beta site at `https://beta.pedalplayground.com` | **Deployed and serving** (HTTP-verified; not yet smoke-tested by a person) |
| GitHub Actions for beta deploys | Written and pushed; **inactive until the `beta` environment is configured** |
| Signal path mode, equipment list mode, export as image, ads, donate banner, account page | Not built |
| Legal (terms, privacy, refunds, tax), account deletion | Not done |

## Architecture and repo map

- `web/` the React app (Vite 7, React 19, TypeScript, Zustand, Tailwind 4, Radix). Node 22 required (`web/.nvmrc`).
  - `src/components`, `src/store` (Zustand stores: playground, cloud, auth, billing, ui, catalog), `src/lib` (importers,
    geometry/snapping, thumbnail renderer, cloud and billing clients).
  - `scripts/catalog/` catalog build and validator; `scripts/deploy.sh` build-and-rsync (`DEPLOY_PARTS=app|catalog|all`).
  - Positions and sizes are in inches. A saved playground is a JSON document (`schemaVersion: 3`); older v2/HTML saves import.
- `supabase/` `migrations/` (three, all applied) and `functions/` (`create-checkout-session`, `create-portal-session`, `stripe-webhook`).
- `docs/` `billing.md`, `auth.md`, `catalog.md`, `deploy-beta.md`, `auth-email-template.html`, this file.
- `.github/workflows/` `web.yml` (typecheck), `catalog.yml` (validate pull requests), `deploy-beta-app.yml`, `deploy-production.yml`, `catalog-publish.yml` (builds the catalog in Supabase and copies it to the servers).
- Repo root (legacy site) is untouched by the rebuild, except two small additions to `.gitignore`.

## Infrastructure map (all accounts are the owner's own)

| Piece | What it does | State |
| --- | --- | --- |
| **Supabase** (one project, paid plan) | Postgres, auth, Edge Functions | Reuses the original prototype project, so it still holds old prototype data: 11 playgrounds across 3 owners, 4 auth users. All 3 migrations applied. Functions deployed. Function secrets set and verified (Stripe key, webhook secret, two price IDs, `SITE_URL`, `ALLOWED_ORIGINS`). Auth settings are configured in the dashboard, not in code: custom SMTP (Resend), both email templates pasted. |
| **Stripe** (test mode / sandbox only) | Subscriptions | Product with monthly and annual prices, customer portal, webhook endpoint. Live mode is not set up. |
| **Resend** | Sends sign-in email | Sending domain `mail.pedalplayground.com`, verified. Free plan (100 emails a day cap). |
| **DigitalOcean** | DNS and the droplet | DNS for `pedalplayground.com` lives here. `A` records for the root, `www` and `beta` point at the droplet. Resend (DKIM, `send.mail`) and DMARC (`p=none`) records are present. |
| **Laravel Forge** (Hobby plan) | Manages the droplet | Legacy site auto-deploys `master`. The beta is a separate static Forge site, uploaded by script or CI, with Let's Encrypt HTTPS. |
| **GitHub** | Repo `PedalPlayground/pedalplayground` (public) | `react-rebuild` is pushed. Workflows skip until configured. |

## Decisions already made

- Vite/React/TypeScript/Zustand/Tailwind/Radix; DOM canvas with one pan/zoom transform; desktop-first, tablet-usable.
- Supabase + Stripe Checkout and customer portal. Limits live in the database (`plan_limits`) and are enforced by a trigger
  (HTTP 402); the UI only explains them.
- Downgrades keep all existing playgrounds editable and only block creating new ones. Past-due payments keep Pro through
  Stripe's retry window, plus a 3-day grace after the period end.
- Sign-in is passwordless (code first). Emails come from a dedicated subdomain (`mail.`), not the root domain.
- Beta runs on the existing droplet (same origin for the app and catalog, so no CDN or CORS yet). Moving to a static host
  and dropping Forge is a later, separate step.
- Catalog contributions continue through pull requests for now; an admin back end is the longer-term replacement.

## Pending right now (the in-flight items)

1. **Beta nginx rule:** add `location = /index.html { expires -1; }` to the beta Forge site's nginx config (the snippet is in
   `docs/deploy-beta.md`). Verified missing: `/index.html` currently sends no `Cache-Control`.
2. **Supabase Site URL:** set it to `https://beta.pedalplayground.com` and add the same to Redirect URLs (keep
   `http://localhost:5173`). Not verified whether this is done; the sign-in email's one-click button depends on it.
3. **GitHub beta deploys:** create the `beta` environment (deployment branch restricted to `react-rebuild`), add the secret
   `BETA_SSH_PRIVATE_KEY` and the variables `BETA_DEPLOY_TARGET`, `BETA_KNOWN_HOSTS`, `VITE_SUPABASE_URL`,
   `VITE_SUPABASE_ANON_KEY`, using a dedicated deploy key. Steps are in `docs/deploy-beta.md`. Then run the app workflow once by hand.
4. **Beta smoke test by a person** (list in `docs/deploy-beta.md`): sign-in with a new and an existing address, headers
   (SPF/DKIM/DMARC pass), second device, share link in a private window, upgrade with the test card, dark mode, phone, tablet.

## Untested or only partly tested

- The failing-card path (`4000 0000 0000 0341`) and a fresh re-subscribe after a period ends. Cancel and un-cancel work.
- Sign-in with an **existing** account address, link scanners (for example Microsoft 365), cross-device sign-in.
- Real touch devices (pinch and touch drag were only simulated).
- The two deploy workflows have only run in their skipped state; the deploy script itself has run for real from a laptop.
- Importing a real old HTML-blob save (including custom pedal colors).
- Production behavior at any scale; there is no load testing and no unit tests yet.

## Known risks and gaps

- **Version history grows without bound.** Every autosave inserts a full document row. Add pruning before real traffic.
- **Double checkout** can create two subscriptions; only one is recorded.
- **Merging into `master` before cutover would publish `/web`, `/docs`, `/supabase` on the live domain** (it serves the repo
  root). No secrets are in them, but it's unintended. Don't merge `react-rebuild` into `master` until a cutover plan exists.
- **A Forge-authorized deploy key acts as the `forge` user,** which can write every site on the server, including the live one.
- **Catalog data:** 10 entries point at missing images (hidden from the app), about 96 images are unreferenced, 4 pedal sizes look
  wrong, and 220 known validator errors are frozen in `web/scripts/catalog/baseline.json`.
- **Prototype data** sits in the same Supabase project as the beta. Decide whether to clean it before real users.
- **No account deletion, no terms or privacy policy.** Sales tax or VAT handling is undecided. Legal sign-off belongs to the
  owner's own advisors.
- **Prices:** the upgrade dialog's price labels are hand-typed (`VITE_PRO_PRICE_*`) and can drift from Stripe. They aren't set yet.

## Prioritized next steps

**Before real users**
1. Finish the four pending items above.
2. Add version pruning for autosave history.
3. Run the remaining billing edge cases (failed card, re-subscribe).
4. Decide the prototype-data question; consider a fresh production Supabase project (the beta project could stay as staging).
5. Legal basics: terms, privacy policy, refund policy, tax decision, account deletion.
6. Switch Stripe to live mode only at launch: new keys, a new webhook endpoint and secret, live price IDs, re-set the four Stripe secrets, redeploy functions.

**Before cutover from the old site**
7. Port the old site's metadata (Open Graph, manifest, favicons, `ads.txt`) and decide what happens to `list.html`.
8. Decide on ads and the donate banner (if ads stay, add a consent banner for EU visitors).
9. Plan the cutover so the live site serves a build, not the repo root, and keep the old site reachable as a fallback.
10. Only then: static host plus CDN, cancel Forge, delete the droplet (take a snapshot first). Don't cancel Forge early; it likely handles certificate renewal.

**Soon after**
11. Edit placed custom items, export as image, an account page; unit tests (importers, snapping, stores, validator); an error boundary.
12. Triage the catalog baseline; decide whether to move the multi-GB source images out of the main repository.

**Later:** signal path and equipment list modes, affiliate links, power draw, community gallery, a catalog admin back end.

## Practical lessons from the build (save yourself the rediscovery)

- **Secrets:** never ask for or accept a secret in chat. The owner enters them at a hidden prompt in their own terminal
  (`read -rs "k?Key: " && supabase secrets set NAME="$k"; unset k`). Example commands with placeholders get pasted
  literally, so use prompts. You can verify what's stored without seeing it: compare the SHA-256 of a secret's stored digest
  against known placeholder text, or deploy a throwaway Edge Function that reports only key *types* and whether Stripe accepts
  the key, then delete it (it was done twice this way).
- **Supabase list queries must filter by owner.** A policy lets anyone read public (shared) playgrounds, so an unfiltered list
  showed other accounts' boards, and deleting them silently removed zero rows. This caused a real bug.
- **Supabase CLI** is installed and logged in. Useful: `supabase db query --linked "<sql>"`, `supabase migration list`,
  `supabase functions deploy <name> --use-api` (no Docker needed; the webhook needs `--no-verify-jwt`), `supabase secrets list`.
  There is no `config.toml`; `supabase config push` could reset auth settings, so auth settings are changed in the dashboard.
- **Stripe test and live modes are separate worlds:** products, prices, keys and webhook endpoints don't carry over. The
  webhook endpoint must use the *Snapshot* payload style, not Thin.
- **Forge/nginx:** `add_header` inside a `location` drops server-level headers, so use `expires` for caching rules. The first
  SSH connection needs a verified host-key fingerprint; the deploy workflows pin the host key instead of trusting it.
- **macOS ships `openrsync`** (an older protocol), not GNU rsync: no `--mkpath`; `deploy.sh` creates remote folders with `ssh mkdir`.
- **Node 22 is required** (Vite 7, Tailwind 4); the machine default was Node 18. Use `nvm use` in `web/`.
- **The live site serves the repo root** (confirmed: `/gulpfile.js`, `/package.json` return 200). Keep this in mind for any merge.
- **Dev tooling quirks:** the embedded preview browser can only reach localhost. `window.__pp` exposes the stores in dev builds
  only (compiled out of production) so billing and sign-in states can be faked. Vite hot reloads can interrupt browser evals.
- **Commit conventions used:** small logical commits, only on request, with the Co-Authored-By trailer; only `web/`, `docs/`,
  `supabase/` and `.github/workflows/` are added (never the uncommitted legacy files).

## Working agreements with the owner

- Confirm before anything outward-facing or hard to reverse: pushing, deploying, DNS, secrets, Stripe, Supabase auth settings,
  deleting data. Approval for one doesn't cover the next.
- Be concise and lead with the answer. Say plainly what was verified and what wasn't; don't claim a flow works until it was run.
- Prefer running read-only checks (DNS lookups, REST calls, the CLI's read commands) over asking the owner to report what they see.
- The owner is comfortable running commands in their own terminal; give one command per code block.
- Keep work and personal separate: nothing from an employer's accounts or files belongs in this project.

## What not to carry over when moving to a new Claude account

- Any employer email address, employer workspace links, or files from employer tools. The design mockup came from a
  work-linked file; copy it to a personal space or work from screenshots.
- The **uncommitted legacy files** on the original machine (edits to `index.html`, `public/scripts/scripts.js`,
  `public/stylesheets/styles.css`, plus `public/scripts/cloud-sync.js` and `config.js`). They're superseded by the rebuild, and
  `config.js` holds an old Supabase URL and key. Discard them.
- Pasted credentials of any kind. Nothing in the repo or this document contains one.
- Check your employer's policy on side projects and company-provided tools before continuing a personal product on a
  work-provisioned account.

## To pick this up on a new machine or account

```bash
git clone https://github.com/PedalPlayground/pedalplayground.git && cd pedalplayground
git switch react-rebuild
cd web && nvm use && npm ci
# web/.env.local (git-ignored): VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (public values, from the Supabase dashboard)
npm run catalog:build      # first run ~2 minutes; later ~6 seconds; output is git-ignored
npm run dev                # http://localhost:5173
npm run typecheck
```

Install and log in to the Supabase CLI with the owner's account, then `supabase link` the project, before using any
`supabase` command. Deploying needs an SSH key authorized on the droplet (see `docs/deploy-beta.md`).
