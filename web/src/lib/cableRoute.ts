/**
 * Cable routing on the playground: where a plug sits in the world, and an orthogonal path from one plug to another
 * that goes around pedals where it can. Pure functions in inches, no React, so the board drawing and a later signal
 * flow map can share the same geometry. Drawing (rounded corners, color) is the caller's job; `roundedPath` helps.
 */
import { itemBounds } from "./geometry";
import { plugBox, type Plug } from "./plugs";
import type { Item } from "./types";

export type Pt = [number, number];
/** A unit step along one axis. */
export type Dir = Pt;

/** Where a cable leaves a plug: the end of the plug head, and the way it points (out of the pedal's edge). */
export interface PlugAnchor {
  at: Pt;
  dir: Dir;
}

/** A routed cable. `points` are the corners, start and end included; every leg is horizontal or vertical. */
export interface CableRoute {
  points: Pt[];
  /** One per leg: true where no gap was found and the cable runs under a pedal. */
  under: boolean[];
}

export interface RouteOptions {
  /** How far cables keep from pedals, in inches. */
  clearance: number;
  /** How far a cable runs straight out of the plug before it may turn. */
  lead: number;
  /** What a bend costs, in inches of extra cable: higher means fewer, longer legs. */
  bend: number;
  /** How much a leg costs per inch inside a pedal's clearance, and under a pedal. Finite, so a route always exists. */
  nearCost: number;
  underCost: number;
  /** How much a leg costs per inch off the pedalboards (when there are any), so cables keep to the board. */
  offBoardCost: number;
}

export const ROUTE_DEFAULTS: RouteOptions = { clearance: 0.25, lead: 0.25, bend: 1.5, nearCost: 4, underCost: 25, offBoardCost: 2.5 };

/** Turns a point in an item's own (unrotated, unflipped) box into world inches: flip about the center, then rotate. */
function toWorld(item: Item, [x, y]: Pt, vector = false): Pt {
  let dx = vector ? x : x - item.width / 2;
  const dy = vector ? y : y - item.height / 2;
  if (item.flipX) dx = -dx;
  const t = (item.rotation * Math.PI) / 180;
  const c = Math.round(Math.cos(t));
  const s = Math.round(Math.sin(t));
  // CSS rotate() turns clockwise on screen (y points down).
  const rx = dx * c - dy * s;
  const ry = dx * s + dy * c;
  return vector ? [rx, ry] : [item.x + item.width / 2 + rx, item.y + item.height / 2 + ry];
}

/** The plug's cable end in world inches, and the direction it points. */
export function plugAnchor(item: Item, plug: Plug): PlugAnchor {
  const { width: w, height: h } = item;
  const out = plugBox(plug.type).out;
  const [edge, dir]: [Pt, Dir] =
    plug.side === "top"
      ? [[plug.at, 0], [0, -1]]
      : plug.side === "bottom"
        ? [[plug.at, h], [0, 1]]
        : plug.side === "left"
          ? [[0, plug.at], [-1, 0]]
          : [[w, plug.at], [1, 0]];
  const d = toWorld(item, dir, true);
  const e = toWorld(item, edge);
  return { at: [e[0] + d[0] * out, e[1] + d[1] * out], dir: d };
}

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const inside = (b: Box, x: number, y: number) => x > b.left + 1e-9 && x < b.right - 1e-9 && y > b.top + 1e-9 && y < b.bottom - 1e-9;
const grow = (b: Box, d: number): Box => ({ left: b.left - d, top: b.top - d, right: b.right + d, bottom: b.bottom + d });

/** Sorted, de-duplicated coordinates, plus the middle of each gap so cables can run down the center of a channel. */
function lines(values: number[]) {
  const v = [...new Set(values.map((n) => Math.round(n * 1000) / 1000))].sort((a, b) => a - b);
  const all = [...v];
  for (let i = 1; i < v.length; i++) all.push((v[i - 1] + v[i]) / 2);
  return [...new Set(all)].sort((a, b) => a - b);
}

