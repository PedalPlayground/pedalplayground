# Database usage

Review on 2026-11-02 (Pro plan, Micro compute): far from size limits (database 371 MB of 8 GB, storage 5.2 GB of
100 GB). Almost all load came from autosave, plus the trending gear count.

What each save used to do, every 1.5 seconds of editing: upload the 36 KB list thumbnail, insert a history version
(and the prune trigger deleted an old one), and reload the whole playground list with every thumbnail.

What it does now:

- **List:** the open board's entry is updated in place. The full list loads on sign-in, when a board is created,
  and when the playgrounds dialog opens.
- **Thumbnail:** sent only when the layout changed, at most once a minute, plus when the page is hidden or another
  board is opened or started (`web/src/store/cloud.ts`, `THUMBNAIL_INTERVAL_MS`).
  It's uploaded as a file to the `board-thumbnails` bucket and the row keeps only its URL (see `docs/gallery.md`).
- **Row update:** the `playgrounds` row is only written for a rename or a new thumbnail. Saving the version
  touches `updated_at`.
- **History:** `save_playground_version()` updates the newest version when it's under 5 minutes old, otherwise
  inserts one. History keeps a checkpoint every 5 minutes (still the newest 20). Until the migration is applied,
  the app falls back to inserting a version per save.
- **Link previews:** redrawn 2 minutes after edits settle (was 10 seconds), or when the page is hidden or the board
  is switched.
- **Board limit:** a board that can't be created at the plan's limit isn't retried on every edit. It saves once
  billing shows room (a board deleted, or an upgrade).
- **Trending gear:** `trending_gear()` serves a cached result, recounted at most every 10 minutes.

## Applying the migration

Supabase → SQL Editor: paste and run `supabase/migrations/20261102000000_usage_optimizations.sql` (safe to re-run).
It adds `save_playground_version()` and `trending_gear_cache`, replaces `trending_gear()`, rewrites the
row-level security rules to call `auth.uid()` once per query (same access), and adds seven foreign key indexes.
The app works before and after it's applied.

One setting to change by hand if compute is ever upgraded: Authentication → Settings → switch Auth's database
connections from a fixed 10 to a percentage.
