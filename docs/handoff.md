# Handoff: React rebuild of Pedal Playground

State of the work on branch `react-rebuild` (8 commits on top of `master`), written so it can be picked up from a
fresh machine or account. Nothing here contains credentials; every secret is named, never included.

## Decisions already made

- **Stack:** Vite, React 19, TypeScript, Zustand, Tailwind 4 with Radix primitives, in `web/`. Node 22 (`web/.nvmrc`).
- **Canvas:** DOM items inside one pan/zoom transform layer; pointer events; positions and sizes in inches.
- **Backend:** Supabase (Postgres, Auth, Edge Functions). Stripe Checkout and customer portal for billing.
- **Tiers, launching with billing from day one:** guests save locally (one board); free accounts keep one cloud
  playground and can share and fork; Pro is unlimited playgrounds. Limits are enforced by the database.
- **Sign-in:** passwordless, 6-digit email code first, emailed link as backup.
- **Devices:** desktop-first, tablet usable (pinch zoom works via pointer events); phones are read-and-adjust.
- **UI:** the playground name lives in the bottom-left switcher; units toggle and theme live in the header menu.
- **Hosting:** a static host with preview deploys; catalog images served from a CDN.
- **Catalog contributions:** the pull-request flow continues for now (see `docs/catalog.md`); an admin back end is the
  longer-term replacement.

## What's built

| Area | State |
| --- | --- |
| App shell, mode rail, toolbar, search overlay (Pedals / Pedalboards / Custom) | Done |
| Canvas: pan, zoom, pinch, select, marquee, drag, snap guides, rotate, flip, z-order, keyboard shortcuts | Done |
| Undo / redo (100 steps; a drag is one step) | Done |
| Custom pedals (color, name) and custom boards | Done; no editing after placing |
| Dark mode (System / Light / Dark), no-flash bootstrap | Done |
| Local autosave; import of legacy v2 saves, HTML-blob saves and export files; export to file | Done |
| Catalog pipeline: thumbnails + canvas images, hashed names, manifest, validator with baseline, CI workflows | Done |
| Code sign-in, emailed-link confirm step, email template | Done |
| Cloud autosave with versions, playground switcher with thumbnails, rename, delete, share, fork-on-open | Done |
| Billing: migration, 3 Edge Functions, upgrade dialog, plan display, limit gating | Written; not run end to end |
| Signal path mode, Equipment list mode | Rail buttons exist; not built |
| Export as image, donate banner, ads, dedicated account page | Not built |

Repo map: `web/src/{components,store,lib}` (app), `web/scripts/catalog/` (catalog pipeline and validator),
`supabase/` (`schema.sql`, `migrations/`, `functions/`), `docs/` (this file plus `catalog.md`, `auth.md`, `billing.md`,
`auth-email-template.html`). The original jQuery site is still at the repo root and untouched by the rebuild.

## What's untested

Be skeptical of these until each has been exercised:

- **Billing, end to end.** The SQL parses with a real Postgres parser but has never run. The Edge Functions typecheck
  against Stripe 17.7.0 and supabase-js types but have never run. No purchase has been made, even in test mode.
  Follow the walkthrough in `docs/billing.md`.
- **Real email sign-in.** The code and link steps were exercised against the real API only with fake tokens and a
  wrong code. A real code, the first-time-user path (the "Confirm signup" template and `type=email`), link scanners and
  cross-device sign-in are unverified. See the test list in `docs/auth.md`.
- **Signed-in cloud flows beyond a quick manual pass:** autosave versions, switcher list, rename conflicts, share and
  fork, delete, and the sign-in reconcile logic (empty canvas loads latest; local work uploads) deserve a deliberate test.
- **Thumbnails in the cloud list:** need the `thumbnail` migration at the bottom of `schema.sql`. Without it saves work
  and the app falls back cleanly, but no previews show.
- **Legacy HTML-blob import** (including custom pedal colors) was never tried against a real old save.
- **Real touch devices.** Pinch and touch-drag were only simulated with synthetic pointer events.
- **CI workflows** (`catalog.yml`, `web.yml`) have never run on GitHub.
- **Production build.** Only the dev server has been used; `npm run build` hasn't been run since the catalog moved out
  of `public/`. Set `VITE_CATALOG_BASE_URL` for production.

## Known risks and gaps

