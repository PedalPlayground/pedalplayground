# Prompt: build the Signal Path mode

> Paste everything below the line into a new Claude Code session on the `PedalPlayground/pedalplayground`
> repo. It was written against `react-rebuild` at commit `1761fd63` (October 2026). If files have moved
> since, follow the intent and tell me what changed.

---

## Goal

Build the **Signal Path** mode for PedalPlayground (the React rebuild in `web/`). It shows how the gear on
the open playground is wired together, as a tidy left-to-right diagram in the style of the signal path
screens on modelers like the Line 6 Helix, the Fractal Axe-Fx and the Neural DSP Quad Cortex. People can
build and edit the chain in this view, and the result saves with the playground.

It must handle:

1. **Series** chains (guitar → pedal → pedal → amp).
2. **Stereo** connections, including mono-to-stereo and stereo-to-mono transitions.
3. **Parallel** paths that split and later merge again (wet/dry rigs, two drives blended).
4. **Dead-end routes**: controllers that have no audio output, such as expression pedals, MIDI
   controllers and remote/aux footswitches, which connect to the pedal they control. Also audio branches
   that end without reaching the main output (a tuner on a split, a second amp).
5. **Branching/splitting** where branches do not merge again (an A/B/Y box to two amps, amp plus DI).
6. An **orderly grid** layout that **wraps** onto a new row when the chain is too long for the screen.

Work in phases (see the end), and stop after each phase so I can review it on the beta site.

## How the app works today (read these first)

Read these files before planning. Names below are real; check them before relying on them.

| Area | File | What matters for this feature |
| --- | --- | --- |
| Mode switching | `web/src/store/ui.ts` | `type Mode = "playground" \| "signal" \| "list"`; `mode`, `setMode`. "signal" already exists. |
| Mode rail | `web/src/components/ModeRail.tsx` | The Signal Path entry has `soon: true`, which greys it out. Remove that when the mode works. The label is "Signal Path" with the lucide `Route` icon; keep both. |
| App shell | `web/src/App.tsx` | `listMode` renders `<EquipmentList />` over `<Canvas />` (the canvas stays mounted so its view is kept) and hides the toolbar, object menu, context menu, scale key and back-to-center button. Do the same for signal mode. |
| Pattern to copy | `web/src/components/EquipmentList.tsx` | A full-screen overlay (`absolute inset-0 z-10 overflow-y-auto bg-canvas`) with padding that clears the floating mode rail, an empty state with an "Add Gear" button that switches to the playground and opens search, and "show on playground" via `setMode("playground"); reveal(id)`. Reuse its `describe()` approach (catalog lookup for brand/name) instead of writing a new one. |
| Document & items | `web/src/lib/types.ts` | `Item` (id, kind `"pedal" \| "pedalboard"`, label, image, custom, color, template, jacks, `pedalType`, …) and `PlaygroundDocument` (`schemaVersion: 3`, name, items, view). |
| Store | `web/src/store/playground.ts` | Zustand store. Undo history is `past`/`future: Item[][]` via `record()`; `beginTransaction()` groups a multi-step edit. `deleteSelected`, `replaceItem`, `loadDocument`, `toDocument`, `reset`. |
| Action toasts | `web/src/store/actionToasts.ts` | Wraps store actions to toast ("Deleted", "Rotated 90°"). It only fires when `items` changed, so signal edits need their own check. |
| Persistence | `web/src/store/playground.ts` (`startLocalAutosave`), `web/src/store/cloud.ts` (`contentKey`), `web/src/lib/importers.ts` (`importAny`) | Local autosave watches `items`, `name`, `view`. Cloud save compares `JSON.stringify({ name, items })`. Both must learn about the new signal data or edits will not save. |
| Catalog | `web/src/lib/catalog.ts`, `docs/catalog.md`, `public/data/pedals.json` | Entries have brand, name, size, image, and optional `Current`, `Voltage`, `Type`. There is **no** data about inputs, outputs or stereo yet. |
| Pedal types | `web/src/lib/specs.ts` | `PEDAL_TYPES` includes "Tuner", "Volume / Expression", "Looper", "Multi-Effect", "Amp / Preamp", "Utility". Use these for smart defaults. |
| Custom pedals | `web/src/lib/pedalTemplates.ts`, `web/src/components/CustomItem.tsx`, `PedalArt.tsx` | Custom pedals have a `template` (compact, hammond, wide, modeler, switcher, classic) and optional `jacks`. `CustomItemView` draws them at any size. |
| Thumbnails | `thumbUrl()` in `lib/catalog.ts`, `PedalAvatar.tsx` | Use catalog thumbnails for tiles; use `CustomItemView` for custom pedals. |
| Look and feel | `docs/ui-conventions.md`, `web/src/components/toolbarStyles.ts`, `web/src/index.css` | 36px controls, `text-sm` body, `rounded-control` (4px) / `rounded-panel` (12px), `shadow-panel`, color tokens `ink`, `ink-muted`, `surface`, `surface-hover`, `line`, `chrome-line`, `brand`, `canvas`, `danger`. Tooltips use `tip()` from `Tooltip.tsx`. |
| Known bug | `docs/todo.md` item 18 | Clicking the Signal Path button in the mode rail hides its tooltip. Fix it while you are in `ModeRail.tsx`. |

