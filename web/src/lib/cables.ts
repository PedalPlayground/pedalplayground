/**
 * Cables on the playground: which plug is wired to which. A cable is stored on one of its two plugs (`Plug.link`), so
 * it moves, saves and undoes with the items. This file turns those links into a plain list of cables with a signal
 * direction, for the board drawing and, later, the signal flow map. Pure functions, no React.
 */
import { ROUTE_DEFAULTS, busyLegs, cableEnd, plugHead, routeCable, type BusyLeg, type CableRoute, type PlugAnchor, type RouteOptions } from "./cableRoute";
import { cableKind, newPlugId, type CableKind, type ManualLegs, type Plug, type PlugEnd, type PlugLink, type PlugSide, type PlugType } from "./plugs";
import type { Pt } from "./cableRoute";
import type { Item } from "./types";

export interface CableKindInfo {
  kind: CableKind;
  label: string;
  /** Every cable is one solid line in its type's color. */
  color: string;
  /** Line width, as a share of an audio cable's. */
  width: number;
  /** The plugs this kind of cable comes with; the first is what new plugs get. */
  plugs: PlugType[];
}

const QUARTER: PlugType[] = ["sp400", "angle", "pancake"];

/** Gray for audio and control cables, red for power. */
const GRAY = "#8b9099";
const RED = "#e5484d";

/** Cable types and how each draws: one solid line, gray, or red and thinner for power. */
export const CABLE_KINDS: CableKindInfo[] = [
  { kind: "audio", label: "Audio", color: GRAY, width: 1, plugs: [...QUARTER, "mini"] },
  { kind: "power", label: "Power", color: RED, width: 0.5, plugs: ["barrel"] },
  { kind: "other", label: "Other", color: GRAY, width: 1, plugs: [...QUARTER, "mini", "barrel", "din"] },
];
export const cableKindInfo = (k: string | undefined) => CABLE_KINDS.find((c) => c.kind === cableKind(k))!;

/** A cable's type, and for a new cable, the plugs it gets (the type's usual one if it doesn't take this one). */
export type CableStyle = Pick<PlugLink, "kind"> & { plug?: PlugType };

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
  kind: CableKind;
  color: string;
}

export const sameEnd = (a: PlugEnd, b: PlugEnd) => a.item === b.item && a.plug === b.plug;
export const cableId = (end: PlugEnd) => `${end.item}:${end.plug}`;

/** Where the plug sits across the pedal's own face, 0 at its left edge to 1 at its right, whatever its rotation. */
function across(item: Item, plug: Plug) {
  const x = plug.side === "right" ? item.width : plug.side === "left" ? 0 : plug.at;
  return x / item.width;
}

/** What new plugs on this kind of cable are. */
export const defaultPlugFor = (kind: string | undefined) => cableKindInfo(kind).plugs[0];

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
        kind: cableKind(plug.link.kind),
        color: cableKindInfo(plug.link.kind).color,
        ...(plug.link.legs ? { legs: plug.link.legs } : {}),
      });
    }
  }
  return out;
}

/** A cable end while wiring: a plug that's already there, or a spot on a pedal's edge to add one. */
export type WireEnd = PlugEnd | { item: string; side: PlugSide; at: number };
export const isPlugEnd = (e: WireEnd): e is PlugEnd => "plug" in e;

/**
 * Runs a cable between two ends, adding a plug (the default type) at any end that's just a spot on an edge. Returns
 * the items and the stored end (the first one), whose id names the cable.
 */
