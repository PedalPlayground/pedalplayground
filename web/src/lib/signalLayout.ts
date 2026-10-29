/**
 * Lays the signal path out as a modeler-style grid: left to right from the input, parallel paths as lanes
 * under the main one, controllers in a row under the pedal they control, and long chains wrapping into a
 * new band below. Pure: it takes the graph and some sizes and returns pixel positions, so it can be tested
 * on its own and reused for an exported image later.
 */
import { cableChannels, ioOf, isController, nodeById, stereoIntoMono, type Channels, type SignalGraph, type SignalNode } from "./signal";
import type { Item } from "./types";

export interface LayoutMetrics {
  /** Room for the diagram, in px. Bands wrap to fit it. */
  maxWidth: number;
  tileW: number;
  tileH: number;
  /** Input and Output tiles are narrower than pedals. */
  endW: number;
  /** Splits and merges are dots that sit in a narrow column of their own. */
  junctionW: number;
  /** Horizontal room between columns, where the wires run. */
  gap: number;
  /** Vertical room between lanes. */
  laneGap: number;
  /** Vertical room between bands, where the wrap wire runs back to the left. */
  bandGap: number;
  /** Space around the whole diagram. */
  pad: number;
}

export const DESKTOP_METRICS: Omit<LayoutMetrics, "maxWidth"> = {
  tileW: 104,
  tileH: 112,
  endW: 72,
  junctionW: 16,
  gap: 36,
  laneGap: 28,
  bandGap: 48,
  pad: 24,
};

export const PHONE_METRICS: Omit<LayoutMetrics, "maxWidth"> = {
  tileW: 80,
  tileH: 96,
  endW: 56,
  junctionW: 14,
  gap: 24,
  laneGap: 20,
  bandGap: 40,
  pad: 16,
};

export type TileKind = "item" | "source" | "destination" | "controller";

export interface TileBox {
  id: string;
  kind: TileKind;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface JunctionDot {
  id: string;
  type: "split" | "merge";
  /** Center. */
  x: number;
  y: number;
}

export interface Wire {
  id: string;
  kind: "audio" | "control";
  channels: Channels | null;
  /** Orthogonal polyline, in px. */
  points: [number, number][];
  /** This wire runs from the end of one band to the start of the next. */
  wraps: boolean;
  /** Where a "+" to insert a pedal on this wire goes: the middle of its longest straight run across. */
  slot: [number, number] | null;
}

export interface SignalLayout {
  width: number;
  height: number;
  tiles: TileBox[];
  junctions: JunctionDot[];
  wires: Wire[];
  /** Where an audio branch ends without reaching an output. */
  deadEnds: { x: number; y: number }[];
  /** Tiles getting stereo into a mono input. */
  warnings: string[];
  /** Pedals on the playground that aren't wired into the chain, in playground order. */
  tray: string[];
}

// ---------------------------------------------------------------------------------------------------------
// 1. Read the graph as nested units: single nodes, and splits with their branches.

type Unit =
  | { t: "node"; id: string }
  /** A merge reached along one path only; its other inputs come from elsewhere. */
  | { t: "junction"; id: string }
  /** A split, its branches that meet again at `merge`, and any `side` branches that end on their own. */
  | { t: "group"; split: string; branches: Unit[][]; merge: string; side: Unit[][] }
  /** A split whose branches don't meet again. The longest carries on as the main path; the rest hang below. */
  | { t: "split"; id: string; side: Unit[][] };

interface Parsed {
  units: Unit[];
  /** The node this run stopped at without placing it: a merge (inside a branch) or something already placed. */
  stopAt?: string;
}

function audioOuts(g: SignalGraph, id: string) {
  return g.cables.filter((c) => c.kind === "audio" && c.from === id).map((c) => c.to);
}

const size = (units: Unit[]): number =>
  units.reduce((n, u) => n + (u.t === "group" ? 1 + Math.max(...u.branches.map(size)) : 1), 0);

function parse(g: SignalGraph, start: string | undefined, placed: Set<string>, inBranch: boolean): Parsed {
  const units: Unit[] = [];
  let cur = start;
  while (cur !== undefined) {
    if (placed.has(cur)) return { units, stopAt: cur };
    const node = nodeById(g, cur);
    if (!node || isController(node)) return { units };

    if (node.type === "merge") {
      if (inBranch) return { units, stopAt: cur };
      placed.add(cur);
      units.push({ t: "junction", id: cur });
      cur = audioOuts(g, cur)[0];
      continue;
    }

    if (node.type === "split") {
      placed.add(cur);
      const branches = audioOuts(g, cur).map((o) => parse(g, o, placed, true));
      // The merge most branches reach closes the group, if at least two reach it.
      const counts = new Map<string, number>();
      for (const b of branches) {
        if (b.stopAt && !placed.has(b.stopAt) && nodeById(g, b.stopAt)?.type === "merge") counts.set(b.stopAt, (counts.get(b.stopAt) ?? 0) + 1);
      }
      const [merge, count] = [...counts].sort((a, b) => b[1] - a[1])[0] ?? [undefined, 0];
      if (merge && count >= 2) {
        placed.add(merge);
        units.push({
          t: "group",
          split: cur,
          branches: branches.filter((b) => b.stopAt === merge).map((b) => b.units),
          merge,
          side: branches.filter((b) => b.stopAt !== merge).map((b) => b.units),
        });
        cur = audioOuts(g, merge)[0];
        continue;
      }
      // Open split: carry on along the longest branch.
      const main = branches.reduce((best, b) => (size(b.units) > size(best.units) ? b : best), branches[0] ?? { units: [] });
      units.push({ t: "split", id: cur, side: branches.filter((b) => b !== main).map((b) => b.units) });
      units.push(...main.units);
      cur = main.stopAt;
      continue;
    }

    placed.add(cur);
    units.push({ t: "node", id: cur });
    cur = audioOuts(g, cur)[0];
  }
  return { units };
}

// ---------------------------------------------------------------------------------------------------------
// 2. Measure and place units in blocks: x in px from the block's left, lanes counted from its top lane.

interface Cell {
  id: string;
  x: number;
  lane: number;
  w: number;
  junction?: "split" | "merge";
}

interface Block {
  w: number;
  lanes: number;
  cells: Cell[];
  /** An empty parallel branch: the wire from split to merge runs along this lane. */
  via: { from: string; to: string; lane: number }[];
}

class Measure {
  constructor(
    private g: SignalGraph,
    private m: LayoutMetrics,
  ) {}

