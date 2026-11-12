import { describe, expect, it } from "vitest";
import { boardCables, connectPlugs, editCable, fromManual, moveLeg, plugRole, routeBoardCables, toManual, unplug, wire, withoutLinks } from "./cables";
import type { Plug } from "./plugs";
import type { Item } from "./types";

const plug = (id: string, side: Plug["side"], at: number): Plug => ({ id, side, at, type: "sp400" });
const pedal = (id: string, x: number, plugs: Plug[], extra: Partial<Item> = {}): Item => ({
  id,
  kind: "pedal",
  label: id,
  image: null,
  width: 2.6,
  height: 5,
  x,
  y: 0,
  rotation: 0,
  flipX: false,
  custom: true,
  color: null,
  plugs,
  ...extra,
});
const io = () => [plug("in", "right", 1), plug("out", "left", 1)];

describe("plugRole", () => {
  it("reads right as input and left as output, on the sides and the top", () => {
    const p = pedal("p", 0, []);
    expect(plugRole(p, plug("a", "right", 1))).toBe("in");
    expect(plugRole(p, plug("a", "left", 1))).toBe("out");
    expect(plugRole(p, plug("a", "top", 2))).toBe("in");
    expect(plugRole(p, plug("a", "top", 0.6))).toBe("out");
    expect(plugRole(p, plug("a", "top", 1.3))).toBe(null);
  });

  it("goes by the pedal's own face, so turning it changes nothing", () => {
    const p = pedal("p", 0, [], { rotation: 180 });
    expect(plugRole(p, plug("a", "right", 1))).toBe("in");
  });
});

describe("boardCables", () => {
  it("runs from an output to an input whichever plug was picked first", () => {
    const items = connectPlugs([pedal("a", 0, io()), pedal("b", 5, io())], { item: "b", plug: "in" }, { item: "a", plug: "out" });
    const [c] = boardCables(items);
    expect(c.from).toEqual({ item: "a", plug: "out" });
    expect(c.to).toEqual({ item: "b", plug: "in" });
  });

  it("falls back to pick order when the plugs don't say", () => {
    const mid = [plug("m", "top", 1.3)];
    const items = connectPlugs([pedal("a", 0, mid), pedal("b", 5, mid)], { item: "b", plug: "m" }, { item: "a", plug: "m" });
    expect(boardCables(items)[0].from.item).toBe("b");
  });

  it("skips cables whose other plug is gone", () => {
    const items = connectPlugs([pedal("a", 0, io()), pedal("b", 5, io())], { item: "a", plug: "out" }, { item: "b", plug: "in" });
    expect(boardCables(items.filter((i) => i.id !== "b"))).toEqual([]);
  });
});

describe("connectPlugs / unplug", () => {
  it("gives each jack one cable, replacing the old one", () => {
    let items = [pedal("a", 0, io()), pedal("b", 5, io()), pedal("c", 10, io())];
    items = connectPlugs(items, { item: "a", plug: "out" }, { item: "b", plug: "in" });
    items = connectPlugs(items, { item: "c", plug: "in" }, { item: "a", plug: "out" });
    const cables = boardCables(items);
    expect(cables).toHaveLength(1);
    expect(cables[0].to.item).toBe("c");
  });

  it("unplugs from either end and leaves other items alone", () => {
    const base = [pedal("a", 0, io()), pedal("b", 5, io()), pedal("c", 10, io())];
    const items = connectPlugs(base, { item: "a", plug: "out" }, { item: "b", plug: "in" });
    const after = unplug(items, [{ item: "b", plug: "in" }]);
    expect(boardCables(after)).toEqual([]);
    expect(after[2]).toBe(items[2]);
  });

  it("copies of plugs carry no cables", () => {
    const items = connectPlugs([pedal("a", 0, io()), pedal("b", 5, io())], { item: "a", plug: "out" }, { item: "b", plug: "in" });
    expect(withoutLinks(items[0].plugs!).some((p) => "link" in p)).toBe(false);
  });
});

describe("routeBoardCables", () => {
  it("spreads cables that share a run side by side", () => {
    // Two pedals wired to two others across a third that blocks the straight line: both detour the same way.
    const top = [plug("t1", "top", 0.6), plug("t2", "top", 2)];
    let items = [pedal("a", 0, top), pedal("b", 8, top)];
    items = connectPlugs(items, { item: "a", plug: "t1" }, { item: "b", plug: "t1" });
    items = connectPlugs(items, { item: "a", plug: "t2" }, { item: "b", plug: "t2" });
    const [r1, r2] = routeBoardCables(items).map((c) => c.route.points);
    const runY = (pts: [number, number][]) => Math.min(...pts.map((p) => p[1]));
    expect(Math.abs(runY(r1) - runY(r2))).toBeGreaterThan(0.1);
  });
});

