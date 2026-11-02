# Public gallery

`/gallery/` lists boards whose owners turned on **Show in Public Gallery** in their board's Details, most
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

## Board panel: details and comments

The ⓘ button next to the board name opens the board panel (`web/src/components/BoardPanel.tsx`): how a shared or
gallery board reads. It shows a summary (owner, type, pedal count, description, likes) and the comments. On larger
screens it's a column left of the canvas that stays open or closed as you left it (and opens by itself for someone
else's gallery board); on phones it's a sheet.

Board settings stay in the **Playground Settings** dialog (`EditPlaygroundDialog.tsx`): name, type, genres, description,
share link, Show in Public Gallery, Allow Comments and Delete. Trav's call, 2026-11-02: for a while the dialog was
merged into the panel, but keeping settings in the dialog and the panel read-only was clearer.

- **Someone else's board:** the column is always open on larger screens (no close button). Back to Gallery at the top
  returns to the same filters and scroll (saved in sessionStorage `pp:gallery-return` when a card is clicked), then the
  summary, Create a Copy, likes and comments. The header shows just the name and owner. Phones get a sheet from the
  comments button and a small bar over the canvas with Copy and Gallery.
- **Your own board:** the button shows once the board is shared. Same summary, with a pencil that opens Edit
  Playground, and its comments (you can delete any). The button shows a count of new comments. Private boards have no
  panel.
- Comments are only on gallery boards (Trav's call, 2026-10-31). Boards shared by link only show the info.
- Signed-in people with a username can comment: plain text, up to 1,000 characters, at most 5 a minute and 100 a day.
- A commenter can delete their own comments, the owner can delete any on their board, and catalog editors any anywhere.
- Turning comments off keeps them, but only the owner sees them. Taking a board out of the gallery, unsharing it or
  an editor hiding it hides its comments; they come back with it. Deleting a board or an account deletes them.
- Database: `supabase/migrations/20261031154422_board_comments.sql` (`board_comments` table, `board_panel()`,
  `board_comments_list()`, `board_comment_add()`, `board_comment_delete()`, `board_comments_seen()`).

## Navigation (2026-11-02)

Plan: https://claude.ai/artifact/MsKYwJCNh9zf75mr7dScBK. Build and Gallery tabs sit next to the logo on both pages
(`SiteTabs.tsx`). The board name's menu is the board hub: New Playground, your playgrounds, All Playgrounds and
Playground Settings. The canvas cog is Preferences, with a Help group. The header button beside the board name is a
comments button with a count. Someone else's board shows a bar over the canvas with Create a Copy and Back to Gallery.
