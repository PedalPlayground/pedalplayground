import { describe, expect, it } from "vitest";
import { boardCables, connectPlugs, plugRole, routeBoardCables, unplug, withoutLinks } from "./cables";
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
