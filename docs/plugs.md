# Plugs

Cable ends drawn on a pedal's edges, lined up with its jacks. Select one pedal and choose **Plugs** (left menu on large
screens, the object bar on tablets, the right-click or ••• menu on phones, and the small bar under the selection), or press **P**.

- **Opening it** zooms in on the pedal (with room for cables); **Done** puts the view back. The pedal shows no
  selection outline meanwhile.
- **Selecting:** like gear: click a plug to select it, Shift-click to add or remove one, click empty canvas (or press
  Escape) to deselect. Type, Rotate Plug and remove apply to every selected plug.
- **Adding:** click (or tap) just outside any edge; a plug of the chosen type drops there. Keep the button down to drag
  it into place in the same move.
- **Suggested jacks:** when it opens, `findJacks` (`lib/jackFinder.ts`) reads a small copy of a catalog pedal's
  cutout photo, finds each edge's enclosure line, and marks short bumps past it (0.2″ to 1″ wide, at least 0.05″ out)
  as likely jacks. Each shows as a small + just outside the edge (screen-sized, so it reads at any zoom); click one
  to add a plug of the chosen type there. A + hides once a plug sits within
  0.4″ of it. The front edge is skipped (footswitch lips read as bumps). Photos with no cutout, or jacks that don't
  stick out in the photo (Meris, many Eventide and Strymon), give no suggestions; custom pedals have no photo to read.
- **Moving:** drag a plug along its edge, or round a corner onto another edge. Positions snap to 1/16″.
- **Types** (`PLUG_TYPES` in `lib/plugs.ts`, drawn to scale by `PlugShape` in `components/PlugArt.tsx`): straight ¼″,
  right-angle (Rean), slim right-angle (SP400) and pancake. The three right-angle types use the same drawings as Space
  Between's plug guide (`assets/plugs/*.svg`, 0.2 mm per unit, turned so the barrel goes into the jack); the straight
  plug is drawn in code in the same grays. DC and MIDI plugs were dropped (Nov 2026); saved ones show as straight
  (`knownType`).
- **Layering:** plugs are drawn under the pedal, each with a short stub of barrel (`BARREL_STUB`, 0.25″) running into
  the jack, so a bit of barrel shows wherever the photo's jack leaves room for it. Picking a type with no plug selected sets it for new plugs; with one
  selected, it changes that plug.
- **Direction:** right-angle plugs have three ways to sit, and **Rotate Plug** (rotate icon) steps through them: cable
  to one side, cable down into the board (for routing under it, drawn with Trav's top-down drawings,
  `assets/plugs/*-down.svg`, from the "Jacks" section of his Figma file, with no cable showing), then cable to the other
  side (stored as `flip`). With no plug picked, it sets the way new plugs sit.
- **Removing:** the trash button, or Delete / Backspace.
- **Switching pedals:** the other pedals sit at 50% opacity; hovering one brings it to full and shows an **Add
  Plugs** pill (tooltip colors, screen-sized). Click it (without dragging) to move plug editing to it, zoomed in on it. Done
  still returns to the view from before plug mode opened.
- **Done** is the only way out. Meanwhile the canvas only pans (no selecting, dragging gear or menus), keyboard shortcuts are off apart from Delete for a picked plug, and Add Gear waits.

Plugs live on the item (`Item.plugs`: side, position along it in inches, type, flip) in its unrotated frame, so they
move, rotate, flip, duplicate, undo and save with the pedal. Each add, change or removal is one undo step (an add and
the drag that follows it count as one). They're drawn outside the pedal's box and don't change its size, so they don't
affect snapping, spacing or the board's bounds.
