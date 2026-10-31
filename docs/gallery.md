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

## Board info and comments

While viewing a board (or on your own saved board), the speech-bubble button next to the board name opens a panel
(`web/src/components/BoardPanel.tsx`): the owner, type, pedal count, description, likes, Create a Copy, and comments.
On larger screens it's a side panel and opens by itself for gallery boards; on phones it's a sheet.

- Comments are only on gallery boards (Trav's call, 2026-10-31). Boards shared by link only show the info, no comments.
- Signed-in people with a username can comment: plain text, up to 1,000 characters, at most 5 a minute and 100 a day.
- A commenter can delete their own comments, the owner can delete any on their board, and catalog editors any anywhere.
- On your own board you can edit the description in the panel, turn comments off (they're kept, but only you see them),
  and the button shows a count of new comments since you last opened it.
- Taking a board out of the gallery, unsharing it or an editor hiding it hides its comments; they come back with it.
  Deleting a board or an account deletes its comments.
- Database: `supabase/migrations/20261031154422_board_comments.sql` (`board_comments` table, `board_panel()`,
  `board_comments_list()`, `board_comment_add()`, `board_comment_delete()`, `board_comments_seen()`).
