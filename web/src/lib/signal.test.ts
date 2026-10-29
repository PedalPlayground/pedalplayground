import { describe, expect, it } from "vitest";
import {
  addItemNode,
  cableChannels,
  channelsFromHere,
  connect,
  defaultSignal,
  disconnect,
  insertOnCable,
  normalizeSignal,
  removeItems,
  setIo,
  SignalError,
  stereoIntoMono,
  type SignalGraph,
} from "./signal";
import type { Item } from "./types";

const pedal = (id: string): Item => ({
  id,
  kind: "pedal",
  label: id,
  image: null,
  width: 3,
  height: 5,
  x: 0,
  y: 0,
  rotation: 0,
  flipX: false,
  custom: true,
  color: null,
});

const ends = (g: SignalGraph) => ({
  guitar: g.nodes.find((n) => n.type === "source")!.id,
  amp: g.nodes.find((n) => n.type === "destination")!.id,
});

/** "guitar>a>b>amp": the audio cables, named, in a stable order. */
function wiring(g: SignalGraph) {
  const name = (id: string) => {
    const n = g.nodes.find((x) => x.id === id)!;
    return n.type === "source" || n.type === "destination" ? n.label.toLowerCase() : n.type === "item" ? n.id : n.type;
  };
  return g.cables
    .filter((c) => c.kind === "audio")
    .map((c) => `${name(c.from)}>${name(c.to)}`)
    .sort();
}

/** Guitar → a → b → c → Amp. */
function series(...ids: string[]) {
  let g = defaultSignal();
  for (const id of ids) {
    const into = g.cables.find((c) => c.to === ends(g).amp)!;
    g = insertOnCable(g, into.id, id);
  }
  return g;
}

describe("defaultSignal", () => {
  it("plugs the guitar straight into the amp", () => {
    expect(wiring(defaultSignal())).toEqual(["guitar>amp"]);
  });
});

describe("insertOnCable", () => {
  it("builds a series chain", () => {
    expect(wiring(series("a", "b"))).toEqual(["a>b", "b>amp", "guitar>a"]);
  });

  it("moves a pedal that is already in the chain", () => {
    let g = series("a", "b", "c");
    const guitarToA = g.cables.find((c) => c.from === ends(g).guitar)!;
    g = insertOnCable(g, guitarToA.id, "c");
    expect(wiring(g)).toEqual(["a>b", "b>amp", "c>a", "guitar>c"]);
  });
});

describe("connect", () => {
  it("refuses a loop", () => {
    const g = series("a", "b");
    const cut = disconnect(g, g.cables.find((c) => c.from === "b")!.id);
    expect(() => connect(cut, "b", "a")).toThrow(SignalError);
  });

  it("refuses a second cable out of one pedal output", () => {
    const g = addItemNode(series("a"), "x");
    expect(() => connect(g, "a", "x")).toThrow(/split/);
  });

  it("lets a split feed two paths that a merge joins again", () => {
    let g = addItemNode(addItemNode(defaultSignal(), "dry"), "wet");
    const { guitar, amp } = ends(g);
    g = disconnect(g, g.cables[0].id);
    g = { ...g, nodes: [...g.nodes, { id: "s", type: "split" }, { id: "m", type: "merge" }] };
    for (const [from, to] of [
      [guitar, "s"],
      ["s", "dry"],
      ["s", "wet"],
      ["dry", "m"],
      ["wet", "m"],
      ["m", amp],
    ]) {
      g = connect(g, from, to);
    }
    expect(wiring(g)).toEqual(["dry>merge", "guitar>split", "merge>amp", "split>dry", "split>wet", "wet>merge"]);
  });

  it("only lets controllers send control cables, and only to pedals", () => {
    let g = addItemNode(series("a"), "exp");
    expect(() => connect(g, "exp", "a", "control")).toThrow(SignalError);
    g = setIo(g, "exp", { control: "exp" });
    g = connect(g, "exp", "a", "control");
    expect(g.cables.filter((c) => c.kind === "control")).toHaveLength(1);
    expect(() => connect(g, "exp", ends(g).amp, "control")).toThrow(SignalError);
    expect(() => connect(g, "exp", "a")).toThrow(/audio/);
  });
});

