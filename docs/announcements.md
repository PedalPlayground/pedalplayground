# What's New (announcements)

A bell in the app header opens a short feed of news. A dot on the bell means there's something the browser hasn't seen.

## Where entries come from

- **Posts**: rows in `public.announcements`, written by catalog editors on the **News** tab of `/editor/`. Each post
  has a title, optional text, an optional link (`https://…` or a site path like `/gallery/`) and a publish time. A
  future publish time schedules the post; editors see it in the list, everyone else sees it once the time passes.
- **New pedals**: built in the browser from the catalog's `added` dates, one entry per week for the last 6 weeks
  ("12 new pedals added"). Tapping it opens Add Gear on its New list. Nothing to write by hand.

## Load and privacy

- The app reads the newest 20 posts once per visit, 1.5 s after load, and keeps them in `sessionStorage` for 30
  minutes. That's one small PostgREST query per visit. Pedal entries cost nothing extra (the catalog is already loaded).
- Read state is a list of seen entry ids in `localStorage` (`pp:news-seen`). No per-user rows, so guests get it too.
  Entries older than 21 days never light the dot, so a first visit doesn't flag the whole history.

## Setup

Run `supabase/migrations/20261031155653_announcements.sql` once. Editors are the existing `catalog_editors`.

## Later

An email newsletter would need an opt-in, unsubscribe links and a sending service. Not built.