/** A tiny binary heap of [cost, state] for the path search. */
class Heap {
  private a: [number, number][] = [];
  get size() {
    return this.a.length;
  }
  push(cost: number, state: number) {
    const a = this.a;
    a.push([cost, state]);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p][0] <= a[i][0]) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop() {
    const a = this.a;
    const top = a[0];
    const last = a.pop()!;
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
}

/** Directions: right, down, left, up. */
const DIRS: Dir[] = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
];
const dirIndex = ([x, y]: Dir) => DIRS.findIndex((d) => d[0] === Math.sign(x) && d[1] === Math.sign(y));

/**
 * Routes a cable from one plug to another around `obstacles` (the pedals; pass boards' items out). Searches a sparse
 * grid made from the pedals' padded edges, the plugs' lines and the middles between them, so legs line up with the
 * plugs exactly and run down the middle of gaps. Bends cost extra; running near or under a pedal costs more but is
 * allowed, so there's always a route, and the legs under a pedal are marked.
 */
export function routeCable(from: PlugAnchor, to: PlugAnchor, obstacles: Item[], opts: Partial<RouteOptions> = {}, boards: Item[] = []): CableRoute {
  const o = { ...ROUTE_DEFAULTS, ...opts };
  const solid = obstacles.map(itemBounds);
  const padded = solid.map((b) => grow(b, o.clearance));
  const decks = boards.map(itemBounds);
  const a: Pt = [from.at[0] + from.dir[0] * o.lead, from.at[1] + from.dir[1] * o.lead];
  const b: Pt = [to.at[0] + to.dir[0] * o.lead, to.at[1] + to.dir[1] * o.lead];

  // The search area: everything involved, with room to go around the outside.
  const xsRaw = [a[0], b[0], from.at[0], to.at[0]];
  const ysRaw = [a[1], b[1], from.at[1], to.at[1]];
  for (const p of padded) xsRaw.push(p.left, p.right), ysRaw.push(p.top, p.bottom);
  const margin = 1;
  const minX = Math.min(...xsRaw) - margin;
  const maxX = Math.max(...xsRaw) + margin;
  const minY = Math.min(...ysRaw) - margin;
  const maxY = Math.max(...ysRaw) + margin;
  const xs = lines([...xsRaw, minX, maxX]);
  const ys = lines([...ysRaw, minY, maxY]);
  const nx = xs.length;
  const ny = ys.length;
  const find = (arr: number[], v: number) => arr.findIndex((n) => Math.abs(n - v) < 1e-3);
  const start = find(ys, a[1]) * nx + find(xs, a[0]);
  const goal = find(ys, b[1]) * nx + find(xs, b[0]);

  /** What a leg between two neighboring grid points costs per inch, and whether it's under a pedal. */
  const legCost = (x: number, y: number) => {
    if (solid.some((s) => inside(s, x, y))) return o.underCost;
    if (padded.some((s) => inside(s, x, y))) return o.nearCost;
    if (decks.length && !decks.some((s) => inside(s, x, y))) return o.offBoardCost;
    return 1;
  };

  const startDir = dirIndex(from.dir);
  // The cable must arrive heading into the end plug, the opposite of the way that plug points.
  const endDir = dirIndex([-to.dir[0], -to.dir[1]]);
  const states = nx * ny * 4;
  const best = new Float64Array(states).fill(Infinity);
  const prev = new Int32Array(states).fill(-1);
  const heap = new Heap();
  const s0 = start * 4 + startDir;
  best[s0] = 0;
  const h = (node: number) => Math.abs(xs[node % nx] - b[0]) + Math.abs(ys[Math.floor(node / nx)] - b[1]);
  heap.push(h(start), s0);
  let done = -1;
  while (heap.size) {
    const [f, s] = heap.pop();
    const g = best[s];
    if (f - h(s >> 2) > g + 1e-9) continue;
    const node = s >> 2;
    const d = s & 3;
    // Arriving facing the wrong way already paid for one more bend into the plug, so the first arrival is the best.
    if (node === goal) {
      done = s;
      break;
    }
    const ix = node % nx;
    const iy = Math.floor(node / nx);
    for (let nd = 0; nd < 4; nd++) {
      if (nd === (d + 2) % 4) continue; // No doubling back.
      const jx = ix + DIRS[nd][0];
      const jy = iy + DIRS[nd][1];
      if (jx < 0 || jy < 0 || jx >= nx || jy >= ny) continue;
      const len = Math.abs(xs[jx] - xs[ix]) + Math.abs(ys[jy] - ys[iy]);
      const cost = len * legCost((xs[jx] + xs[ix]) / 2, (ys[jy] + ys[iy]) / 2) + (nd === d ? 0 : o.bend);
      const next = (jy * nx + jx) * 4 + nd;
      const total = g + cost + (jy * nx + jx === goal && nd !== endDir ? o.bend : 0);
      if (total < best[next] - 1e-9) {
        best[next] = total;
        prev[next] = s;
        heap.push(total + h(jy * nx + jx), next);
      }
    }
  }

  // Walk back from the goal, then add the straight runs into each plug.
  const path: Pt[] = [];
  for (let s = done; s >= 0; s = prev[s]) {
    const node = s >> 2;
    path.unshift([xs[node % nx], ys[Math.floor(node / nx)]]);
  }
  if (!path.length) path.push(a, b);
  return finish([from.at, ...path, to.at], solid);
}

