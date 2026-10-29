# Catalog: how pedals and pedalboards get into the app

## The pieces

| What | Where | Who touches it |
| --- | --- | --- |
| Entries (brand, name, size in inches, image filename) | `public/data/pedals.json`, `public/data/pedalboards.json` | Contributors |
| Source images (original PNGs) | `public/images/pedals/`, `public/images/pedalboards/` | Contributors |
| Generated assets (WebP thumbnails + canvas images, hashed names) and `catalog.json` manifest | `web/public/catalog/` (git-ignored) | The build script |

The app never reads the source files. It reads the generated manifest and images, so source images can
be as large as contributors like (up to the limits below) without slowing the site.

## Adding a pedal

The contributor steps (image, entry, validation, pull request) are in the [README](../README.md#adding-a-pedal).
The rules the validator enforces: a PNG of at most 3 MB with a lowercase-hyphen filename, at least 60 px per inch
of `Width`, an aspect ratio within 15% of `Width` : `Height`, and no duplicate brand + name.

### Known problems (the baseline)

When the validator was introduced, 220 older problems were recorded in
`web/scripts/catalog/baseline.json` so they don't block new pull requests: low-resolution images (159),
non-conforming filenames (16), aspect mismatches (16), oversized files (12), entries whose image file is
missing (10) and duplicate brand+name entries (7). Fixing one means fixing the data and then removing its
line from the baseline (`npm run catalog:validate -- --update-baseline` rewrites it from the current state;
review the diff, since it must only ever shrink).

## Building the assets

```bash
cd web
npm run catalog:build            # incremental: unchanged images are skipped
npm run catalog:build -- --force # reprocess everything
```

- `thumb/<name>.<hash>.webp`: longest edge 128 px (search results show 64 px, so this covers 2x screens).
- `img/<name>.<hash>.webp`: longest edge 1200 px for pedals, 2400 px for pedalboards, never upscaled.
- `catalog.json`: entries plus a map from image key to hashed paths.

The hash is of the source bytes, so a changed image gets a new URL and old URLs can be cached forever.
First measured run: 3,159 MB of source became 376 MB of output (40 MB of thumbnails), about two minutes
cold and about six seconds when nothing changed.

## Serving it (CDN-ready)

Output names are immutable, so serve `thumb/` and `img/` with
`Cache-Control: public, max-age=31536000, immutable`, and `catalog.json` with a short cache
(for example 5 minutes, or `no-cache` with an ETag).

Set `VITE_CATALOG_BASE_URL` at build time to the CDN origin (for example `https://cdn.example.com/catalog/`).
Without it the app uses same-origin `/catalog/`.

Suggested production flow: CI runs `catalog:build` on merge to the main branch, uploads `thumb/`, `img/`
and then `catalog.json` last (so the manifest never points at files that haven't arrived), and the
web app deploys separately. Old hashed files can stay until a periodic cleanup.

## Where this is going: an admin back end

The pull-request flow works but makes every addition a git operation and keeps ~3 GB of images in the
repository. The intended replacement:

- A `catalog_items` table in Supabase (brand, name, kind, width, height, image path, status, submitted by).
- Source uploads go to object storage; a worker runs the same processor as `build.mjs` and writes the
  derived files and a regenerated manifest.
- Editors (a role) approve submissions in a small admin UI; the community can still submit, as a pending
  entry. The same validation rules apply, as server-side checks.

Until that exists, the repository stays the source of truth, and nothing about the contributor flow changes.
Moving the source images out of the main repository (a separate assets repository or Git LFS) is a good
step before launch, but it rewrites how contributors work, so it's a decision rather than a default.

## Documents and image keys

Saved playgrounds store the image's original filename (`boss-ds1.png`). The app looks images up by that
name without its extension, so documents saved before this pipeline keep working. Renaming or removing a
source image breaks boards that use it, so prefer adding a new entry over renaming an old one.
