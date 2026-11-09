# Plugs

Cable ends drawn on a pedal's edges, lined up with its jacks. Select one pedal and choose **Plugs** (left menu on large
screens, the object bar on tablets, the right-click or ••• menu on phones).

- **Opening it** zooms in on the pedal (with room for cables); **Done** puts the view back. The pedal shows no
  selection outline meanwhile.
- **Selecting:** like gear: click a plug to select it, Shift-click to add or remove one, click empty canvas (or press
  Escape) to deselect. Type, Flip Direction and remove apply to every selected plug.
- **Adding:** click (or tap) just outside any edge; a plug of the chosen type drops there. Keep the button down to drag
  it into place in the same move.
- **Moving:** drag a plug along its edge, or round a corner onto another edge. Positions snap to 1/16″.
- **Types** (`PLUG_TYPES` in `lib/plugs.ts`, drawn to scale by `PlugShape` in `components/PlugArt.tsx`): straight ¼″,
  right-angle ¼″, pancake, DC power and MIDI. Picking a type with no plug selected sets it for new plugs; with one
  selected, it changes that plug.
- **Direction:** right-angle and pancake plugs turn their cable sideways; **Flip Direction** mirrors it.
- **Removing:** the trash button, or Delete / Backspace.
- **Done** is the only way out. Meanwhile the canvas only pans (no selecting, dragging gear or menus), keyboard shortcuts are off apart from Delete for a picked plug, and Add Gear waits.

Plugs live on the item (`Item.plugs`: side, position along it in inches, type, flip) in its unrotated frame, so they
move, rotate, flip, duplicate, undo and save with the pedal. Each add, change or removal is one undo step (an add and
the drag that follows it count as one). They're drawn outside the pedal's box and don't change its size, so they don't
affect snapping, spacing or the board's bounds.