/** Drops repeated and in-line points, keeping only corners, and marks the legs that run under a pedal. */
function finish(raw: Pt[], solid: Box[]): CableRoute {
  const pts: Pt[] = [];
  for (const p of raw) {
    const last = pts[pts.length - 1];
    if (last && Math.abs(last[0] - p[0]) < 1e-6 && Math.abs(last[1] - p[1]) < 1e-6) continue;
    pts.push(p);
  }
  const corners = pts.filter((p, i) => {
    if (i === 0 || i === pts.length - 1) return true;
    const [px, py] = pts[i - 1];
    const [nx, ny] = pts[i + 1];
    return !((Math.abs(px - p[0]) < 1e-6 && Math.abs(nx - p[0]) < 1e-6) || (Math.abs(py - p[1]) < 1e-6 && Math.abs(ny - p[1]) < 1e-6));
  });
  const under = corners.slice(1).map((p, i) => {
    const q = corners[i];
    return solid.some((s) => inside(s, (p[0] + q[0]) / 2, (p[1] + q[1]) / 2));
  });
  return { points: corners, under };
}

/** SVG path data for a route with its corners rounded by up to `r` (less where legs are short). */
export function roundedPath(points: Pt[], r: number): string {
  if (points.length < 2) return "";
  const f = (n: number) => +n.toFixed(4);
  let d = `M${f(points[0][0])} ${f(points[0][1])}`;
  for (let i = 1; i < points.length - 1; i++) {
    const [px, py] = points[i - 1];
    const [x, y] = points[i];
    const [nx, ny] = points[i + 1];
    const inLen = Math.hypot(x - px, y - py);
    const outLen = Math.hypot(nx - x, ny - y);
    const k = Math.min(r, inLen / 2, outLen / 2);
    const ax = x - ((x - px) / inLen) * k;
    const ay = y - ((y - py) / inLen) * k;
    const bx = x + ((nx - x) / outLen) * k;
    const by = y + ((ny - y) / outLen) * k;
    d += ` L${f(ax)} ${f(ay)} Q${f(x)} ${f(y)} ${f(bx)} ${f(by)}`;
  }
  const last = points[points.length - 1];
  return `${d} L${f(last[0])} ${f(last[1])}`;
}