describe("hand-placed legs", () => {
  const Z: [number, number][] = [
    [0, 0],
    [4, 0],
    [4, 3],
    [9, 3],
  ];

  it("moving a middle run keeps the route orthogonal and the ends fixed", () => {
    const moved = moveLeg(Z, 1, 6);
    expect(moved).toEqual([
      [0, 0],
      [6, 0],
      [6, 3],
      [9, 3],
    ]);
  });

  it("moving a run into a plug adds a jog and keeps a straight lead out of the jack", () => {
    const moved = moveLeg(Z, 0, 1);
    expect(moved[0]).toEqual([0, 0]);
    expect(moved[1]).toEqual([0.25, 0]);
    expect(moved[2]).toEqual([0.25, 1]);
    moved.slice(1).forEach(([x, y], i) => expect(x === moved[i][0] || y === moved[i][1]).toBe(true));
  });

  it("moving an end run adds just one corner at the plug when the cable can leave that way", () => {
    // The plug at (0, 0) points left, the one at (9, 3) right; moving the first run down to y = 1 turns at the plug.
    const moved = moveLeg(Z, 0, 1, 0.25, { start: [-1, 0], end: [1, 0] });
    expect(moved).toEqual([
      [0, 0],
      [0, 1],
      [4, 1],
      [4, 3],
      [9, 3],
    ]);
    // A plug pointing up can't jog down, back into its jack: it keeps the lead.
    const blocked = moveLeg(Z, 0, 1, 0.25, { start: [0, -1], end: [1, 0] });
    expect(blocked[1]).toEqual([0.25, 0]);
  });

  it("round-trips through the stored form, and follows the plugs when they move", () => {
    const legs = toManual(Z);
    expect(legs).toEqual({ first: "h", at: [4] });
    expect(fromManual([0, 0], [9, 3], legs)).toEqual(Z);
    // The far pedal moved down an inch: the middle run stays at x = 4.
    expect(fromManual([0, 0], [9, 4], legs)).toEqual([
      [0, 0],
      [4, 0],
      [4, 4],
      [9, 4],
    ]);
  });

  it("a straight cable can be pulled aside", () => {
    const moved = moveLeg(
      [
        [0, 0],
        [8, 0],
      ],
      0,
      2,
    );
    expect(moved).toEqual([
      [0, 0],
      [0.25, 0],
      [0.25, 2],
      [7.75, 2],
      [7.75, 0],
      [8, 0],
    ]);
    expect(fromManual([0, 0], [8, 0], toManual(moved))).toEqual(moved);
  });

  it("stored shapes draw from the right end when the cable runs toward its stored plug", () => {
    let items = [pedal("a", 0, io()), pedal("b", 6, io())];
    // Stored on b's input; the signal runs a → b.
    items = connectPlugs(items, { item: "b", plug: "in" }, { item: "a", plug: "out" });
    const [auto] = routeBoardCables(items);
    const route = auto.route.points;
    const k = route.findIndex((p, i) => i < route.length - 1 && p[1] === route[i + 1][1]);
    let pts = moveLeg(route, k, 7);
    pts = [...pts].reverse();
    items = items.map((i) => (i.id === "b" ? { ...i, plugs: i.plugs!.map((p) => (p.link ? { ...p, link: { ...p.link, legs: toManual(pts) } } : p)) } : i));
    const [manual] = routeBoardCables(items);
    expect(manual.route.points[0]).toEqual(auto.route.points[0]);
    expect(manual.route.points.some(([, y]) => y === 7)).toBe(true);
  });
});

describe("cable style", () => {
  it("defaults to gray mono and keeps a picked type and color", () => {
    let items = connectPlugs([pedal("a", 0, io()), pedal("b", 5, io())], { item: "a", plug: "out" }, { item: "b", plug: "in" });
    expect(boardCables(items)[0]).toMatchObject({ kind: "mono", color: "#8b9099" });
    items = connectPlugs(items, { item: "a", plug: "out" }, { item: "b", plug: "in" }, { kind: "stereo", color: "#e5484d" });
    expect(boardCables(items)[0]).toMatchObject({ kind: "stereo", color: "#e5484d" });
  });
});

describe("wire", () => {
  it("adds plugs at spot ends and connects them", () => {
    const base = [pedal("a", 0, []), pedal("b", 5, io())];
    const { items, stored } = wire(base, { item: "a", side: "left", at: 1 }, { item: "b", plug: "in" });
    expect(items[0].plugs).toHaveLength(1);
    expect(stored.item).toBe("a");
    const [c] = boardCables(items);
    expect(c.from.item).toBe("a");
    expect(c.to).toEqual({ item: "b", plug: "in" });
  });
});

describe("editCable", () => {
  const wired = () => connectPlugs([pedal("a", 0, io()), pedal("b", 5, io())], { item: "a", plug: "out" }, { item: "b", plug: "in" });
  const types = (items: Item[]) => [items[0].plugs![1].type, items[1].plugs![0].type];

  it("changes both plugs while locked, and one end once split", () => {
    let items = editCable(wired(), { item: "a", plug: "out" }, { plug: { end: { item: "b", plug: "in" }, type: "pancake" } });
    expect(types(items)).toEqual(["pancake", "pancake"]);
    items = editCable(items, { item: "a", plug: "out" }, { split: true });
    items = editCable(items, { item: "a", plug: "out" }, { plug: { end: { item: "b", plug: "in" }, type: "angle" } });
    expect(types(items)).toEqual(["pancake", "angle"]);
    items = editCable(items, { item: "a", plug: "out" }, { split: false });
    expect(types(items)).toEqual(["pancake", "pancake"]);
  });

  it("a power cable takes power plugs and drops jack labels that don't fit", () => {
    let items = editCable(wired(), { item: "a", plug: "out" }, { jack: { end: { item: "a", plug: "out" }, id: "output.mono" } });
    items = editCable(items, { item: "a", plug: "out" }, { kind: "power" });
    expect(types(items)).toEqual(["barrel", "barrel"]);
    expect(items[0].plugs![1].jack).toBeUndefined();
    expect(boardCables(items)[0].kind).toBe("power");
  });

  it("labels the other end to match, and the labels set the direction", () => {
    // Labeled against where the plugs sit: b's right-side jack is the output.
    let items = connectPlugs([pedal("a", 0, io()), pedal("b", 5, io())], { item: "a", plug: "in" }, { item: "b", plug: "in" }, { kind: "stereo" });
    items = editCable(items, { item: "a", plug: "in" }, { jack: { end: { item: "b", plug: "in" }, id: "output.stereo.trs" } });
    expect(items[0].plugs![0].jack).toBe("input.stereo.trs");
    expect(boardCables(items)[0].from.item).toBe("b");
  });
});
