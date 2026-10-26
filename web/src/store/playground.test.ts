import { beforeEach, describe, expect, it } from "vitest";
import { addItemNode, connect, defaultSignal, insertOnCable } from "../lib/signal";
import { usePlayground } from "./playground";

const store = () => usePlayground.getState();
const custom = (label: string) => store().addCustomItem({ kind: "pedal", label, width: 3, height: 5, color: "#333333" });
const idOf = (label: string) => store().items.find((i) => i.label === label)!.id;
const intoAmp = () => {
  const amp = store().signal.nodes.find((n) => n.type === "destination")!.id;
  return store().signal.cables.find((c) => c.to === amp)!.id;
};

beforeEach(() => {
  usePlayground.setState({ items: [], signal: defaultSignal(), past: [], future: [], selected: [] });
});

describe("signal path in the playground store", () => {
  it("undoes and redoes signal edits in the same history as item edits", () => {
    custom("Drive");
    const drive = idOf("Drive");
    const before = store().signal;
    expect(store().editSignal((g) => insertOnCable(g, intoAmp(), drive))).toBe(true);
    const wired = store().signal;
    expect(wired.nodes.some((n) => n.id === drive)).toBe(true);

    store().undo();
    expect(store().signal).toBe(before);
    expect(store().items).toHaveLength(1); // the add is a separate, earlier step
    store().redo();
    expect(store().signal).toBe(wired);
  });

  it("refuses a bad edit without changing anything", () => {
    custom("Drive");
    const drive = idOf("Drive");
    store().editSignal((g) => addItemNode(g, drive));
    const before = store().signal;
    const pastLength = store().past.length;
    expect(store().editSignal((g) => connect(g, drive, drive))).toBe(false);
    expect(store().signal).toBe(before);
    expect(store().past).toHaveLength(pastLength);
  });

  it("heals the chain when a pedal is deleted, and undo brings both back", () => {
    custom("A");
    custom("B");
    const [a, b] = [idOf("A"), idOf("B")];
    store().editSignal((g) => insertOnCable(g, intoAmp(), a));
    store().editSignal((g) => insertOnCable(g, intoAmp(), b));
    const wired = store().signal;

    store().select(a);
    store().deleteSelected();
    expect(store().signal.nodes.some((n) => n.id === a)).toBe(false);
    const guitar = store().signal.nodes.find((n) => n.type === "source")!.id;
    expect(store().signal.cables.some((c) => c.from === guitar && c.to === b)).toBe(true);

    store().undo();
    expect(store().signal).toBe(wired);
    expect(store().items.map((i) => i.id)).toContain(a);
  });

  it("saves the chain in the document and cleans it up on load", () => {
    custom("A");
    const a = idOf("A");
    store().editSignal((g) => insertOnCable(g, intoAmp(), a));
    const doc = store().toDocument();
    expect(doc.signal?.nodes.some((n) => n.id === a)).toBe(true);

    store().loadDocument({ ...doc, items: [] });
    expect(store().signal.nodes.some((n) => n.id === a)).toBe(false);
    expect(store().signal.cables).toHaveLength(1); // guitar → amp, once the missing pedal is dropped and healed
  });
});
