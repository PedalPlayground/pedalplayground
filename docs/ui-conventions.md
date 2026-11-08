# UI conventions

The sizes the app already uses almost everywhere. Keep new UI to these so it stays consistent.

The look itself (color, type, corners, shadows, borders, writing and access rules) is drawn live on the design
reference page, `/design/` (`web/src/design/DesignApp.tsx`), with the tokens in `web/src/index.css`. In short:

- **Flat but crisp.** Cards (tinted `card` on the white `page`), chips and fields are flat. Tiles show hover by
  shifting to `card-hover`, never with an outline. Only what floats gets a shadow:
  `shadow-float` (menus, popovers, tooltips, docked panels, floating bars) and `shadow-modal` (dialogs, sheets).
  `shadow-pop` is reserved for a button that should stand out (Add Gear on the board); use it rarely. Primary
  buttons are otherwise flat.
  Catalog photos' drop shadow is exempt.
- **Colors are tokens only.** Brand-tinted grays (`page`, `card`, `card-hover`, `canvas`, `surface`, `surface-hover`, `chrome`, `ink`,
  `ink-muted`, `icon`, `icon-solo`, `line`, `chrome-line`, `soft`), `brand`, status (`positive`, `danger`, `warning`,
  `neutral`) and accents (`group`, `guide`, `tangerine`, `lagoon`). `#fff` and `#000` are the only neutral colors.
  No hex values or Tailwind palette colors in components (pedal art and board finishes excepted).
- **Borders only for missing contrast**, in `chrome-line`; `line` is for dividers.
- **Corners grow with size:** `rounded-inner` 4px, `rounded-control` 6px (fields, buttons, menu rows),
  `rounded-panel` 10px (cards, panels, menus), `rounded-container` 16px (dialogs, sheets, big photos); pills round.
