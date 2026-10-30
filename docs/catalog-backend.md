# Catalog back end (Supabase)

The pedal catalog is moving from `public/data` + `public/images` in this repo into Supabase, with submissions on
the site and editors approving them. The plan, with phases and decisions, is in the
[Catalog back end plan](https://claude.ai/artifact/Th1T16X9PZZaqDh4hURifG). This page covers what's built and how
to set it up.

**Status: phase 2 (import).** Nothing here changes the live site yet. The app keeps reading the old catalog
until `VITE_CATALOG_BASE_URL` points at the new one, the last step of phase 2.

## How the pieces fit

| Piece | Where | What it does |
| --- | --- | --- |
| Tables, rules, review functions, buckets | `supabase/migrations/20261029000000_catalog.sql` | `catalog_items`, `catalog_submissions`, `catalog_editors`; `approve_catalog_submission()`, `review_catalog_submission()`, `set_catalog_item_status()`; buckets `catalog-sources` (private) and `catalog-public` (public) |
| Publish script | `web/scripts/catalog/publish.mjs` | Builds every item marked `needs_render` (same WebP files as `build.mjs`), uploads them, then rewrites `catalog.json` |
| Publish workflow | `.github/workflows/catalog-publish.yml` | Runs the publish script. Started by the Edge Function or by hand |
| Import script | `web/scripts/catalog/import.mjs` | One-time copy of the repo catalog into Supabase, using the sharper `app/images` originals where they match |
| Compare script | `web/scripts/catalog/compare.mjs` | Checks the Supabase catalog against the one the site serves today |
| Import workflow | `.github/workflows/catalog-import.yml` | Runs import, publish and compare. By hand only |
| Edge Function | `supabase/functions/catalog-publish` | Lets an editor start the publish workflow (the editor page calls it after approving) |

The flow: a player inserts a `catalog_submissions` row and uploads its image to
`catalog-sources/submissions/<their user id>/`. An editor calls `approve_catalog_submission(id)`, which creates or
updates the `catalog_items` row with `needs_render = true`. The editor page then calls the `catalog-publish`
function, which starts the workflow. The workflow builds the files into `catalog-public` and rewrites
`catalog-public/catalog.json`.

Why a GitHub Action and not an Edge Function for the images: image encoding uses sharp, a native library that
can't run in Supabase's Deno functions, and the same code already builds the repo catalog.

Rules the database enforces:

- Players can only submit as themselves, only as `pending`, and only with an image from their own upload folder.
- At most 10 open submissions per player (editors aren't limited).
- Only editors can read items, edit submissions, approve, reject or retire. Approval only goes through the function.
- Item keys never change. A new item's key comes from its brand and name (`boss-ds-1`), with `-2` added if it's taken.
- Retired items leave search but keep their images, so saved boards still draw them.

## One-time setup

Do these in order. Steps 1 and 2 are in Supabase, step 3 in GitHub, step 4 in both.

1. **Apply the migration.** In Supabase, open SQL Editor, paste the contents of
   `supabase/migrations/20261029000000_catalog.sql`, and run it. (Or `supabase db push --linked` from a machine
   with the CLI.) It's safe to run again. It creates the two buckets too; check they appear under Storage.

2. **Make yourself an editor.** In SQL Editor, using your username:
   ```sql
   insert into public.catalog_editors (user_id)
   select user_id from public.profiles where username = 'YOUR_USERNAME'
   on conflict do nothing;
   ```
   Do the same for the main contributor once they have an account on the site.

3. **GitHub environment for the workflow.** Repo → Settings → Environments → New environment → `catalog`:
   - Variable `SUPABASE_URL`: the same value as `VITE_SUPABASE_URL` in the production environment.
   - Secret `SUPABASE_SERVICE_ROLE_KEY`: Supabase → Project Settings → API Keys → the `service_role` (secret) key.
     This key bypasses every rule above, so it only ever goes in GitHub secrets and Supabase function secrets.

4. **Let editors start a publish** (needed for the editor page in phase 3; skip it for the phase 1 test).
   - GitHub → your profile → Settings → Developer settings → Fine-grained tokens → Generate. Resource owner
     PedalPlayground, only the `pedalplayground` repository, permission **Contents: Read and write** (that's what
     starting a workflow by `repository_dispatch` needs). Pick an expiry and note it.
   - Supabase → Edge Functions → Secrets: add `GITHUB_DISPATCH_TOKEN` (the token) and `GITHUB_REPO`
     (`PedalPlayground/pedalplayground`). `ALLOWED_ORIGINS` should already list the site's origins from billing.
   - Deploy: `supabase functions deploy catalog-publish`.

## Phase 1 test: one pedal end to end

1. **Upload a test image.** Supabase → Storage → `catalog-sources` → create the folder `submissions/<your user id>/`
   (your id: `select user_id from profiles where username = 'YOUR_USERNAME';`) and upload any pedal PNG as
   `gate-test.png`.
2. **Submit and approve it as yourself.** In SQL Editor (this pretends to be you signed in, so the same rules apply):
   ```sql
   begin;
   select set_config('request.jwt.claims',
     json_build_object('sub', (select user_id from public.profiles where username = 'YOUR_USERNAME'), 'role', 'authenticated')::text, true);
   set local role authenticated;
   with s as (
     insert into public.catalog_submissions (brand, name, width_in, height_in, source_path)
     values ('Test', 'Gate Pedal', 2.6, 4.8,
             'submissions/' || (select user_id from public.profiles where username = 'YOUR_USERNAME') || '/gate-test.png')
     returning id
   )
   select public.approve_catalog_submission(id) from s;
   commit;
   ```
   It should return `test-gate-pedal`.
3. **Publish.** GitHub → Actions → Catalog publish → Run workflow (mode `publish`). It should log
   `built pedal test-gate-pedal` and `catalog.json: 1 pedals, 0 pedalboards`.
4. **Check.** Open `https://<project-ref>.supabase.co/storage/v1/object/public/catalog-public/catalog.json`. It should
   list the test pedal, and its `img` path, opened under the same base URL, should show the image.
5. **Clean up.** In SQL Editor:
   ```sql
   delete from public.catalog_items where key = 'test-gate-pedal';
   delete from public.catalog_submissions where name = 'Gate Pedal';
   ```
   Then run the workflow again with mode `manifest-only`, and delete the test files from both buckets if you like.

## Phase 2: importing the repo catalog

The import workflow copies every entry in `public/data` into `catalog_items`, stores each image in
`catalog-sources/import/`, publishes, and compares the result with today's catalog. It's safe to rerun: items
already imported are skipped, so a run that times out picks up where it left off.

How it treats the data:

- **Images.** It uses the larger original in `app/images/pedals` when it's the same shape (within 3%) and looks
  like the same photo; otherwise the repo image. The stored source is a lossless WebP no bigger than the canvas
  size (1200 px for pedals, 2400 px for boards).
- **Keys.** Every entry keeps its image key. A few entries share one image file; the first keeps the key and the
  others get a key from their brand and name, using the same image. Saved boards keep working either way.
- **Missing images.** The 10 entries with no image file get a row with no source. They stay out of the catalog,
  as they are today, until someone uploads an image.
- **What's New dates** come from git history, as the repo build does.
- **Sizes** are stored to three decimals, so the 122 sizes written in sixteenths (6.8125) round by half a
  thousandth of an inch.

Steps (GitHub → Actions → Catalog import → Run workflow):

1. **Test batch.** Set the limit to `20`. Check the run summary, then the catalog.json URL from the phase 1 test.
   The comparison lists almost everything as missing at this point; that's expected.
2. **Full import.** Leave the limit at `all`. It takes about an hour. The summary should end with
   0 images lost and 0 entries missing; the only changes should be the shared-image entries getting their own keys.
3. **Switch beta.** Set `VITE_CATALOG_BASE_URL` in `web/.env.beta` to the `catalog-public` URL, check beta, then
   release to production the usual way.

Until the switch, changes to the repo catalog don't reach Supabase on their own: rerun the import (it adds new
entries) or, for edited ones, run it with **refresh**. After the switch, edits happen on the site and refresh
must not be used.

## Running the scripts locally

```bash
cd web
SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/catalog/publish.mjs --dry-run   # list what would build
SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/catalog/publish.mjs             # build and publish
SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/catalog/import.mjs --dry-run    # report what would import
node scripts/catalog/compare.mjs --new <catalog-public URL>/                            # compare with today's catalog
```

`npm test` covers the manifest, publish, import and compare logic (against a stand-in for Supabase). The migration was tested
on a local Postgres 16 with stand-ins for Supabase's `auth` and `storage` schemas.