Conventions to keep:

- UI labels in Title Case ("Signal Path", "Add to Chain", "Not in Chain").
- Short, plain comments that explain why, in the style already in the code.
- Positions in the playground are inches. The signal diagram is **not** to scale: it uses its own grid in
  screen pixels. Never write signal layout coordinates into `Item.x`/`Item.y`.
- Pedalboards are never part of the signal path. Custom pedals are.
- Pushes to `beta` that touch `web/` auto-deploy to beta. Work on a feature branch and open a PR
  into `beta`. Do not push to `beta` directly.

## What the modelers do, and what to take from each

All three draw signal flowing **left to right**, from an input at the far left to an output at the far
right, on a fixed grid of equal-sized block slots. That is the core of the look. Specifics:

**Line 6 Helix (and Helix Stadium).** Each path is a horizontal lane of block slots (Stadium: 12 per
path). Dragging a block down from lane A creates lane B under it and automatically inserts a **Split**
block and a **Merge** block on lane A, joined to lane B by short vertical wires. Splits come in types
(Y, A/B, crossover, dynamic) and merges have their own mix controls. If lane B's split or merge is
removed, the lane gets its own **Input** or **Output** block instead, which is how a branch that does not
re-merge is drawn. Path 1's output can feed Path 2, drawn as a second lane group underneath: that is the
Helix's version of wrapping. Mono or stereo is shown as a small icon on the block. Source:
[Helix Stadium manual, signal path routing](https://manuals.line6.com/en/helix-stadium/live/signal-path-routing).

Take from it: lanes stacked under the main lane for parallel paths; split and merge as visible junctions
that appear automatically; branches that end in their own Output; a long chain continuing in a lane group
below; a small stereo badge on the tile.

**Fractal Axe-Fx III / FM9 / FM3.** A fixed grid of rows and columns (about 6 × 14 on the Axe-Fx III)
where any cell can connect to cells in the next column on any row. Cables are straight horizontal runs
with vertical drops between rows, and empty cells pass signal through with "shunts". Signal never runs
right to left.

Take from it: strict columns so every block in a column lines up, orthogonal wires only (no diagonals),
and fan-out/fan-in drawn as vertical runs between rows. Mixing in and out of lanes is just wires, not
special blocks.

**Neural DSP Quad Cortex.** A grid of 4 rows with 8 block slots each. Each row starts with an input block
and ends with an output block. Splits are drawn as a branch dropping to the next row, with a small node
you open to set the A/B mix. Rows can share inputs and outputs, and one row's output can feed a later
row. Source: [Neural DSP community, routing in QC](https://unity.neuraldsp.com/t/confused-about-routing-in-qc/12645).

Take from it: rounded square tiles with an icon and a short name, generous spacing, and explicit
input/output blocks at the row ends.

**Our blend.** Left-to-right flow. Fixed-size tiles in strict columns (Axe-Fx). Parallel paths as lanes
under the main lane with auto split/merge junctions (Helix). Explicit Input and Output end tiles (Quad
Cortex). Long chains wrap into a new band below, with the wire visibly carried from the end of one band
to the start of the next (Helix Path 1 → Path 2). We do not need DSP limits, block counts or mix controls.

## Data model

Add an optional signal graph to the document. Keep it separate from `Item` so the playground and the
signal path can change independently, and so a pedal can appear in the playground but not the chain.

```ts
// web/src/lib/signal.ts (new). Pure types and functions, no React.

/** How a node's audio comes in and goes out. */
export type Channels = "mono" | "stereo";

export interface IoProfile {
  /** Audio inputs. 0 for controllers and sources. */
  in: 0 | 1;
  out: 0 | 1;
  inChannels: Channels;
  outChannels: Channels;
  /** Controllers send control, not audio: expression, MIDI, aux footswitch. */
  control?: "exp" | "midi" | "aux";
}

export type SignalNode =
  /** A pedal on the playground. Same id as the Item, so replacing a pedal keeps its place in the chain. */
  | { id: string; type: "item"; itemId: string; io?: Partial<IoProfile> }
  /** Virtual end points, not on the playground: "Guitar", "Synth", "Amp FX Send" (sources); "Amp", "Amp FX Return", "DI / PA" (destinations). */
  | { id: string; type: "source" | "destination"; label: string; channels: Channels }
  /** Junctions the app inserts when a path splits or merges, like Helix split and merge blocks. */
  | { id: string; type: "split" | "merge" };

export interface Cable {
  id: string;
  from: string; // node id
  to: string;   // node id
  /** Audio cables are mono or stereo depending on their two ends; control cables run from a controller to the pedal it controls. */
  kind: "audio" | "control";
}

export interface SignalGraph {
  nodes: SignalNode[];
  cables: Cable[];
}
```

Changes elsewhere:

- `PlaygroundDocument` gets `signal?: SignalGraph`. Keep `schemaVersion: 3`, because the field is optional
  and additive. `importAny` passes it through, and on load you drop nodes whose `itemId` no longer exists and
  cables whose ends are missing.
- The store holds `signal: SignalGraph` next to `items`. **Undo history must cover both**: change
  `past`/`future` from `Item[][]` to snapshots of `{ items, signal }`, update `record()`, `undo`, `redo`, and
  every caller. A signal edit and a playground edit then undo in one timeline.
- `deleteSelected` removes the deleted items' nodes and **heals the chain**: if a removed node had exactly
  one audio input and one audio output, connect them. Controllers attached to a deleted pedal become
  unattached, not deleted.
- `replaceItem` keeps the item id, so the node stays put. Reset its `io` override only if the new product's
  default profile differs.
- `reset()` and `newPlayground` start with the default graph: one Guitar source wired to one Amp
  destination.
- `startLocalAutosave` must also fire on `signal` changes, and `contentKey()` in `store/cloud.ts` must
  include it.
- Extend `actionToasts.ts` so signal actions toast too ("Added to Chain", "Moved to Parallel Path",
  "Removed From Chain").

Rules the graph must obey (enforce in `lib/signal.ts`, not in components):

- No cycles in audio cables. Refuse the connection and toast "That would loop the signal back on itself."
  An amp's effects loop is modeled as separate end points: an "Amp" destination for the input, an
  "Amp FX Send" source and an "Amp FX Return" destination, so it never creates a cycle.
- `split` has 1 input and 2 or more outputs. `merge` has 2 or more inputs and 1 output. Remove a junction
  that drops below that, and reconnect its neighbours.
- A controller (`io.control` set) has no audio cables. It has 0 or more control cables, each to an item
  node. A control cable never goes to a source, destination or junction.
- Pedalboards never become nodes.

### Mono, stereo and controllers: the user decides

**Do not guess.** Don't infer stereo, or whether something is a controller, from `pedalType`, the template,
the name or anything else. Every pedal enters the chain as plain **mono in, mono out audio**. The user marks
where the signal is stereo, and which gear is a controller. Their choice is stored in `SignalNode.io`.

- **Per pedal:** in the tile menu, "Input: Mono / Stereo" and "Output: Mono / Stereo". Set both to make it
  stereo all the way through, or only the output for a pedal that turns mono into stereo.
- **Per end point:** the Guitar/Amp/other end tiles have a Mono / Stereo choice too (stereo amps, a stereo
  synth).
- **From one spot onward:** a quick action on a tile, "Stereo From Here", sets this pedal's output and
  every following pedal's input and output to stereo, up to the next merge or destination. That's the
  usual case (stereo after the delay), done in one step. "Mono From Here" reverses it. Each is one undo step.
- **Cables follow the ends.** A cable is stereo only when its source's output and its target's input are
  both stereo. Don't let the user set cables directly; `Cable.channels` can go (drop it from the model).
- **Controllers:** "Treat as Controller" in the tile menu, then choose Expression, MIDI or Aux Switch. The
  pedal leaves the audio path and moves into the controller row. "Treat as Audio" reverses it.
- Mismatches are allowed, because people really wire rigs this way, but they're shown: stereo into a mono
  input gets the warning dot described under Drawing.

Mention in the PR that optional `Inputs`/`Outputs`/`Stereo` catalog fields could pre-fill these choices
later. Don't build that now.

## Layout

Write layout as a **pure function** in `web/src/lib/signalLayout.ts`:

```ts
layoutSignal(graph: SignalGraph, opts: { maxColumns: number }): SignalLayout
```

It returns grid cells (`{ nodeId, band, column, lane }`), wire segments (orthogonal polylines in grid
units), and the list of pedals not in the chain. The component turns grid units into pixels. Keeping it
pure means it can be tested with plain fixtures and reused later for an exported image.

### Grid

- Every tile is the same size (start with 96 × 96 px on desktop, 72 × 72 px on phones) with a fixed gap
  (40 px columns for wires, 24 px lanes). Pedal art is scaled to fit the tile; size is not to scale here.
- A **column** holds one step of the signal. All nodes that are the same number of steps from the input
  share a column, as on the Axe-Fx.
- A **lane** is a row inside a band. Lane 0 is the main path. Parallel branches take lanes 1, 2, … under it.
- A **band** is one horizontal strip of the diagram. When the chain is longer than `maxColumns`, it continues
  in the next band below. `maxColumns = floor(availableWidth / (tile + gap))`, at least 3.

### Building the layout

1. **Find the main path.** From the primary source (the first Guitar) follow audio cables to the primary
   destination (the first Amp). At a split, the main path follows the first output.
2. **Turn the graph into nested blocks.** Read the main path as a sequence of units. A unit is either one
   node, or a **parallel group**: a split, its branches (each itself a sequence, so groups can nest), and the
   merge where they meet. A group whose branches do not meet again is an **open group**: each branch ends in
   its own destination tile or a dead-end cap.
3. **Measure.** A node is 1 column × 1 lane. A group is (split + widest branch + merge) columns wide and the
   sum of its branches' lanes tall. Pad shorter branches with straight wire so the merge lines up in one
   column.
4. **Pack into bands.** Lay units left to right. When the next unit would pass `maxColumns`, start a new
   band. **Never break inside a parallel group**: the whole group moves to the next band. If one group is
   wider than `maxColumns` on its own, let it run past the edge and scroll horizontally inside that band
   only (rare: about 8 pedals inside one split on a phone).
5. **Wrap wire.** Between bands, draw the wire out of the last tile's right side, down into the gap between
   bands, back left under the band, and into the next band's first tile from the left. Put a small arrow at
   the turn so the direction is obvious. The Input tile is only at the start of band 1 and the Output tile
   only at the end of the last band.
6. **Controllers.** Put each controller under the pedal it controls, in a control row below that band's
   lowest lane, joined by a dashed vertical wire. A controller wired to several pedals sits under the first
   and draws a dashed wire along the control row to the others. A controller with no target goes in the
   "Not in Chain" tray.
7. **Other sources and destinations.** Extra sources (a second instrument) enter as a lane that merges into
   the main path. Extra destinations (second amp, DI) end open-group branches. If something cannot be reached
   from any source, draw it as its own band after the main path, labeled with its source.
8. **Fallback.** If the graph is not built from nested groups (two branches that cross-merge), fall back to
   a layered layout: column = longest distance from a source, lanes ordered to reduce crossings (barycenter
   ordering, two passes), the same orthogonal wires. It must still look like a grid, never a hairball.

### Drawing

- Wires are SVG under the tiles, 2 px, `ink-muted`, with rounded corners where they turn. No diagonals.
- **Stereo** cables are two parallel 1.5 px strokes 3 px apart, and stereo tiles get a small "ST" badge in
  the corner (Helix shows a stereo icon in the same place). Where stereo meets a mono input, show a small
  warning dot on the tile with a tooltip: "Stereo into a mono input: the right side is dropped."
- **Control** cables are dashed and use `brand`.
- **Split** and **merge** junctions are small circles (12 px) sitting in the wire, not full tiles, so they
  don't use up a column. Tooltip: "Split" / "Merge".
- **Dead ends**: an audio branch that ends without a destination ends in a short wire with a flat cap.
- Input/Output tiles are smaller pill-shaped tiles ("Guitar", "Amp"), so the pedals stand out.
- Tiles show the pedal art, then the name (one line, truncated), then the pedal type in `text-xs ink-muted`.
- Match the Equipment List's page shell: same top padding to clear the mode rail, same heading style
  ("Signal Path", with "N Pedals in Chain · M Not in Chain" under it), same `animate-enter`.
- Works in light and dark themes using the existing tokens only.

## Editing

The chain must be editable here. Everything works with a mouse, with touch, and from the keyboard.

- **Not in Chain tray.** Below the diagram, a row of every pedal on the playground that isn't a node yet,
  plus controllers with no target. Tapping one shows "Add to End of Chain", "Add Parallel to…", and for
  controllers "Control…".
- **Empty "+" slots** between tiles (shown on hover on desktop, always on touch) insert a pedal from the
  tray at that spot.
- **Drag to reorder** a tile along its lane. Drag a tile **down below its lane** to put it on a new parallel
  path; the app adds the split before and merge after it, as the Helix does. Drag it back up to return it
  to series; empty junctions disappear.
- **Tile menu** (click, or the existing right-click / long-press pattern from `ContextMenu.tsx`):
  "Move to Parallel Path", "Back to Series", "Input: Mono / Stereo", "Output: Mono / Stereo", "Stereo From Here",
  "Mono From Here", "Treat as Controller",
  "Remove From Chain", "Show on Playground".
- **Split/merge junction menu:** "End Branch Here" turns a merge into a dead end or a new destination;
  "Join Back to Main Path" does the reverse.
- **Ends:** tap the Guitar or Amp tile to rename it, set it to stereo, or add another source or destination.
- **Auto Arrange** button in the header: builds a series chain from the pedals on the playground, ordered by
  position on the board **from right to left** (on most boards the guitar plugs in on the right), with
  controllers left in the tray. Ask before replacing an existing chain.
- **Keyboard:** Tab moves into the diagram; arrow keys move between tiles; Alt+Arrow moves the selected tile;
  Delete/Backspace removes it from the chain (not from the playground); Enter opens its menu; Cmd/Ctrl+Z
  undoes.
- **Phones:** no drag needed. Tap a tile to select it; its actions appear in a bottom sheet in the same
  glass style as the toolbar.

## Edge cases to handle

- Empty playground: empty state like the Equipment List ("Add pedals to your playground to wire them up"),
  with "Add Gear".
- Playground with only pedalboards: same empty state.
- One pedal: Guitar → pedal → Amp.
- An old document with no `signal`: show the Guitar → Amp default, everything in the tray, and offer Auto
  Arrange.
- The same pedal model placed twice: two separate nodes (they have different item ids).
- A pedal deleted on the playground: it leaves the chain and the chain heals. Undo restores both.
- Undo after a signal edit while on the playground tab, and the reverse: one shared history.
- A split where one branch is empty: a dry path, drawn as straight wire on its lane.
- Nested splits (a split inside a branch): lanes stack under their parent branch.
- Merge of three or more branches.
- A branch that dead-ends (tuner fed from a split).
- Two amps from an A/B/Y split (open group with two destinations).
- Four-cable method: Guitar → drives → Amp input, Amp FX Send → time effects → Amp FX Return. Show the FX
  loop as its own band labeled "Amp FX Loop".
- Stereo into mono, mono into stereo, "Stereo From Here" up to a merge, and nothing marked stereo (the default).
- An expression pedal controlling two pedals; a controller whose target is deleted.
- Trying to create a cycle: refused with the toast above.
- 30+ pedals: wraps over several bands and stays readable; scrolling vertically works.
- Phone width (375 px): at least 3 columns, nothing cut off, no sideways page scroll.
- Shared links (`?p=`) and the playgrounds list: the chain opens with the playground.
- Locked items: locking is about position on the board, so it doesn't stop signal edits.

## Acceptance criteria

1. The Signal Path button in the mode rail works, and its tooltip no longer disappears on click.
2. A new playground shows Guitar → Amp. Adding pedals and choosing Auto Arrange gives a single series row
   ordered right to left from the board.
3. Every scenario in "Edge cases" can be built through the UI and looks like a grid: tiles in strict
   columns, orthogonal wires, nothing overlapping.
4. Long chains wrap into bands with the wire carried visibly from band to band. A parallel group is never
   split across bands.
5. Nothing is stereo until the user says so. Stereo cables and stereo tiles are clearly different from mono.
   Stereo-into-mono shows the warning.
6. Controllers sit below their target with dashed wires and never appear in the audio path.
7. Signal edits undo and redo, autosave locally, save to the cloud, and survive a reload and a shared link.
8. Deleting or replacing a pedal on the playground keeps the chain valid.
9. Usable with only a keyboard, and on a phone with only taps.
10. Light and dark themes both look right. `npm run build` and `npm run typecheck` pass in `web/`.
11. `layoutSignal` has unit tests for the edge-case fixtures (add Vitest as a dev dependency for this; the
    project has no test runner yet). Check the UI with Playwright screenshots at 1440 px and 375 px, light
    and dark.

## Phases (stop after each for review)

1. **Model and persistence.** `lib/signal.ts` types and rules, store changes, undo/redo snapshots, autosave,
   cloud `contentKey`, `importAny`, delete/replace healing. No UI yet beyond un-greying the mode rail entry
   to show a placeholder.
2. **Read-only diagram.** `lib/signalLayout.ts`, its tests, and `components/SignalPath.tsx` drawing fixture
   graphs and the real chain, including wrapping, stereo, controllers and dead ends. Screenshots in the PR.
3. **Editing.** Tray, "+" slots, drag, tile and junction menus, Auto Arrange, keyboard and phone flows,
   toasts.
4. **Polish.** Stereo and controller warnings, empty states, the four-cable method band, and an entry in
   `docs/handoff.md` describing the mode.

Before writing code, read the files listed above and reply with a short plan for phase 1, including any
place where this prompt doesn't match the code.
