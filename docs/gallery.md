# Public gallery

`/gallery/` lists boards whose owners turned on **Show in Public Gallery** in the Edit Playground dialog, most
recently updated first, or most liked first. Anyone can browse it signed out. A card opens the board view-only on the playground
(`/?p=<slug>`), where the visitor can make their own copy.

- Page: `web/gallery/index.html` + `web/src/gallery/`, a separate Vite entry like the catalog editor, so it adds
  nothing to the playground's bundle. The Settings menu links to it.
- Data: `gallery_boards()` in `supabase/migrations/20261031152923_gallery_page.sql`. It returns the card fields
  only (name, type, description, small thumbnail, owner's username, pedal count), filters by type and by a name or
  username search, sorts by newest or most liked, and pages 24 at a time.
- Likes: one per signed-in person per board, in `gallery_likes`, set through `gallery_set_like()`. Each card shows
  the count and whether you like it. Signed-out visitors who tap the heart are asked to sign in on the playground.
- Cards use the small thumbnail saved on each playground row, not the share-image files, so the page doesn't load
  anything from Supabase Storage.

## Moderation

Boards show up as soon as the owner turns the switch on. Catalog editors (the `catalog_editors` table) see a
**Hide** button on each card. A hidden board stays shared (its link keeps working) but stays out of the gallery,
even if the owner turns the switch off and on. Hiding offers Undo right away; to show a board again later:

```sql
delete from public.gallery_hidden where playground_id = '<playground id>';
```

## Setup

Run `20261031152923_gallery_page.sql` in the Supabase SQL editor (safe to re-run). It needs the
`playground_gallery` and `profiles` migrations first. Nothing else changes on the servers: `/gallery/` is served
the same way as `/editor/`.