- **Version history grows without bound:** every autosave inserts a full document row. Add pruning before real traffic.
- **Double checkout** can create two subscriptions; only one is recorded.
- **Downgrades** keep all existing boards editable; only creating new ones is blocked (a deliberate default).
- **Past-due payments** keep Pro for Stripe's whole retry window.
- **A free user at the limit who opens a shared link** gets a local-only fork.
- **Price labels** in the upgrade dialog are hand-typed (`VITE_PRO_PRICE_*`) and can drift from Stripe.
- **Two schema sources:** `schema.sql` and `migrations/` overlap. Consolidate before creating the production project.
- **Catalog data:** 10 entries point at missing images (hidden from the app), 96 images are unreferenced, four pedal
  entries have suspicious sizes, and 220 known validator errors are frozen in `web/scripts/catalog/baseline.json`.
- **Legal and compliance:** terms, privacy, refund policy, sales tax/VAT and account deletion don't exist yet. Sign-off
  belongs to the responsible team or counsel. AdSense, if kept, needs an EU consent banner.

## What to re-create on a new (personal) account

None of these are in the repository, by design.

1. **Supabase:** a project in an organization you own, on a paid plan so it doesn't pause. Run `supabase/schema.sql`
   (consolidated into migrations ideally), then the billing migration, then `notify pgrst, 'reload schema';`.
2. **Auth settings:** Site URL, redirect URLs, custom SMTP with SPF/DKIM/DMARC on your domain, raise the email rate
   limit, paste `docs/auth-email-template.html` into **Magic Link** and **Confirm signup** (`docs/auth.md`).
3. **Stripe (own account, test mode first):** product with monthly and annual prices, customer portal config, webhook
   endpoint and its signing secret, and a decision on Stripe Tax (`docs/billing.md`).
4. **Function secrets:** `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_MONTHLY`, `STRIPE_PRICE_YEARLY`,
   `SITE_URL`, `ALLOWED_ORIGINS`, optionally `STRIPE_AUTOMATIC_TAX`. Set with `supabase secrets set`, then deploy the three
   functions (the webhook with `--no-verify-jwt`).
5. **Local env:** `web/.env.local` with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (optionally
   `VITE_CATALOG_BASE_URL`, `VITE_PRO_PRICE_MONTHLY`, `VITE_PRO_PRICE_YEARLY`). See `web/.env.example`.
6. **Hosting and CDN:** a static host for `web/`, and object storage plus CDN for the generated catalog.
7. **Domain and DNS** for the site and the sending address.
8. **Design file:** the Figma mockup was shared from a work-linked account; copy it to a personal team if needed.
9. **Repository:** the branch is local only. Push it wherever you decide; the existing remote is the `PedalPlayground`
   GitHub organization.
10. **Uncommitted leftovers on the old machine:** edits to the legacy `index.html`, `public/scripts/scripts.js`,
    `public/stylesheets/styles.css`, plus `public/scripts/cloud-sync.js` and `config.js`. They're superseded by the React
    app and `config.js` points at the old Supabase project. Discard them.

## Run it locally

```bash
cd web
nvm use                      # Node 22
npm ci
npm run catalog:build        # first run ~2 min; later runs ~6 s (output is git-ignored)
npm run dev                  # http://localhost:5173
npm run typecheck
npm run catalog:validate     # what CI runs on catalog pull requests
```

`window.__pp` exposes the stores in dev builds only, for exercising sign-in and billing states without real accounts.

## Prioritized next steps

**Before any real user**
1. Create the production Supabase project; consolidate the schema into migrations; apply them.
2. Run the Stripe test-mode walkthrough end to end (`docs/billing.md`); fix what it turns up.
3. Run the sign-in test list with real email, including a brand-new address and a Microsoft 365 mailbox.
4. Add version pruning for autosave history.
5. Deploy the catalog: CI builds it, uploads `thumb/` and `img/` first and `catalog.json` last, and the app points at it.
6. Production build and deploy of `web/` to a preview URL; check it with a throttled connection and a real phone.
7. Terms, privacy, refund policy, tax decision, and account deletion.

**Before cutover from the old site**
8. Port the old site's metadata (Open Graph tags, manifest, favicons, `ads.txt`) and decide what happens to `list.html`.
9. Decide on ads and the donate banner; if ads stay, add the consent banner.
10. Redirect old URLs, keep the old site reachable for a short fallback window, and confirm existing users' local boards
    import on first load (same origin).

**Soon after**
11. Edit placed custom items (name, color, size); export as image; account page.
12. Unit tests for importers, snapping, stores and the validator; one end-to-end smoke test; error boundary.
13. Handle the double-checkout case; consider read-only boards beyond the limit after a downgrade.
14. Triage the catalog baseline (missing images first) and decide whether to move source images out of the main repo.

**Later**
15. Signal path and equipment list modes; affiliate links; power draw; community gallery; the catalog admin back end.
