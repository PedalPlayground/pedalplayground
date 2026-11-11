/**
 * Cables on the playground: which plug is wired to which. A cable is stored on one of its two plugs (`Plug.link`), so
 * it moves, saves and undoes with the items. This file turns those links into a plain list of cables with a signal
 * direction, for the board drawing and, later, the signal flow map. Pure functions, no React.
 */
import { plugAnchor, routeCable, type CableRoute, type PlugAnchor, type RouteOptions } from "./cableRoute";
import type { ManualLegs, Plug, PlugEnd } from "./plugs";
import type { Pt } from "./cableRoute";
import type { Item } from "./types";

/** A plug's role in the signal, read from where it sits on the pedal. */
export type PlugRole = "in" | "out" | null;

export interface BoardCable {
  /** Stable while the cable exists: the stored end's ids. */
  id: string;
  /** Signal runs from `from` to `to`. */
  from: PlugEnd;
  to: PlugEnd;
  /** The plug the cable is stored on (its link points at the other end). */
  stored: PlugEnd;
  /** A hand-placed shape, from the stored plug to the other. */
  legs?: ManualLegs;
}

export const sameEnd = (a: PlugEnd, b: PlugEnd) => a.item === b.item && a.plug === b.plug;
export const cableId = (end: PlugEnd) => `${end.item}:${end.plug}`;

/** Where the plug sits across the pedal's own face, 0 at its left edge to 1 at its right, whatever its rotation. */
function across(item: Item, plug: Plug) {
  const x = plug.side === "right" ? item.width : plug.side === "left" ? 0 : plug.at;
  return x / item.width;
}

/**
 * Pedals run right to left: the input on the right (right side, or the top's right half), the output on the left.
 * This reads the pedal's own face, so it holds whatever way the pedal is turned. A plug dead center can't tell.
 */
export function plugRole(item: Item, plug: Plug): PlugRole {
  const a = across(item, plug);
  if (Math.abs(a - 0.5) < 0.02) return null;
  return a > 0.5 ? "in" : "out";
}

/**
 * Every cable on the board, each with its signal direction: from an output to an input when the plugs say so,
 * otherwise from the plug the cable is stored on (the one picked first) to the other. Links to plugs that are gone are
 * left out.
 */
export function boardCables(items: Item[]): BoardCable[] {
  const byId = new Map(items.map((i) => [i.id, i]));
  const plugOf = (e: PlugEnd) => byId.get(e.item)?.plugs?.find((p) => p.id === e.plug);
  const out: BoardCable[] = [];
  for (const item of items) {
    for (const plug of item.plugs ?? []) {
      if (!plug.link) continue;
      const here: PlugEnd = { item: item.id, plug: plug.id };
      const there = plug.link;
      const other = plugOf(there);
      if (!other || sameEnd(here, there)) continue;
      const a = plugRole(item, plug);
      const b = plugRole(byId.get(there.item)!, other);
      const reversed = (a === "in" && b !== "in") || (b === "out" && a !== "out");
      out.push({
        id: cableId(here),
        from: reversed ? there : here,
        to: reversed ? here : there,
        stored: here,
        ...(plug.link.legs ? { legs: plug.link.legs } : {}),
      });
    }
  }
  return out;
}

/** The items with every cable on these plugs removed. Unchanged items keep their identity. */
export function unplug(items: Item[], ends: PlugEnd[]): Item[] {
  const hit = (e: PlugEnd) => ends.some((x) => sameEnd(x, e));
  return items.map((i) => {
    if (!i.plugs?.some((p) => p.link && (hit({ item: i.id, plug: p.id }) || hit(p.link)))) return i;
    return {
      ...i,
      plugs: i.plugs.map((p) => {
        if (!p.link || !(hit({ item: i.id, plug: p.id }) || hit(p.link))) return p;
        const { link: _, ...rest } = p;
        return rest;
      }),
    };
  });
}

