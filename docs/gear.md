# Gear catalog page

`/gear/` (`web/gear/index.html`, `web/src/gear/GearApp.tsx`) lists every pedal and pedalboard in the catalog. It
reads the same `catalog.json` as the playground, so it needs no database pieces of its own. "Most used" uses the
`trending_gear` RPC (adds in the last year), like the search panel.

- **Filters** (Pedals/Boards, sort, type, brand) sit in a left sidebar from laptop width (`lg`), and in a Filters
  sheet with a count badge on phones and tablets. Search sits above them. The Type list only shows types the
  catalog has, counted within the chosen brand.
- **Filters live in the URL**, so a brand page is a link: `/gear/?brand=BOSS`, `/gear/?type=Fuzz`, `/gear/?kind=boards`,
  `/gear/?q=big+sky`, `/gear/?sort=new` or `sort=used`. A brand typed in another case is fixed to the catalog's.
- **Pedals share one scale**, set by the card: a pedal 5.2″ tall (bigger than three in four pedals) fills the
  photo area's height (`FILL_INCHES`, sized in container units, so it follows the card size), and bigger ones are fit
  to it. Boards are fit to the card. Cards load the full photo when the 128px thumbnail would look soft.
- **New** marks items added in the last 30 days.
- The grid shows 60 items and adds 60 more as you scroll.
- **Shelves** sit over the full list (no brand, type or search): Popular brands (most adds in the last year), Trending
  this month (the `trending_gear` RPC, as in Add Gear) and New in the catalog. Each scrolls sideways.

## Item pages

Clicking a card opens `/gear/?item=<image key>` (`&kind=boards` for a board), drawn by `web/src/gear/ItemPage.tsx`.
The grid stays loaded underneath, so Back (the button or the browser's) returns to the same filters and scroll.

- The photo at real proportions on the canvas color, with size in inches and mm, type, power and current draw when
  the catalog has them, and the date it was added.
- **Add to My Playground** links to `/#pp-add=<kind>:<image key>` (`lib/handoff.ts`). The playground waits for the
  catalog, adds the item to the open board, records the add for trending, and shows "Added …".
- **Buy links** use `buyLinks()` from `lib/affiliate.ts`, so they only show where `VITE_BUY_LINKS=true` (today just
  `.env.local`).
- **Featured on**: public gallery boards whose latest version uses the item, most liked first (up to 12), from the
  `gear_featured_on` RPC (`supabase/migrations/20261107120000_gear_featured_on.sql`). Hidden until that's applied.
- **More from <brand>** (most used first, with See all) and **Similar size** (other brands within 0.2″, or 1″ for
  boards, either way round, at most two per brand).

Planned next: "used on these boards", which needs a database change; pages Google can
find.

## Types from names

Most pedals came in without a type. `web/scripts/catalog/infer-types.mjs` guesses one from words in the name
("Super Overdrive", "Space Echo", "Noise Suppressor"), first matching rule wins, and only for pedals with no type:

```bash
cd web
node scripts/catalog/infer-types.mjs <catalog.json> --sql types.sql   # prints counts and examples, writes the updates
```

The SQL only fills empty types (`type is null`), so it never overwrites an editor's choice and is safe to rerun. Run
it in the SQL Editor, then a Catalog publish with mode `manifest-only` puts the types into `catalog.json`. Names
that don't say what the pedal is (DS-1, Klon) stay empty for editors to fill in.

## More than one type

A pedal has a main `type` (the Equipment List and signal path show it) and up to four `extra_types`
(`supabase/migrations/20261107000000_catalog_extra_types.sql`). `catalog.json` lists `types` (main first) only
when there's more than one; read them with `itemTypes()` in `lib/catalog.ts`. The Gear page counts and filters by
every type, and the item page lists them all.

Editors set them in two places: **Also counts as** chips under Type in the item form, and the editor's **Types**
tab, which lists one type's pedals (or those with none) with a main-type picker and the chips on each row. Each
change there saves at once as an approved edit; **Publish** puts them live together.

`infer-types.mjs` also reports names that suggest more than one type ("Tremolo/Reverb": Reverb, plus Modulation).