describe("removeItems", () => {
  it("heals the chain around a deleted pedal", () => {
    expect(wiring(removeItems(series("a", "b", "c"), ["b"]))).toEqual(["a>c", "c>amp", "guitar>a"]);
  });

  it("removes a split that only has one branch left, joining what was either side", () => {
    let g = addItemNode(addItemNode(defaultSignal(), "dry"), "wet");
    const { guitar, amp } = ends(g);
    g = disconnect(g, g.cables[0].id);
    g = { ...g, nodes: [...g.nodes, { id: "s", type: "split" }, { id: "m", type: "merge" }] };
    for (const [from, to] of [
      [guitar, "s"],
      ["s", "dry"],
      ["s", "wet"],
      ["dry", "m"],
      ["wet", "m"],
      ["m", amp],
    ]) {
      g = connect(g, from, to);
    }
    expect(wiring(removeItems(g, ["wet"]))).toEqual(["dry>amp", "guitar>dry"]);
  });

  it("leaves a controller unattached when its pedal is deleted", () => {
    let g = addItemNode(series("a"), "exp");
    g = connect(setIo(g, "exp", { control: "exp" }), "exp", "a", "control");
    g = removeItems(g, ["a"]);
    expect(g.nodes.some((n) => n.id === "exp")).toBe(true);
    expect(g.cables.filter((c) => c.kind === "control")).toHaveLength(0);
    expect(wiring(g)).toEqual(["guitar>amp"]);
  });
});

describe("stereo", () => {
  it("is mono until the user says otherwise", () => {
    const g = series("a", "b");
    expect(g.cables.every((c) => cableChannels(g, c) === "mono")).toBe(true);
  });

  it("Stereo From Here makes everything after the pedal stereo, and flags the mono amp", () => {
    const g = channelsFromHere(series("drive", "delay", "reverb"), "delay", "stereo");
    const ch = (from: string) => cableChannels(g, g.cables.find((c) => c.from === from)!);
    expect(ch("drive")).toBe("mono");
    expect(ch("delay")).toBe("stereo");
    expect(ch("reverb")).toBe("mono"); // the amp is still mono
    expect(stereoIntoMono(g).map((c) => c.from)).toEqual(["reverb"]);

    const stereoAmp = setIo(g, ends(g).amp, { inChannels: "stereo" });
    expect(cableChannels(stereoAmp, stereoAmp.cables.find((c) => c.from === "reverb")!)).toBe("stereo");
    expect(stereoIntoMono(stereoAmp)).toEqual([]);
  });

  it("Mono From Here undoes it", () => {
    let g = channelsFromHere(series("a", "b"), "a", "stereo");
    g = channelsFromHere(g, "a", "mono");
    expect(g.nodes.every((n) => n.type !== "item" || !n.io)).toBe(true);
  });
});

describe("setIo", () => {
  it("takes a pedal out of the audio path when it becomes a controller", () => {
    const g = setIo(series("a", "b", "c"), "b", { control: "exp" });
    expect(wiring(g)).toEqual(["a>c", "c>amp", "guitar>a"]);
    expect(g.nodes.find((n) => n.id === "b")).toMatchObject({ io: { control: "exp" } });
  });
});

describe("normalizeSignal", () => {
  it("gives old documents the default chain", () => {
    expect(wiring(normalizeSignal(undefined, []))).toEqual(["guitar>amp"]);
  });

  it("drops pedals that are no longer on the playground and heals around them", () => {
    const g = series("a", "b");
    const n = normalizeSignal(g, [pedal("a")]);
    expect(n.nodes.some((x) => x.id === "b")).toBe(false);
    expect(wiring(n)).toEqual(["a>amp", "guitar>a"]);
  });
});
