# Gear catalog page

`/gear/` (`web/gear/index.html`, `web/src/gear/GearApp.tsx`) lists every pedal and pedalboard in the catalog. It
reads the same `catalog.json` as the playground, so it needs no database pieces of its own. "Most used" uses the
`trending_gear` RPC (adds in the last year), like the search panel.

- **Layout:** a compact hero band at the top (card shade, container corners) with the heading, count and a large,
  left-aligned search, plus three cropped pedal photos fanned off its right edge on laptops (the brand's most added on a
  brand page, otherwise the hottest after the bento's); then, over the full list, Trending and new and Popular brands
  across the full width; then the grid with its filters. A full-width bar above the sidebar and grid holds the heading (All pedals, or
  what's filtered) with a result count, the sort and card size (and a Filters button below laptop width). The filters (Type and Brand) sit in a sticky left sidebar from laptop width and in
  a Filters sheet below it. The Type list is All pedals, each pedal type, then Pedalboards (there's no separate
  Pedals/Boards switch); it only shows types the catalog has, counted within the chosen brand.
- **Filters live in the URL** and each new brand, type, kind or sort is a history step (search text isn't), so Back
  returns to the last view. A brand page is a link: `/gear/?brand=BOSS`, `/gear/?type=Fuzz`, `/gear/?kind=boards`,
  `/gear/?q=big+sky`, `/gear/?sort=new` or `sort=used`. A brand typed in another case is fixed to the catalog's.
- **Pedals share one scale**, set by the card: a pedal 5.2″ tall (bigger than three in four pedals) fills the
  photo area's height (`FILL_INCHES`, sized in container units, so it follows the card size), and bigger ones are fit
  to it. Boards are fit to the card. Cards load the full photo when the 128px thumbnail would look soft.
- The grid shows 60 items and adds 60 more as you scroll.
- **Over the full list** (no brand, type or search), on the left: **Trending gear**, a bento of 8 photo-first tiles
  (one big, one tall, six singles) taking turns between hot and new, each with its name and a new or hot icon before it; under
  it **Newly added** (in the brand color), one row of the next newest as square photo tiles, names on hover: 12 on laptops (three per
  bento column), 8 on tablets (two per column), three rows of four on phones. It shares the bento's gap, so tiles line
  up with the bento's columns. On the right, **Brands to know**
  (16 tiles: well-loved makers, scored by the year's and month's adds over the square root of their item count, with
  mass-market brands like BOSS, MXR and Electro-Harmonix left out (`MASS_BRANDS`); 8 on phones: name, item count, and a zoomed, cropped photo of the brand's most added item bleeding off
  the corner) stretches to the left side's height. Hot ranks this week's 100 most added by momentum (week adds squared
  over month adds, damped by size; see `fetchHot` in `lib/trending.ts`), lifts newer gear (added in the last year
  1.6x, last three years 1.3x), and sets aside the month's 30 most added real gear (everyday staples), tuners, volume
  pedals, utilities and board accessories.
- **Marks:** icon only, just before an item's name on full cards and Trending gear tiles: a brand-colored dot for new
  (added in the last 30 days) and a tangerine trend line for hot (the 40 hottest). Hovering shows the word.
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