  nodeW(id: string) {
    const n = nodeById(this.g, id)!;
    return n.type === "source" || n.type === "destination" ? this.m.endW : this.m.tileW;
  }

  /** Width of a run of units, without side branches. */
  seqW(units: Unit[]): number {
    return units.reduce((w, u, i) => w + (i ? this.m.gap : 0) + this.unitW(u), 0);
  }

  unitW(u: Unit): number {
    const { junctionW: j, gap } = this.m;
    switch (u.t) {
      case "node":
        return this.nodeW(u.id);
      case "junction":
      case "split":
        return j;
      case "group":
        return j + gap + Math.max(0, ...u.branches.map((b) => this.seqW(b))) + gap + j;
    }
  }

  /** Lays out a run of units side by side, then hangs side branches in the free lanes below. */
  seq(units: Unit[]): Block {
    const { gap, junctionW: j } = this.m;
    const block: Block = { w: 0, lanes: 1, cells: [], via: [] };
    const taken: { x0: number; x1: number; l0: number; l1: number }[] = [];
    const sides: { x: number; units: Unit[] }[] = [];
    let x = 0;
    units.forEach((u, i) => {
      if (i) x += gap;
      const b = this.unit(u);
      add(block, b, x, 0);
      taken.push({ x0: x, x1: x + b.w, l0: 0, l1: b.lanes - 1 });
      if (u.t === "group" || u.t === "split") for (const s of u.side) sides.push({ x: x + j + gap, units: s });
      x += b.w;
    });
    block.w = x;
    for (const s of sides) {
      const b = this.seq(s.units);
      const x1 = s.x + Math.max(b.w, 1);
      let lane = 1;
      while (taken.some((t) => t.x0 < x1 + gap / 2 && s.x - gap / 2 < t.x1 && t.l0 <= lane + b.lanes - 1 && lane <= t.l1)) lane++;
      add(block, b, s.x, lane);
      taken.push({ x0: s.x, x1, l0: lane, l1: lane + b.lanes - 1 });
      block.w = Math.max(block.w, x1);
    }
    return block;
  }

