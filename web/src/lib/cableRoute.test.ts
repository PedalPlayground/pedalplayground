import { describe, expect, it } from "vitest";
import { plugAnchor, roundedPath, routeCable, toLocal, type CableRoute } from "./cableRoute";
import { plugBox, type Plug } from "./plugs";
import type { Item } from "./types";

const pedal = (id: string, x: number, y: number, w = 2.6, h = 5.1, extra: Partial<Item> = {}): Item => ({
  id,
  kind: "pedal",
  label: id,
  image: null,
  width: w,
  height: h,
  x,
  y,
  rotation: 0,
  flipX: false,
  custom: true,
  color: null,
  ...extra,
});
const plug = (side: Plug["side"], at: number): Plug => ({ id: `${side}${at}`, side, at, type: "sp400" });
const OUT = plugBox("sp400").out;

function checkOrthogonal(r: CableRoute) {
  r.points.slice(1).forEach(([x, y], i) => {
    const [px, py] = r.points[i];
    expect(Math.abs(x - px) < 1e-6 || Math.abs(y - py) < 1e-6, "diagonal leg").toBe(true);
  });
  expect(r.under.length).toBe(r.points.length - 1);
}

describe("plugAnchor", () => {
  it("puts the cable end past the plug head, pointing out of the edge", () => {
    const a = plugAnchor(pedal("p", 0, 0), plug("right", 1));
    expect(a.at[0]).toBeCloseTo(2.6 + OUT);
    expect(a.at[1]).toBeCloseTo(1);
    expect(a.dir).toEqual([1, 0]);
  });

  it("follows the pedal's rotation and flip", () => {
    // Turned 90° clockwise, the top edge faces right.
    const turned = plugAnchor(pedal("p", 0, 0, 2, 4, { rotation: 90 }), plug("top", 1));
    expect(turned.dir).toEqual([1, 0]);
    // The box is 4 wide and 2 tall once turned, centered on (1, 2): its right edge is at x = 3.
    expect(turned.at[0]).toBeCloseTo(3 + OUT);
    expect(turned.at[1]).toBeCloseTo(2);
    // Flipped, a left jack sits on the right.
    const flipped = plugAnchor(pedal("p", 0, 0, 2, 4, { flipX: true }), plug("left", 1));
    expect(flipped.dir).toEqual([1, 0]);
    expect(flipped.at[0]).toBeCloseTo(2 + OUT);
  });
});

describe("toLocal", () => {
  it("undoes rotation and flip", () => {
    for (const rotation of [0, 90, 180, 270] as const) {
      for (const flipX of [false, true]) {
        const p = pedal("p", 3, 1, 2, 4, { rotation, flipX });
        const a = plugAnchor(p, { id: "x", side: "left", at: 1, type: "sp400" });
        const [x, y] = toLocal(p, a.at);
        expect(x).toBeCloseTo(-OUT);
        expect(y).toBeCloseTo(1);
      }
    }
  });
});

describe("routeCable", () => {
  it("runs straight between two facing jacks at the same height", () => {
    const a = pedal("a", 0, 0);
    const b = pedal("b", 6, 0);
    const r = routeCable(plugAnchor(a, plug("right", 2)), plugAnchor(b, plug("left", 2)), [a, b]);
    checkOrthogonal(r);
    expect(r.points.length).toBe(2);
    expect(r.under.every((u) => !u)).toBe(true);
  });

  it("goes around a pedal in the way instead of under it", () => {
    const a = pedal("a", 0, 0);
    const mid = pedal("mid", 4, -1, 2.6, 7);
    const b = pedal("b", 9, 0);
    const r = routeCable(plugAnchor(a, plug("right", 2)), plugAnchor(b, plug("left", 2)), [a, mid, b]);
    checkOrthogonal(r);
    expect(r.under.some(Boolean)).toBe(false);
    // It has to leave the jack's line to get past.
    expect(r.points.some(([, y]) => y < -1 || y > 6)).toBe(true);
  });

  it("joins top jacks with one straight run across their ends", () => {
    const a = pedal("a", 0, 0);
    const b = pedal("b", 4, 0);
    const r = routeCable(plugAnchor(a, plug("top", 1.3)), plugAnchor(b, plug("top", 1.3)), [a, b]);
    checkOrthogonal(r);
    expect(r.points.length).toBe(2);
    expect(r.under.some(Boolean)).toBe(false);
  });

  it("still finds a route when there's no gap, and marks the legs under pedals", () => {
    const a = pedal("a", 0, 0);
    // A wall of gear with no way around in the search area: the cable has to cross it.
    const wall = pedal("wall", 3.5, -40, 1, 90);
    const b = pedal("b", 6, 0);
    const r = routeCable(plugAnchor(a, plug("right", 2)), plugAnchor(b, plug("left", 2)), [a, wall, b]);
    checkOrthogonal(r);
    expect(r.under.some(Boolean)).toBe(true);
  });
});

it("leaves a plug sideways rather than adding corners", () => {
  // A right jack and a bottom jack below it: one corner, turning at the right jack's end.
  const a = pedal("a", 0, 0);
  const b = pedal("b", 6, 8);
  const r = routeCable(plugAnchor(a, plug("right", 2)), plugAnchor(b, plug("bottom", 1)), [a, b]);
  checkOrthogonal(r);
  expect(r.points.length).toBeLessThanOrEqual(4);
  expect(r.under.some(Boolean)).toBe(false);
});

describe("roundedPath", () => {
  it("rounds corners without overshooting short legs", () => {
    const d = roundedPath(
      [
        [0, 0],
        [4, 0],
        [4, 0.2],
        [8, 0.2],
      ],
      0.25,
    );
    expect(d.startsWith("M0 0")).toBe(true);
    expect(d).toContain("Q4 0 4 0.1");
    expect(d.endsWith("L8 0.2")).toBe(true);
  });
});