/** Wires two plugs together. A jack takes one cable, so any cable already on either plug is unplugged first. */
export function connectPlugs(items: Item[], a: PlugEnd, b: PlugEnd): Item[] {
  if (sameEnd(a, b)) return items;
  return unplug(items, [a, b]).map((i) =>
    i.id === a.item && i.plugs ? { ...i, plugs: i.plugs.map((p) => (p.id === a.plug ? { ...p, link: { item: b.item, plug: b.plug } } : p)) } : i,
  );
}

/** Copies of plugs carry no cables (a copied pedal starts unwired). */
export const withoutLinks = (plugs: Plug[]) =>
  plugs.map((p) => {
    if (!p.link) return p;
    const { link: _, ...rest } = p;
    return rest;
  });

export interface RoutedCable extends BoardCable {
  route: CableRoute;
}

/** Routes every cable around the pedals, keeping to the pedalboards where it can, then eases apart runs that would lie on top of each other. */
export function routeBoardCables(items: Item[], opts: Partial<RouteOptions> & { spacing?: number } = {}): RoutedCable[] {
  const byId = new Map(items.map((i) => [i.id, i]));
  const pedals = items.filter((i) => i.kind === "pedal");
  const boards = items.filter((i) => i.kind === "pedalboard");
  const anchor = (e: PlugEnd): PlugAnchor => {
    const item = byId.get(e.item)!;
    return plugAnchor(item, item.plugs!.find((p) => p.id === e.plug)!);
  };
  const routed = boardCables(items).map((c) => {
    if (!c.legs) return { ...c, route: routeCable(anchor(c.from), anchor(c.to), pedals, opts, boards) };
    // A hand-placed shape is stored from the stored plug's end; draw it from `from` like the rest.
    const reversed = c.from !== c.stored;
    const pts = fromManual(anchor(c.stored).at, anchor(reversed ? c.from : c.to).at, c.legs);
    if (reversed) pts.reverse();
    return { ...c, route: { points: pts, under: pts.slice(1).map(() => false) } };
  });
  // Hand-placed cables stay exactly where they were put; only automatic ones step aside.
  separate(
    routed.filter((r) => !r.legs).map((r) => r.route),
    opts.spacing ?? 0.2,
  );
  return routed;
}

/**
 * Cables that share a run would draw as one. This spreads overlapping inner legs (never the legs into the plugs)
 * side by side, `spacing` apart, centered on the shared line. Moving a leg sideways only stretches its neighbours,
 * so every route stays orthogonal. Changes the routes in place.
 */
export function separate(routes: CableRoute[], spacing: number) {
  for (const axis of [0, 1] as const) {
    // A horizontal leg (axis 0) runs along x at a fixed y; a vertical one along y at a fixed x.
    const fixed = axis === 0 ? 1 : 0;
    type Leg = { r: CableRoute; i: number; at: number; lo: number; hi: number };
    const legs: Leg[] = [];
    for (const r of routes) {
      for (let i = 1; i < r.points.length - 2; i++) {
        const p = r.points[i];
        const q = r.points[i + 1];
        if (Math.abs(p[fixed] - q[fixed]) > 1e-6) continue;
        legs.push({ r, i, at: p[fixed], lo: Math.min(p[axis], q[axis]), hi: Math.max(p[axis], q[axis]) });
      }
    }
    // Group legs on the same line whose spans overlap, then fan each group out.
    const seen = new Set<Leg>();
    for (const leg of legs) {
      if (seen.has(leg)) continue;
      const group = [leg];
      seen.add(leg);
      for (let k = 0; k < group.length; k++) {
        for (const other of legs) {
          if (seen.has(other) || other.r === group[k].r) continue;
          if (Math.abs(other.at - group[k].at) < 1e-6 && other.lo < group[k].hi - 1e-6 && group[k].lo < other.hi - 1e-6) {
            seen.add(other);
            group.push(other);
          }
        }
      }
      if (group.length < 2) continue;
      // Order by where the legs come from, so neighbours don't cross on their way in.
      group.sort((a, b) => a.r.points[a.i - 1][fixed] - b.r.points[b.i - 1][fixed]);
      group.forEach((g, n) => {
        const shift = (n - (group.length - 1) / 2) * spacing;
        g.r.points[g.i] = (axis === 0 ? [g.r.points[g.i][0], g.at + shift] : [g.at + shift, g.r.points[g.i][1]]);
        g.r.points[g.i + 1] = (axis === 0 ? [g.r.points[g.i + 1][0], g.at + shift] : [g.at + shift, g.r.points[g.i + 1][1]]);
      });
    }
  }
}

