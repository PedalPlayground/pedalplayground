# Gear catalog page

`/gear/` (`web/gear/index.html`, `web/src/gear/GearApp.tsx`) lists every pedal and pedalboard in the catalog. It
reads the same `catalog.json` as the playground, so it needs no database pieces of its own. "Most used" uses the
`trending_gear` RPC (adds in the last year), like the search panel.

- **Filters live in the URL**, so a brand page is a link: `/gear/?brand=BOSS`, `/gear/?kind=boards`,
  `/gear/?q=big+sky`, `/gear/?sort=new` or `sort=used`. A brand typed in another case is fixed to the catalog's.
- **Pedals share one scale** (16 px per inch, shrunk only when too big for the card), so sizes compare at a glance.
  Boards are fit to the card.
- **New** marks items added in the last 30 days.
- The grid shows 60 items and adds 60 more as you scroll.

## Item pages

Clicking a card opens `/gear/?item=<image key>` (`&kind=boards` for a board), drawn by `web/src/gear/ItemPage.tsx`.
The grid stays loaded underneath, so Back (the button or the browser's) returns to the same filters and scroll.

- The photo at real proportions on the canvas color, with size in inches and mm, type, power and current draw when
  the catalog has them, and the date it was added.
- **Add to My Playground** links to `/#pp-add=<kind>:<image key>` (`lib/handoff.ts`). The playground waits for the
  catalog, adds the item to the open board, records the add for trending, and shows "Added …".
- **Buy links** use `buyLinks()` from `lib/affiliate.ts`, so they only show where `VITE_BUY_LINKS=true` (today just
  `.env.local`).
- **More from <brand>** (most used first, with See all) and **Similar size** (other brands within 0.2″, or 1″ for
  boards, either way round, at most two per brand).

Planned next: a trending row on the grid; "used on these boards", which needs a database change; pages Google can
find.
