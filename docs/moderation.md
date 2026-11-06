# Moderation

Catalog editors flag accounts that break the rules. Players report comments, boards and users. Curse words are kept
out of usernames, board names and descriptions, comments and custom gear names.

| Piece | Where |
| --- | --- |
| Tables, guards and functions | `supabase/migrations/20261106000000_moderation.sql` |
| Reasons, labels, calls | `web/src/lib/moderation.ts` |
| Curse-word check | `web/src/lib/profanity.ts` (usernames are also checked by the database's `username_offensive`; keep the two lists in step) |
| The flagged-account popup | `web/src/components/StandingNotice.tsx`, on the playground (`App.tsx`) and on the gallery and editor (`PageHeader`) |
| Report dialog | `web/src/components/ReportDialog.tsx`: comments (flag icon on a comment) and boards (flag icon in the board panel) |
| Editor tools | `web/src/editor/ModerationTab.tsx` (`/editor/#moderation`, or `#moderation?user=<name>` from a comment's Flag User link) |

## Flags

Each flag has a reason, a note shown to the person, and an action:

- **Warning:** only the notice.
- **Timeout** (1, 7 or 30 days): no commenting, liking, adding boards to the gallery, username changes, reports or
  catalog suggestions until it ends. Building and saving their own boards still works. The database refuses these
  too (the `guard_restricted` and `guard_username` triggers), not only the screens.
- **Ban:** no sign-in (it sets `auth.users.banned_until` and ends their sessions), and their gallery boards and
  comments are hidden. Lifting the ban lets them sign in again and brings back the boards it hid.

The Moderation tab suggests the next step from the account's flags in the last 90 days that weren't lifted: none, a
warning; one, a 7-day timeout; two or more, a ban. The editor can pick something else.

The flagged person sees a popup on their next visit (any page) with the reason, the note and what it means, until they
press **I Understand**. A banned account is signed out after it.

## Reports

Signed-in players pick a reason (Spam or advertising, Harassment or hate, Sexual or violent content, Offensive name
or language, Impersonation, Something else) and can add details (required for Something else). One open report per
person per thing, 20 a day at most, and nobody can report their own things. Reports keep a copy of what was reported,
so editors still see it after an edit or a delete.

In the Moderation tab, **Review User** opens the reported account with the report's reason filled in; flagging resolves
the report. **Dismiss** closes it without a flag.

The tab's feed also lists boards hidden from the gallery (by an editor's Hide, or by a ban), newest first, with who hid
them. **Unhide** puts a board back in the gallery; one hidden by a ban asks first.

## Curse words

Common curse words and slurs are refused, leetspeak too ("sh1t"). Short ones that hide inside ordinary words (cock,
dick, ass) only count on their own, so "Cocktail" and "Bassist" are fine. Names of real catalog pedals are let through
(some have rude names), so a board can mention one.

## Setting it up

1. Apply the migration (it's safe to re-run). Until then, the site works as before: nobody is flagged, reports say
   they aren't set up yet, and the Moderation tab says so.
2. Test with a spare account: report one of its comments from another account, then flag it from the Moderation tab
   (a warning first, then a 1-day timeout), check the popup and the timeout, and lift it.
