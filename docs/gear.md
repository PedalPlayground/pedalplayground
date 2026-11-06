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

Planned next: a page for each item (`/gear/?item=<key>`) with Add to My Playground, Buy links (behind
`VITE_BUY_LINKS`), more from the brand and similar sizes; then "used on these boards", which needs a database change.
