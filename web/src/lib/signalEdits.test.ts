import { describe, expect, it } from "vitest";
import { addItemNode, connect, defaultSignal, insertOnCable, setIo, SignalError, type SignalGraph } from "./signal";
import {
  addOutputBeside,
  appendToChain,
  autoArrange,
  backToSeries,
  mergeAhead,
  moveAlong,
  moveToParallel,
  parallelOnCable,
  parallelTo,
  toggleControl,
} from "./signalEdits";
import { fixturePedal } from "./signalFixtures";

/** "guitar>a>b>amp" style list of audio cables, sorted, with junctions named by type. */
function wiring(g: SignalGraph) {
  const name = (id: string) => {
    const n = g.nodes.find((x) => x.id === id)!;
    return n.type === "source" || n.type === "destination" ? n.label.toLowerCase().replace(" ", "") : n.type === "item" ? n.id : n.type;
  };
  return g.cables
    .filter((c) => c.kind === "audio")
    .map((c) => `${name(c.from)}>${name(c.to)}`)
    .sort();
}

const chain = (...ids: string[]) => ids.reduce((g, id) => appendToChain(g, id), defaultSignal());

describe("appendToChain", () => {
  it("adds pedals in order before the amp", () => {
    expect(wiring(chain("a", "b"))).toEqual(["a>b", "b>amp", "guitar>a"]);
  });
  it("moves a pedal already in the chain to the end", () => {
    expect(wiring(appendToChain(chain("a", "b", "c"), "a"))).toEqual(["a>amp", "b>c", "c>a", "guitar>b"]);
  });
});

describe("parallel paths", () => {
  it("parallelTo puts a pedal beside another between a split and a merge", () => {
    const g = parallelTo(chain("a", "b", "c"), "b", "x");
    expect(wiring(g)).toEqual(["a>split", "b>merge", "c>amp", "guitar>a", "merge>c", "split>b", "split>x", "x>merge"]);
    expect(mergeAhead(g, "x")).toBeDefined();
  });

  it("a third pedal beside a lone branch pedal joins the same group", () => {
    let g = parallelTo(chain("a", "b"), "a", "x");
    g = parallelTo(addItemNode(g, "y"), "x", "y");
    expect(g.nodes.filter((n) => n.type === "split")).toHaveLength(1);
    expect(wiring(g).filter((w) => w.startsWith("split>"))).toEqual(["split>a", "split>x", "split>y"]);
  });

  it("moveToParallel leaves a clean path beside the pedal, and backToSeries undoes it", () => {
    const start = chain("a", "b", "c");
    const g = moveToParallel(start, "b");
    expect(wiring(g)).toEqual(["a>split", "b>merge", "c>amp", "guitar>a", "merge>c", "split>b", "split>merge"]);
    expect(() => moveToParallel(g, "b")).toThrow(SignalError);
    expect(wiring(backToSeries(g, "b"))).toEqual(["a>b", "b>c", "c>amp", "guitar>a"]);
  });

  it("backToSeries from a group of three keeps the other two in parallel", () => {
    let g = parallelTo(chain("a", "b"), "a", "x");
    g = parallelTo(addItemNode(g, "y"), "x", "y");
    g = backToSeries(g, "y");
    expect(wiring(g)).toEqual(["a>merge", "b>amp", "guitar>split", "merge>y", "split>a", "split>x", "x>merge", "y>b"]);
  });

  it("parallelOnCable adds a branch to an empty path", () => {
    const g = moveToParallel(chain("a", "b"), "a");
    const dry = g.cables.find((c) => g.nodes.find((n) => n.id === c.from)?.type === "split" && g.nodes.find((n) => n.id === c.to)?.type === "merge")!;
    const h = parallelOnCable(g, dry.id, "x");
    expect(wiring(h)).toContain("split>x");
    expect(wiring(h)).toContain("split>merge");
  });
});

describe("moveAlong", () => {
  it("swaps with the neighbour", () => {
    expect(wiring(moveAlong(chain("a", "b", "c"), "c", -1))).toEqual(["a>c", "b>amp", "c>b", "guitar>a"]);
    expect(wiring(moveAlong(chain("a", "b", "c"), "a", 1))).toEqual(["a>c", "b>a", "c>amp", "guitar>b"]);
  });
  it("stops at the ends", () => {
    expect(() => moveAlong(chain("a", "b"), "a", -1)).toThrow(SignalError);
    expect(() => moveAlong(chain("a", "b"), "b", 1)).toThrow(SignalError);
  });
  it("keeps the pedal's stereo settings and controllers when it moves", () => {
    let g = channelsSet(chain("a", "b"));
    g = addItemNode(g, "exp");
    g = setIo(g, "exp", { control: "exp" });
    g = toggleControl(g, "exp", "a");
    g = moveAlong(g, "a", 1);
    expect(g.nodes.find((n) => n.id === "a")).toMatchObject({ io: { outChannels: "stereo" } });
    expect(g.cables.some((c) => c.kind === "control" && c.to === "a")).toBe(true);
  });
});

const channelsSet = (g: SignalGraph) => setIo(g, "a", { outChannels: "stereo" });

describe("outputs", () => {
  it("adds a second amp from a split before the first", () => {
    const start = chain("a");
    const g = addOutputBeside(start, defaultIds(start).amp, "Amp 2");
    expect(wiring(g)).toEqual(["a>split", "guitar>a", "split>amp", "split>amp2"]);
  });
});

const defaultIds = (g: SignalGraph) => ({ amp: g.nodes.find((n) => n.type === "destination")!.id });

describe("toggleControl", () => {
  it("connects and disconnects a controller", () => {
    let g = setIo(addItemNode(chain("a"), "exp"), "exp", { control: "exp" });
    g = toggleControl(g, "exp", "a");
    expect(g.cables.filter((c) => c.kind === "control")).toHaveLength(1);
    g = toggleControl(g, "exp", "a");
    expect(g.cables.filter((c) => c.kind === "control")).toHaveLength(0);
  });
});

describe("autoArrange", () => {
  it("chains the board's pedals from right to left and keeps controllers", () => {
    const items = [fixturePedal("left", "Left", 0), fixturePedal("mid", "Mid", 1), fixturePedal("right", "Right", 2), fixturePedal("exp", "Exp", 3)];
    let g = setIo(addItemNode(defaultSignal(), "exp"), "exp", { control: "exp" });
    g = insertOnCable(addItemNode(g, "left"), g.cables[0].id, "left");
    g = connect(g, "exp", "left", "control");
    const arranged = autoArrange(g, items);
    expect(wiring(arranged)).toEqual(["guitar>right", "left>amp", "mid>left", "right>mid"]);
    expect(arranged.cables.filter((c) => c.kind === "control")).toHaveLength(1);
  });
});