export function wire(items: Item[], a: WireEnd, b: WireEnd, style: CableStyle = {}): { items: Item[]; stored: PlugEnd } {
  let next = items;
  const place = (e: WireEnd): PlugEnd => {
    if (isPlugEnd(e)) return e;
    const id = newPlugId();
    next = next.map((i) => (i.id === e.item ? { ...i, plugs: [...(i.plugs ?? []), { id, side: e.side, at: e.at, type: style.plug && cableKindInfo(style.kind).plugs.includes(style.plug) ? style.plug : defaultPlugFor(style.kind) }] } : i));
    return { item: e.item, plug: id };
  };
  const pa = place(a);
  const pb = place(b);
  return { items: connectPlugs(next, pa, pb, style), stored: pa };
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

/**
 * Takes out every cable on these plugs, with the plugs at both its ends: a cable and its plugs are one unit. Plugs in
 * `keep` stay (unwired). Unchanged items keep their identity.
 */
export function removeCables(items: Item[], ends: PlugEnd[], keep: PlugEnd[] = []): Item[] {
  const gone = boardCables(items).filter((c) => ends.some((e) => sameEnd(e, c.from) || sameEnd(e, c.to)));
  if (!gone.length) return items;
  const drop = gone.flatMap((c) => [c.from, c.to]).filter((e) => !keep.some((k) => sameEnd(k, e)));
  const unwired = unplug(items, gone.map((c) => c.stored));
  return unwired.map((i) =>
    i.plugs && drop.some((d) => d.item === i.id) ? { ...i, plugs: i.plugs.filter((p) => !drop.some((d) => sameEnd(d, { item: i.id, plug: p.id }))) } : i,
  );
}

/** Wires two plugs together. A jack takes one cable, so any cable already on either plug comes out first (with its far plug). */
export function connectPlugs(items: Item[], a: PlugEnd, b: PlugEnd, style: CableStyle = {}): Item[] {
  if (sameEnd(a, b)) return items;
  const link: PlugLink = { item: b.item, plug: b.plug, ...(style.kind && style.kind !== "audio" ? { kind: style.kind } : {}) };
  return removeCables(items, [a, b], [a, b]).map((i) => (i.id === a.item && i.plugs ? { ...i, plugs: i.plugs.map((p) => (p.id === a.plug ? { ...p, link } : p)) } : i));
}

/** A change to one cable from its menu: its type, or the ends' plugs. */
export interface CableEdit {
  kind?: CableKind;
  /** Set the two ends' plug types apart (true) or lock them together again (false: both take the stored end's). */
  split?: boolean;
  /** One end's plug type; both ends' while they're locked together. */
  plug?: { end: PlugEnd; type: PlugType };
}

/**
 * Applies a menu change to the cable stored on `stored`. A new type swaps out plugs it doesn't take.
 * Returns the items unchanged if the cable isn't there.
 */
export function editCable(items: Item[], stored: PlugEnd, edit: CableEdit): Item[] {
  const host = items.find((i) => i.id === stored.item)?.plugs?.find((p) => p.id === stored.plug);
  const link = host?.link;
  if (!host || !link) return items;
  const other: PlugEnd = { item: link.item, plug: link.plug };
  const far = items.find((i) => i.id === other.item)?.plugs?.find((p) => p.id === other.plug);
  if (!far) return items;
  const kind = edit.kind ?? cableKind(link.kind);
  const allowed = cableKindInfo(kind).plugs;
  const split = edit.split ?? !!link.split;

  // Work out each end's new plug fields, then write them.
  const ends = [
    { end: stored, plug: host },
    { end: other, plug: far },
  ].map(({ end, plug }) => ({ end, type: plug.type }));
  const [a, b] = ends;
  if (edit.plug) {
    for (const e of ends) if (!split || sameEnd(e.end, edit.plug.end)) e.type = edit.plug.type;
  }
  if (edit.split === false) b.type = a.type;
  for (const e of ends) if (!allowed.includes(e.type)) e.type = !split && allowed.includes(a.type) ? a.type : allowed[0];

  const newLink: PlugLink = { ...link };
  if (edit.kind) {
    if (edit.kind === "audio") delete newLink.kind;
    else newLink.kind = edit.kind;
  }
  // Colors come from the type now; drop any picked before.
  delete newLink.color;
  if (split) newLink.split = true;
  else delete newLink.split;

  return items.map((i) => {
    const mine = ends.filter((e) => e.end.item === i.id);
    if (!mine.length || !i.plugs) return i;
    return {
      ...i,
      plugs: i.plugs.map((p) => {
        const e = mine.find((x) => x.end.plug === p.id);
        if (!e) return p;
        const { jack: _, ...rest } = p;
        const next: Plug = { ...rest, type: e.type };
        if (sameEnd(e.end, stored)) next.link = newLink;
        return next;
      }),
    };
  });
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
export function routeBoardCables(
  items: Item[],
  opts: Partial<RouteOptions> & {
    spacing?: number;
    /** Routes to keep as they are for automatic cables, by cable id (nothing they go around has moved). */
    reuse?: Map<string, CableRoute>;
    /** A rough, fast pass (while gear is dragged): one routing each, not around the other cables, not spread apart. */
    quick?: boolean;
  } = {},
): RoutedCable[] {
  const byId = new Map(items.map((i) => [i.id, i]));
  const pedals = items.filter((i) => i.kind === "pedal");
  const boards = items.filter((i) => i.kind === "pedalboard");
  const anchor = (e: PlugEnd): PlugAnchor => {
    const item = byId.get(e.item)!;
    return cableEnd(item, item.plugs!.find((p) => p.id === e.plug)!);
  };
  // Every plug's head, so cables don't run over other plugs.
  const heads = pedals.flatMap((i) => (i.plugs ?? []).map((p) => ({ id: cableId({ item: i.id, plug: p.id }), box: plugHead(i, p) })));
  const cables = boardCables(items);
  const auto = (c: BoardCable, busy: BusyLeg[]) => {
    const others = heads.filter((h) => h.id !== cableId(c.from) && h.id !== cableId(c.to)).map((h) => h.box);
    return routeCable(anchor(c.from), anchor(c.to), pedals, { ...opts, lane: opts.spacing ?? ROUTE_DEFAULTS.lane }, boards, others, busy);
  };
  const routed: RoutedCable[] = cables.map((c) => {
    if (!c.legs) return { ...c, route: { points: [], under: [] } };
    // A hand-placed shape is stored from the stored plug's end; draw it from `from` like the rest.
    const reversed = c.from !== c.stored;
    const pts = fromManual(anchor(c.stored).at, anchor(reversed ? c.from : c.to).at, c.legs);
    if (reversed) pts.reverse();
    return { ...c, route: { points: pts, under: pts.slice(1).map(() => false) } };
  });
  // Automatic cables keep out of each other's way: each is routed beside the ones already placed, then each again
  // beside all the others, so an early cable can make room for a later one.
  const legsOf = (skip: RoutedCable) => routed.filter((r) => r !== skip && r.route.points.length).flatMap((r) => busyLegs(r.route.points));
  const fresh: RoutedCable[] = [];
  for (const r of routed) {
    if (r.legs) continue;
    const kept = opts.reuse?.get(r.id);
    if (kept) r.route = kept;
    else fresh.push(r);
  }
  if (!fresh.length) return routed;
  for (let pass = 0; pass < (opts.quick ? 1 : 2); pass++) for (const r of fresh) r.route = auto(r, opts.quick ? [] : legsOf(r));
  // Hand-placed cables stay exactly where they were put; only automatic ones step aside.
  if (!opts.quick) separate(fresh.map((r) => r.route), opts.spacing ?? 0.2);
  return routed;
}

/**
 * Cables that share a run would draw as one. This spreads overlapping legs side by side, `spacing` apart, centered on
 * the shared line. Moving a leg sideways only stretches its neighbours, so every route stays orthogonal; a leg that
 * ends at a plug gets a short jog there, so the plug end stays put. Changes the routes in place.
 */
export function separate(routes: CableRoute[], spacing: number) {
  for (const axis of [0, 1] as const) {
    // A horizontal leg (axis 0) runs along x at a fixed y; a vertical one along y at a fixed x.
    const fixed = axis === 0 ? 1 : 0;
    type Leg = { r: CableRoute; i: number; at: number; lo: number; hi: number };
    const legs: Leg[] = [];
    for (const r of routes) {
      for (let i = 0; i < r.points.length - 1; i++) {
        const p = r.points[i];
        const q = r.points[i + 1];
        if (Math.abs(p[fixed] - q[fixed]) > 1e-6) continue;
        legs.push({ r, i, at: p[fixed], lo: Math.min(p[axis], q[axis]), hi: Math.max(p[axis], q[axis]) });
      }
    }
    // Group legs on the same line whose spans overlap, then fan each group out.
    const seen = new Set<Leg>();
    const moves: { leg: Leg; shift: number }[] = [];
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
      const from = (g: Leg) => g.r.points[g.i > 0 ? g.i - 1 : g.i + 1][fixed];
      group.sort((a, b) => from(a) - from(b));
      group.forEach((g, n) => moves.push({ leg: g, shift: (n - (group.length - 1) / 2) * spacing }));
    }
    // Apply from the last leg of each route back, so adding a jog doesn't renumber legs still to move.
    moves.sort((a, b) => b.leg.i - a.leg.i);
    for (const { leg, shift } of moves) {
      const pts = leg.r.points;
      let i = leg.i;
      // The jogs at the plugs are new legs of their own, out in the open.
      if (i + 1 === pts.length - 1) {
        pts.push([...pts[i + 1]] as Pt);
        leg.r.under.push(false);
      }
      if (i === 0) {
        pts.unshift([...pts[0]] as Pt);
        leg.r.under.unshift(false);
        i = 1;
      }
      for (const j of [i, i + 1]) pts[j] = axis === 0 ? [pts[j][0], leg.at + shift] : [leg.at + shift, pts[j][1]];
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
 * Moving a leg into a plug adds one corner at the plug, as long as that doesn't send the cable back into the jack;
 * then it keeps a short straight `lead` out of the plug first. `plugs` gives the way each end's plug points; without
 * it, every moved end leg gets the lead.
 */
export function moveLeg(points: Pt[], k: number, to: number, lead = 0.25, plugs?: { start: Pt; end: Pt }): Pt[] {
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
  /** Whether a jog straight from plug end `p` to the moved line would head back into its jack (`dir` points out of it). */
  const intoJack = (p: Pt, dir: Pt | undefined) => {
    if (!dir) return true;
    const q = set(p);
    const [dx, dy] = [Math.sign(q[0] - p[0]), Math.sign(q[1] - p[1])];
    return dx === -Math.sign(dir[0]) && dy === -Math.sign(dir[1]);
  };
  const leadStart = k === 0 && intoJack(pts[0], plugs?.start);
  const leadEnd = k + 1 === n - 1 && intoJack(pts[n - 1], plugs?.end);
  const head: Pt[] = k === 0 ? (leadStart ? [pts[0], toward(pts[0], pts[1])] : [pts[0]]) : pts.slice(0, k);
  const tail: Pt[] = k + 1 === n - 1 ? (leadEnd ? [toward(pts[n - 1], pts[n - 2]), pts[n - 1]] : [pts[n - 1]]) : pts.slice(k + 2);
  const a = k === 0 ? head[head.length - 1] : pts[k];
  const b = k + 1 === n - 1 ? tail[0] : pts[k + 1];
  return corners([...head, set(a), set(b), ...tail]);
}
