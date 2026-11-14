# Plugs

Cable ends drawn on a pedal's edges, lined up with its jacks. They're added only through **Signal Flow** (the cable
tool, `components/Cables.tsx`): starting or ending a cable at a + drops a plug there, and a cable and the plugs at its
ends are one unit that deletes together. There's no separate plug editing mode any more (removed Nov 2026, along with
its **Plugs** menu items and the P key).

- **Suggested jacks:** `findJacks` (`lib/jackFinder.ts`) reads a small copy of a catalog pedal's
  cutout photo, finds each edge's enclosure line, and marks short bumps past it (0.2″ to 1″ wide, at least 0.05″ out)
  as likely jacks, shown as + points in Signal Flow. A + hides once a plug sits within 0.4″ of it (`openHints`). The
  front edge is skipped (footswitch lips read as bumps). Photos with no cutout, or jacks that don't stick out in the
  photo (Meris, many Eventide and Strymon), find nothing, and custom pedals have no photo to read. Every side with no
  suggestion gets a + at its middle instead (`withMiddles`).
- **Types** (`PLUG_TYPES` in `lib/plugs.ts`, drawn to scale by `PlugShape` in `components/PlugArt.tsx`): slim
  right-angle (SP400, the default), right-angle (Rean) and pancake, picked on Signal Flow's bottom bar. Every plug is
  shown from above with its cable dropping under the board, so only the head shows, using Trav's top-down drawings of
  Space Between's plug guide (`assets/plugs/*-down.svg`, 0.2 mm per unit, turned so the barrel goes into the jack).
  Straight, DC and MIDI plugs were dropped; saved ones show as the default (`knownType`), and a saved `flip` or `down`
  is ignored.
- **Layering:** plugs are drawn under the pedal, each with a short stub of barrel (`BARREL_STUB`, 0.25″) running into
  the jack, so a bit of barrel shows wherever the photo's jack leaves room for it.

Plugs live on the item (`Item.plugs`: side, position along it in inches, type) in its unrotated frame, so they
move, rotate, flip, duplicate, undo and save with the pedal. Each add, change or removal is one undo step (an add and
the drag that follows it count as one). They're drawn outside the pedal's box and don't change its size, so they don't
affect snapping, spacing or the board's bounds.
