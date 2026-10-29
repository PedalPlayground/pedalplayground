import { describe, expect, it } from "vitest";
import { FIXTURES } from "./signalFixtures";
import { DESKTOP_METRICS, layoutSignal, PHONE_METRICS, type SignalLayout } from "./signalLayout";

const desktop = { ...DESKTOP_METRICS, maxWidth: 1200 };
const phone = { ...PHONE_METRICS, maxWidth: 375 };
const lay = (name: string, m = desktop) => {
  const doc = FIXTURES[name];
  return layoutSignal(doc.signal!, doc.items, m);
};
const tile = (l: SignalLayout, id: string) => l.tiles.find((t) => t.id === id)!;
const dot = (l: SignalLayout, id: string) => l.junctions.find((j) => j.id === id)!;

function checkGrid(l: SignalLayout) {
  const boxes = [...l.tiles, ...l.junctions.map((j) => ({ id: j.id, x: j.x - 4, y: j.y - 4, w: 8, h: 8 }))];
  for (const a of boxes) {
    for (const b of boxes) {
      if (a === b) continue;
      const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
      expect(overlap, `${a.id} overlaps ${b.id}`).toBe(false);
    }
  }
  for (const w of l.wires) {
    w.points.slice(1).forEach(([x, y], i) => {
      const [px, py] = w.points[i];
      expect(x === px || y === py, `wire ${w.id} has a diagonal`).toBe(true);
    });
  }
  for (const b of boxes) {
    expect(b.x).toBeGreaterThanOrEqual(0);
    expect(b.y + b.h).toBeLessThanOrEqual(l.height);
  }
}

describe("layoutSignal", () => {
  for (const name of Object.keys(FIXTURES)) {
    it(`${name}: a clean grid on desktop and phone`, () => {
      checkGrid(lay(name));
      checkGrid(lay(name, phone));
    });
  }

  it("lays a series chain out in one row, left to right", () => {
    const l = lay("series");
    const xs = ["guitar", "p0", "p1", "p2", "p3", "p4", "amp"].map((id) => tile(l, id));
    expect(new Set(xs.map((t) => t.y + t.h / 2)).size).toBe(1);
    xs.slice(1).forEach((t, i) => expect(t.x).toBeGreaterThan(xs[i].x));
    expect(l.wires.every((w) => !w.wraps)).toBe(true);
  });

  it("wraps a long chain into bands that fit, with the wire carried between them", () => {
    for (const m of [desktop, phone]) {
      const l = lay("long", m);
      const rows = new Set(l.tiles.map((t) => t.y));
      expect(rows.size).toBeGreaterThan(1);
      expect(l.tiles.every((t) => t.x + t.w <= m.maxWidth - m.pad)).toBe(true);
      expect(l.wires.filter((w) => w.wraps).length).toBe(rows.size - 1);
    }
    // At least 3 pedals across on a phone.
    const l = lay("long", phone);
    const firstRowY = Math.min(...l.tiles.map((t) => t.y));
    expect(l.tiles.filter((t) => t.y === firstRowY).length).toBeGreaterThanOrEqual(3);
  });

  it("stacks parallel branches in lanes between a split and a merge", () => {
    const l = lay("parallel");
    expect(tile(l, "drive").x).toBe(tile(l, "fuzz").x);
    expect(tile(l, "fuzz").y).toBeGreaterThan(tile(l, "drive").y);
    expect(dot(l, "s1").x).toBeLessThan(tile(l, "drive").x);
    expect(dot(l, "m1").x).toBeGreaterThan(tile(l, "trem").x + tile(l, "trem").w);
    expect(dot(l, "m1").y).toBe(dot(l, "s1").y);
  });

  it("draws an empty branch as a wire on its own lane", () => {
    const l = lay("dryPath");
    const dry = l.wires.find((w) => w.points.length === 4 && w.points[0][0] === dot(l, "s1").x)!;
    expect(dry.points[1][1]).toBeGreaterThan(dot(l, "s1").y);
  });

  it("hangs branches that don't merge below the main path, ending at their own output or a dead end", () => {
    const l = lay("twoAmps");
    const main = tile(l, "drive").y;
    expect(tile(l, "tuner").y).toBeGreaterThan(main);
    expect(tile(l, "amp2").y).toBeGreaterThan(main);
    expect(l.deadEnds).toHaveLength(1); // the tuner
  });

  it("puts controllers under the pedal they control, with dashed control wires, and spare pedals in the tray", () => {
    const l = lay("controllers");
    expect(tile(l, "exp").kind).toBe("controller");
    expect(tile(l, "exp").y).toBeGreaterThan(tile(l, "wah").y);
    expect(tile(l, "exp").x).toBe(tile(l, "wah").x);
    expect(tile(l, "remote").x).toBe(tile(l, "delay").x);
    expect(l.wires.filter((w) => w.kind === "control")).toHaveLength(3);
    expect(l.tray).toEqual(["spare"]);
  });

  it("marks stereo cables and flags stereo going into a mono input", () => {
    const l = lay("parallel");
    const out = (from: string) => l.wires.find((w) => w.id === FIXTURES.parallel.signal!.cables.find((c) => c.from === from)!.id)!;
    expect(out("drive").channels).toBe("mono");
    expect(out("delay").channels).toBe("stereo");
    expect(out("verb").channels).toBe("stereo");
    expect(l.warnings).toEqual([]);
  });
});

describe("lanes", () => {
  it("puts the second parallel branch in the very next lane", () => {
    const l = lay("parallel");
    expect(tile(l, "fuzz").y - tile(l, "drive").y).toBe(DESKTOP_METRICS.tileH + DESKTOP_METRICS.laneGap);
  });
});