  unit(u: Unit): Block {
    const { gap, junctionW: j } = this.m;
    switch (u.t) {
      case "node":
        return { w: this.nodeW(u.id), lanes: 1, cells: [{ id: u.id, x: 0, lane: 0, w: this.nodeW(u.id) }], via: [] };
      case "junction":
        return { w: j, lanes: 1, cells: [{ id: u.id, x: 0, lane: 0, w: j, junction: "merge" }], via: [] };
      case "split":
        return { w: j, lanes: 1, cells: [{ id: u.id, x: 0, lane: 0, w: j, junction: "split" }], via: [] };
      case "group": {
        const block: Block = { w: this.unitW(u), lanes: 0, cells: [], via: [] };
        block.cells.push({ id: u.split, x: 0, lane: 0, w: j, junction: "split" });
        for (const branch of u.branches) {
          if (branch.length === 0) block.via.push({ from: u.split, to: u.merge, lane: block.lanes });
          const b = this.seq(branch);
          add(block, b, j + gap, block.lanes);
        }
        block.cells.push({ id: u.merge, x: block.w - j, lane: 0, w: j, junction: "merge" });
        return block;
      }
    }
  }
}

function add(into: Block, b: Block, dx: number, dl: number) {
  for (const c of b.cells) into.cells.push({ ...c, x: c.x + dx, lane: c.lane + dl });
  for (const v of b.via) into.via.push({ ...v, lane: v.lane + dl });
  into.lanes = Math.max(into.lanes, dl + b.lanes);
}

// ---------------------------------------------------------------------------------------------------------
// 3. Pack into bands, place controllers, route wires.

export function layoutSignal(g: SignalGraph, items: Item[], m: LayoutMetrics): SignalLayout {
  const measure = new Measure(g, m);
  const placed = new Set<string>();
  const hasAudio = (id: string) => g.cables.some((c) => c.kind === "audio" && (c.from === id || c.to === id));

  // Runs to lay out: the first source's chain, other sources, then any wired gear no input reaches.
  const runs: Unit[][] = [];
  const starts = [
    ...g.nodes.filter((n) => n.type === "source"),
    ...g.nodes.filter((n) => n.type !== "source" && !g.cables.some((c) => c.kind === "audio" && c.to === n.id)),
    ...g.nodes,
  ];
  for (const n of starts) {
    if (placed.has(n.id) || isController(n) || (n.type === "item" && !hasAudio(n.id))) continue;
    const { units } = parse(g, n.id, placed, false);
    if (units.length) runs.push(units);
  }

  // Wrap each run into bands no wider than the room available. Groups never break across bands.
  const room = Math.max(m.maxWidth - m.pad * 2, m.tileW);
  const bands: Unit[][] = [];
  for (const run of runs) {
    let band: Unit[] = [];
    let w = 0;
    for (const u of run) {
      const uw = measure.unitW(u);
      if (band.length && w + m.gap + uw > room) {
        bands.push(band);
        band = [];
        w = 0;
      }
      w += (band.length ? m.gap : 0) + uw;
      band.push(u);
    }
    if (band.length) bands.push(band);
  }

  const laneY = (top: number, lane: number) => top + lane * (m.tileH + m.laneGap);
  const tiles: TileBox[] = [];
  const junctions: JunctionDot[] = [];
  const boxes = new Map<string, { x: number; y: number; w: number; h: number; band: number; junction: boolean }>();
  const via = new Map<string, number>();
  const bandBottoms: number[] = [];
  const bandRights: number[] = [];

  // Controllers sit under the first pedal they control that made it into the diagram.
  const controllers = g.nodes.filter(isController);
  const controlTarget = (id: string) =>
    g.cables.filter((c) => c.kind === "control" && c.from === id).map((c) => c.to).find((t) => placed.has(t));

  let top = m.pad;
  let width = 0;
  bands.forEach((band, bi) => {
    const b = measure.seq(band);
    for (const c of b.cells) {
      const x = m.pad + c.x;
      const y = laneY(top, c.lane);
      if (c.junction) {
        junctions.push({ id: c.id, type: c.junction, x: x + c.w / 2, y: y + m.tileH / 2 });
        boxes.set(c.id, { x, y, w: c.w, h: m.tileH, band: bi, junction: true });
      } else {
        const n = nodeById(g, c.id)!;
        tiles.push({ id: c.id, kind: n.type === "item" ? "item" : (n.type as TileKind), x, y, w: c.w, h: m.tileH });
        boxes.set(c.id, { x, y, w: c.w, h: m.tileH, band: bi, junction: false });
      }
    }
    for (const v of b.via) via.set(`${v.from}>${v.to}`, laneY(top, v.lane) + m.tileH / 2);
    let bottom = laneY(top, b.lanes - 1) + m.tileH;

    // This band's controllers, left to right under their targets, never overlapping.
    const here = controllers
      .map((c) => ({ c, target: controlTarget(c.id) }))
      .filter((e) => e.target && boxes.get(e.target!)?.band === bi)
      .map((e) => ({ id: e.c.id, tx: boxes.get(e.target!)!.x }))
      .sort((a, b2) => a.tx - b2.tx);
    if (here.length) {
      const y = bottom + m.laneGap;
      let right = -Infinity;
      for (const e of here) {
        const x = Math.max(e.tx, right + m.gap);
        tiles.push({ id: e.id, kind: "controller", x, y, w: m.tileW, h: m.tileH });
        boxes.set(e.id, { x, y, w: m.tileW, h: m.tileH, band: bi, junction: false });
        right = x + m.tileW;
      }
      bottom = y + m.tileH;
    }

    const right = Math.max(m.pad + b.w, ...[...boxes.values()].filter((x) => x.band === bi).map((x) => x.x + x.w));
    bandBottoms.push(bottom);
    bandRights.push(right);
    width = Math.max(width, right + m.pad);
    top = bottom + m.bandGap;
  });
  const height = bands.length ? top - m.bandGap + m.pad : m.pad * 2;

  // Wires.
  const wires: Wire[] = [];
  const deadEnds: { x: number; y: number }[] = [];
  const mid = (b: { y: number; h: number }) => b.y + b.h / 2;
  for (const c of g.cables) {
    const a = boxes.get(c.from);
    const b = boxes.get(c.to);
    if (!a || !b) continue;
    if (c.kind === "control") {
      // Up from the controller's top to the bottom of the pedal it controls.
      const cx = a.x + a.w / 2;
      const tx = b.x + b.w / 2;
      const turn = a.y - m.laneGap / 2;
      const points: [number, number][] = cx === tx ? [[cx, a.y], [tx, b.y + b.h]] : [[cx, a.y], [cx, turn], [tx, turn], [tx, b.y + b.h]];
      wires.push({ id: c.id, kind: "control", channels: null, points, wraps: false, slot: null });
      continue;
    }
    const sx = a.junction ? a.x + a.w / 2 : a.x + a.w;
    const sy = mid(a);
    const tx = b.junction ? b.x + b.w / 2 : b.x;
    const ty = mid(b);
    let points: [number, number][];
    let wraps = false;
    const lane = via.get(`${c.from}>${c.to}`);
    if (a.band !== b.band || tx < sx) {
      // Out to the right, down into the gap under the band, back left, and into the next tile.
      wraps = true;
      const gutter = bandBottoms[a.band] + m.bandGap / 2;
      const outX = Math.max(sx, bandRights[a.band]) + m.gap / 2;
      const inX = tx - m.gap / 2;
      points = [[sx, sy], [outX, sy], [outX, gutter], [inX, gutter], [inX, ty], [tx, ty]];
    } else if (lane !== undefined) {
      points = [[sx, sy], [sx, lane], [tx, lane], [tx, ty]];
    } else if (sy === ty) {
      points = [[sx, sy], [tx, ty]];
    } else if (a.junction) {
      points = [[sx, sy], [sx, ty], [tx, ty]];
    } else if (b.junction) {
      points = [[sx, sy], [tx, sy], [tx, ty]];
    } else {
      const xm = tx - m.gap / 2;
      points = [[sx, sy], [xm, sy], [xm, ty], [tx, ty]];
    }
    wires.push({ id: c.id, kind: "audio", channels: cableChannels(g, c), points, wraps, slot: slotOn(points, wraps) });
  }
  for (const t of tiles) {
    if (t.kind === "item" && !g.cables.some((c) => c.kind === "audio" && c.from === t.id)) deadEnds.push({ x: t.x + t.w, y: t.y + t.h / 2 });
  }

  const warnings = [...new Set(stereoIntoMono(g).map((c) => c.to))].filter((id) => boxes.has(id));
  const onDiagram = new Set(tiles.map((t) => t.id));
  const tray = items.filter((i) => i.kind === "pedal" && !onDiagram.has(i.id)).map((i) => i.id);

  return { width: Math.max(width, m.pad * 2), height, tiles, junctions, wires, deadEnds, warnings, tray };
}

/** The middle of the longest horizontal run; on a wrap wire, a quarter of the way along the run back left. */
function slotOn(points: [number, number][], wraps: boolean): [number, number] | null {
  if (wraps && points.length >= 4) {
    const [[x0, y], [x1]] = [points[2], points[3]];
    return [x0 + (x1 - x0) / 4, y];
  }
  let best: [number, number] | null = null;
  let len = -1;
  for (let i = 1; i < points.length; i++) {
    const [x0, y0] = points[i - 1];
    const [x1, y1] = points[i];
    if (y0 === y1 && Math.abs(x1 - x0) > len) {
      len = Math.abs(x1 - x0);
      best = [(x0 + x1) / 2, y0];
    }
  }
  return best;
}

/** How a tile describes its channels: "ST" for stereo all the way through, "M→ST" or "ST→M" where it changes. */
export function channelBadge(node: SignalNode | undefined): string | null {
  if (!node || isController(node) || node.type === "split" || node.type === "merge") return null;
  const { inChannels, outChannels } = ioOf(node);
  if (node.type === "source" || node.type === "destination") return inChannels === "stereo" ? "ST" : null;
  if (inChannels === "stereo" && outChannels === "stereo") return "ST";
  if (outChannels === "stereo") return "M→ST";
  if (inChannels === "stereo") return "ST→M";
  return null;
}