- **Order:** name first, then who made it: a board's title, then its author; a pedal's name, then its brand.
- **Stacking:** page content sits in an `isolate` main, so nothing in it can rise above the sticky header (`z-30`;
  the editor's tab bar `z-20`). Docked panels and sheets are `z-40`; menus, popovers, dialogs and tooltips `z-50`.
  `Modal` renders on `<body>` so it always lands on top. Scroll areas leave about 4px of padding (undone with negative
  margins) so focus rings and hairlines inside them aren't cut off.
- **Focus:** one 2px brand ring everywhere (`focus-visible:ring-2 focus-visible:ring-brand`, `focus:ring-2` on fields).
- **Back button:** a new view is a history step: Gear's filters and item pages, Explore's type, sort and person
  (all in the address), the editor's tabs, an opened catalog item and a moderation lookup. Typing in a search only
  updates the address.
- **Copy:** short and plain; set facts apart with space (`components/Meta.tsx`), not dots, bars, dashes or arrows.

| What | Size |
| --- | --- |
| Buttons, text fields, icon buttons, menu triggers | 36px tall (`h-9`, `size-9`); icon buttons are 36×36 |
| Body and control text | `text-sm` (14px); metadata, the zoom readout and the Beta badge use `text-xs` (12px) |
| Form fields | `components/formText.ts`: label 13px semibold at 80% ink, help text (12px, muted) right under the label, the field, then any error (12px, red) under the field. Help and error are linked to the field with `aria-describedby`. Labels are Title Case. Units go inside the field at the end (`fieldWithUnit`), never in the label |
| Form backgrounds | Forms sit on white: dialogs and side panels (`bg-surface`), and in light mode the editor page itself (`chrome`, white), which is why the editor's tabs need no panel. Explore, Gear and the design page sit on `page` (white in light mode) with tinted `card` cards, so cards stand out without borders. The gray fields (`bg-surface-hover`) disappear on page backgrounds (`bg-page`, `bg-chrome`, `bg-canvas`), so a field placed straight on the page is a white box with a `chrome-line` border instead. The Explore and Gear search sits on the tinted hero band, so it is a borderless white field |
| Canvas look (color, ½ in dots, scale key) | `bg-canvas`, `dotGridStyle` in `lib/scale.ts`, `components/ScaleKey.tsx` | The playground canvas and the editor's preview use them (pass `zoom` and `units` to `ScaleKey` for a fixed scale). The dialog backdrop (`.modal-backdrop` in `index.css`) copies the dots in CSS, and the email templates have their own dot tiles. |
| Text people name things with | `hasProfanity` / `usernameOffensive` in `lib/profanity.ts` (with `useAllowedNames` for real pedal names) | Usernames (through `usernameProblem`), New Playground and Playground Settings (name, description), comments, Make Your Own names. A new free-text field that others can see needs it too. See `docs/moderation.md` |
| Timeout states | `useRestriction` in `store/standing.ts` | Comment box, likes (board panel and gallery cards), Show in Public Gallery, Pick a Username. Anything new that's social (posting, liking, sharing) should check it too |
| Scrolling | `index.css` locks page scrolling (for the playground) | Other pages scroll inside their own full-height container (`h-dvh overflow-y-auto`): the gallery, the gear catalog and the editor. A new page needs one too. Dialogs (`Modal`) shrink to the screen and scroll inside. Dropdown menus cap at Radix's available height (`max-h-[var(--radix-dropdown-menu-content-available-height)] overflow-y-auto`): Settings, My Playgrounds, the account menu, the right-click menu, Made By; What's New has its own cap. A sideways-scrolling row clips shadows, so give it padding for them, undone with negative margins, and `pointer-events-none` on the row with `pointer-events-auto` on its items (the gallery's type chips) |
| Usernames | `userGalleryUrl` in `lib/gallery.ts` (Explore filtered to that person: `/gallery/?user=name`; typing "@name" in its search still works) | Every username shown is a link there: Explore cards, the board panel's "by …", and comments. A new place that shows a username should link it too. After the username, `RoleBadges` (`components/RoleBadge.tsx`) adds Builder when it's the board's owner commenting, and the team label (Creator, for @trav) on comments, bylines and Explore cards. Usernames show without an @, and linked ones, like linked brand names, use `nameLink` (underline on hover). The squiggle (`squiggleRule`) appears only after Gear's Newly added heading, never on links, badges or other headings |
| Page width | `.page-main` in `index.css` with `max-w-[1600px]`; side padding grows from 16px to 40px at 1300px wide | Explore, Gear (grid and item pages) and the editor's bar and content. From 1880px wide, `.page-main` is zoomed 12.5% (about 2px more text); size anything in viewport units inside it with `/var(--page-zoom,1)` (Gear's sidebar). The header isn't zoomed |
| Page hero | The top band on Explore and Gear: `rounded-container`, background `color-mix(brand 9%, card)`, a 28px heading, one line under it, a big borderless search, and art on the right from large screens up (Gear: pedal photos, Explore: the most liked board, drawn large from its layout with `drawLayout` and cropped by the band, with a Most liked link). Below it, a bar with the grid's heading, filters, sort and the card size switch | Explore and Gear. A new browse page should open the same way |
| Card size switch | `DensitySwitch` / `useDensity` in `components/DensitySwitch.tsx` (large, medium, small; kept per page in this browser as `pp:density:<page>`) | Explore (beside Sort) and Gear (above the grid). Each page maps the sizes to its own columns; Gear also scales pedal photos so they stay to scale. A new card grid should offer it too |
| Small pills and chips on a page | `shadow-chip` (a `chrome-line` hairline, no lift) | Explore's type chips and the icon buttons over Explore card photos (`cardAction`: Hide, a crossed-out eye for editors, and Report, a flag for anyone but the board's owner, which asks signed-out people to sign in, like the board panel's flag). Comment and like counts on Explore cards are bare icons and numbers at the right of the title row (where the type tag was), like Gear's new and hot marks; comments only show when there are some. Cards are flat; menus and floating panels use `shadow-float` |
| Selects | One rule in `index.css` for every `<select>`: our own chevron 12px from the right edge, with 34px of right padding |
| Dialog titles | `text-base font-semibold` |
| Primary button | `btn-primary` (index.css), from the Figma button: purple `#5B61FB` with a lighter `#6D72F6` highlight in its top ~1px (the gradient border), `0 1px 1px` shadow at 14% black, faint text shadow, semibold, 4px radius (same as every control) |
| Corner radius | controls 4px (`rounded-control`), panels and menus 12px (`rounded-panel`), avatar and color dots fully round |
| Header | Tablet and desktop: 48px tall bar with the 16px logo (16px above and below), save status, account and settings. Phones: no header; account and settings float top-right in a small pill |
| Avatar | 24px box; the pedal keeps its own proportions |
| Segmented toggle (units) | 24px buttons, `text-xs`, inside a 4px-radius track |

Known exceptions: the playground thumbnail in the switcher is 32px with a small radius, and the sign-in code field uses `text-lg` with wide letter spacing on purpose.

Phones (below 640px): floating glass bars (`glass`, `glass-sm` in index.css) with fully rounded ends; the Place button floats apart from the bar as a purple circle; the logo and zoom readout are hidden.

## Keep it consistent

When you change how something looks or behaves, find every other place that shows the same thing and change those
too, in the same commit. If one of them should stay different, say so and ask; don't leave it out silently. The list
below is where this has bitten before. Add to it when you find another.

| Pattern | Where it lives | Also update |
| --- | --- | --- |
| Form label, help text, error, text field | `components/formText.ts` | Every dialog form: Account (Sign In, Create Account, account view), `SetPasswordForm` (Change Password and after a reset), `UsernamePrompt`, `NewPlaygroundDialog`, `EditPlaygroundDialog`, and the editor's forms (`editor/ItemEditor.tsx` for Queue, Add and Catalog, `editor/NewsTab.tsx`). New and Edit Playground still have their own `field` style. The equipment list's inline fields are compact (32px) on purpose but use the same label text. |
| Dialog shell and backdrop | `components/Modal.tsx`, `.modal-backdrop` in `index.css` | Dialogs built by hand: `OnboardingTour`, `SpaceBetweenPanel`. Text placed on the backdrop (the `footer` under a dialog) must use theme colors, since the backdrop is light in light mode. |
| Add Gear / Replace / Edit | `components/SearchPanel.tsx` | It has two layouts: the desktop side panel and the phone sheet. Change both, and check all three modes in each. On phones all three leave the canvas undimmed and fit it above the sheet, and the selection bar (`SelectionMiniMenu`) hides while the sheet is open. |
| Space Between | `components/SpaceBetweenPanel.tsx` | Same two layouts as Add Gear: docked on the left on larger screens, a bottom sheet on phones. Keep the sheet in step with Add Gear's (handle, swipe to close, undimmed canvas fitted above it, selection bar hidden). |
| Site header and nav | `SiteHeader` / `SiteTabs` in `components/SiteTabs.tsx`; `components/PageHeader.tsx` | The gallery, the gear catalog and the editor use `PageHeader` (header plus its dialogs and the `TooltipLayer` that `tip()` needs). The playground wires the same pieces itself in `App.tsx`, so check it too. The Editor tab and Updates' "Post an Update" only show for catalog editors (`useIsEditor`). Each page's HTML (`index.html`, `gallery/index.html`, `gear/index.html`, `editor/index.html`) repeats the fonts, theme script and first-paint colors. |
| Sign-in, account and password dialogs | `AccountDialog`, `SetPasswordForm`, `UsernamePrompt` | They're rendered by both `App.tsx` and `gallery/GalleryApp.tsx`. A dialog added to one page usually belongs on the other. Pick a Username waits until nothing else is open on both pages. Create Account and Pick a Username both start the username from the email (`usernameFromEmail` in `lib/profiles.ts`). |
| Auth emails | `docs/auth-email-template.html`, `docs/auth-reset-template.html` | The two share one layout. Change both, then paste them into Supabase (Authentication → Email Templates). Their images are in `web/public/email`. |
| Logo | `assets/logo.svg`, `components/Logo.tsx`, `components/Wordmark.tsx` (the stacked PEDAL / PLAYGROUND, outlined from the Figma header logo, so no font loads for it), `.app-logo` in `index.css` (dark mode) | `web/public/email/logo-*.png` (exported from the Figma header logo, light and dark), favicons in `public/icons`, `public/social.jpg`. |
| Theme colors | `index.css` | Dark mode is defined twice (following the OS, and when picked in Settings), and OLED black twice more. Change all of them. The email templates copy the colors, and `index.html` has its own `theme-color` (light matches the white page). The page background and the header bar are both `chrome` (white in light mode), and so is anything that should blend with them: the Updates dot ring, the iOS status-bar strip, the editor's tab row. Each page's HTML repeats the light and dark page colors for the first paint. |
| Soft gray button | `barSoftButton` in `components/toolbarStyles.ts` | The same colors are copied into `SiteTabs` (guest buttons) and `EquipmentList`. |
| Floating pill text (toasts, canvas hints) | `components/ActionToast.tsx`, `components/Tooltip.tsx` | They use the same pill style. Change both. |