const EPS = 1e-6;

/** Drops repeated points and points in the middle of a straight run, so legs alternate horizontal and vertical. */
export function corners(points: Pt[]): Pt[] {
  const pts: Pt[] = [];
  for (const p of points) {
    const last = pts[pts.length - 1];
    if (last && Math.abs(last[0] - p[0]) < EPS && Math.abs(last[1] - p[1]) < EPS) continue;
    pts.push(p);
  }
  return pts.filter((p, i) => {
    if (i === 0 || i === pts.length - 1) return true;
    const [px, py] = pts[i - 1];
    const [nx, ny] = pts[i + 1];
    return !((Math.abs(px - p[0]) < EPS && Math.abs(nx - p[0]) < EPS) || (Math.abs(py - p[1]) < EPS && Math.abs(ny - p[1]) < EPS));
  });
}

/** A route's shape as hand-placed legs (see ManualLegs). Needs at least two legs. */
export function toManual(points: Pt[]): ManualLegs {
  const pts = corners(points);
  const first = Math.abs(pts[0][1] - pts[1][1]) < EPS ? "h" : "v";
  // Leg k runs from pts[k] to pts[k + 1]; a horizontal leg's place is its y, a vertical one's its x.
  const at = pts.slice(1, -2).map((p, k) => (((k + 1) % 2 === 0) === (first === "h") ? p[1] : p[0]));
  return { first, at };
}

/** Rebuilds a hand-placed shape between two plug ends, wherever they are now. */
export function fromManual(start: Pt, end: Pt, legs: ManualLegs): Pt[] {
  const horizontal = (k: number) => (k % 2 === 0) === (legs.first === "h");
  const m = legs.at.length + 2;
  const place = (k: number) => (k === 0 ? (horizontal(0) ? start[1] : start[0]) : k === m - 1 ? (horizontal(m - 1) ? end[1] : end[0]) : legs.at[k - 1]);
  const pts: Pt[] = [start];
  // The corner between leg k and leg k + 1 sits at the place of both.
  for (let k = 0; k < m - 1; k++) pts.push(horizontal(k) ? [place(k + 1), place(k)] : [place(k), place(k + 1)]);
  pts.push(end);
  return corners(pts);
}

/**
 * Moves leg `k` of a route sideways to `to` (a y for a horizontal leg, an x for a vertical one), keeping it orthogonal.
 * The legs into the plugs keep a short straight `lead` out of the jack and gain a jog, so a cable never leaves a plug sideways.
 */
export function moveLeg(points: Pt[], k: number, to: number, lead = 0.25): Pt[] {
  const pts = corners(points).map((p) => [...p] as Pt);
  const n = pts.length;
  const h = Math.abs(pts[k][1] - pts[k + 1][1]) < EPS;
  const set = (p: Pt): Pt => (h ? [p[0], to] : [to, p[1]]);
  /** A point `lead` along from a toward b. */
  const toward = (a: Pt, b: Pt): Pt => {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const d = Math.min(lead, len / 3);
    return [a[0] + ((b[0] - a[0]) / len) * d, a[1] + ((b[1] - a[1]) / len) * d];
  };
  const head: Pt[] = k === 0 ? [pts[0], toward(pts[0], pts[1])] : pts.slice(0, k);
  const tail: Pt[] = k + 1 === n - 1 ? [toward(pts[n - 1], pts[n - 2]), pts[n - 1]] : pts.slice(k + 2);
  const a = k === 0 ? head[1] : pts[k];
  const b = k + 1 === n - 1 ? tail[0] : pts[k + 1];
  return corners([...head, set(a), set(b), ...tail]);
}
