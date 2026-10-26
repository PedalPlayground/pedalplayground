/**
 * The edits the Signal Path screen offers, built from the rules in signal.ts. Each takes a graph and returns
 * a new one, or throws a SignalError the store shows as a toast.
 */
import {
  addEndPoint,
  addItemNode,
  audioIn,
  audioOut,
  connect,
  detach,
  disconnect,
  insertOnCable,
  isController,
  nodeById,
  SignalError,
  type SignalGraph,
  type SignalNode,
} from "./signal";
import type { Item } from "./types";

const newId = () => crypto.randomUUID();

/** The first output, where "the end of the chain" is. */
const mainOutput = (g: SignalGraph) => g.nodes.find((n) => n.type === "destination");

/** Adds a pedal just before the first output. */
export function appendToChain(g: SignalGraph, itemId: string): SignalGraph {
  const out = mainOutput(g);
  if (!out) throw new SignalError("Add an output first.");
  let next = detach(addItemNode(g, itemId), itemId);
  const into = audioIn(next, out.id)[0];
  if (into) return insertOnCable(next, into.id, itemId);
  // Nothing plugged into the output yet: plug the pedal straight in, fed by the input if that's free.
  next = connect(next, itemId, out.id);
  const source = next.nodes.find((n) => n.type === "source" && audioOut(next, n.id).length === 0);
  return source ? connect(next, source.id, itemId) : next;
}

/**
 * Puts `itemId` on a new path beside the cable `cableId`. The cable's own path stays as the other branch;
 * if that cable has nothing on it yet (it's already an empty path between a split and a merge), the new pedal
 * just joins that group as another branch.
 */
export function parallelOnCable(g: SignalGraph, cableId: string, itemId: string): SignalGraph {
  let next = detach(addItemNode(g, itemId), itemId);
  const old = g.cables.find((c) => c.id === cableId);
  const cable = old && next.cables.find((c) => c.kind === "audio" && c.from === old.from && c.to === old.to);
  if (!cable) throw new SignalError("That cable isn't in the signal path anymore.");
  const a = nodeById(next, cable.from)!;
  const b = nodeById(next, cable.to)!;
  if (a.type === "split" && b.type === "merge") return connect(connect(next, a.id, itemId), itemId, b.id);

  const split: SignalNode = { id: newId(), type: "split" };
  const merge: SignalNode = { id: newId(), type: "merge" };
  next = disconnect({ ...next, nodes: [...next.nodes, split, merge] }, cable.id);
  // The pedal's branch first, so it's drawn on top and the clean path runs below it.
  for (const [from, to] of [
    [a.id, split.id],
    [split.id, itemId],
    [itemId, merge.id],
    [split.id, merge.id],
    [merge.id, b.id],
  ]) {
    next = connect(next, from, to);
  }
  return next;
}

/** Puts `itemId` on a path of its own beside the pedal `targetId`, with a split before and a merge after. */
export function parallelTo(g: SignalGraph, targetId: string, itemId: string): SignalGraph {
  if (targetId === itemId) return g;
  const target = nodeById(g, targetId);
  if (target?.type !== "item" || isController(target)) throw new SignalError("Pick a pedal in the chain.");
  const ins = audioIn(g, targetId);
  const outs = audioOut(g, targetId);
  if (ins.length !== 1 || outs.length !== 1) throw new SignalError("That pedal needs something plugged in on both sides first.");

  let next = detach(addItemNode(g, itemId), itemId);
  const before = audioIn(next, targetId)[0];
  const after = audioOut(next, targetId)[0];
  if (!before || !after) throw new SignalError("That pedal needs something plugged in on both sides first.");
  const a = nodeById(next, before.from)!;
  const b = nodeById(next, after.to)!;
  // Already the only pedal on a branch: the new one becomes another branch of the same group.
  if (a.type === "split" && b.type === "merge") return connect(connect(next, a.id, itemId), itemId, b.id);

  const split: SignalNode = { id: newId(), type: "split" };
  const merge: SignalNode = { id: newId(), type: "merge" };
  next = disconnect(disconnect({ ...next, nodes: [...next.nodes, split, merge] }, before.id), after.id);
  for (const [from, to] of [
    [a.id, split.id],
    [split.id, targetId],
    [targetId, merge.id],
    [split.id, itemId],
    [itemId, merge.id],
    [merge.id, b.id],
  ]) {
    next = connect(next, from, to);
  }
  return next;
}

/** The merge a pedal's path runs into, if it's on a branch that joins the main path again. */
export function mergeAhead(g: SignalGraph, id: string): string | undefined {
  const seen = new Set<string>();
  let cur = audioOut(g, id)[0]?.to;
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    const n = nodeById(g, cur);
    if (!n || n.type === "destination") return undefined;
    if (n.type === "merge") return cur;
    if (n.type === "split") return undefined;
    cur = audioOut(g, cur)[0]?.to;
  }
  return undefined;
}

/** "Move to Parallel Path": the pedal goes on a branch of its own, with a clean (empty) path beside it. */
export function moveToParallel(g: SignalGraph, id: string): SignalGraph {
  if (mergeAhead(g, id)) throw new SignalError("It's already on a parallel path.");
  const ins = audioIn(g, id);
  const outs = audioOut(g, id);
  if (ins.length !== 1 || outs.length !== 1) throw new SignalError("That pedal needs something plugged in on both sides first.");
  const [from, to] = [ins[0].from, outs[0].to];
  const next = detach(g, id);
  const healed = next.cables.find((c) => c.kind === "audio" && c.from === from && c.to === to);
  if (!healed) throw new SignalError("That pedal can't move to a parallel path from here.");
  return parallelOnCable(next, healed.id, id);
}

/** "Back to Series": off its branch and onto the main path, just after the merge. */
export function backToSeries(g: SignalGraph, id: string): SignalGraph {
  const merge = mergeAhead(g, id);
  if (!merge) throw new SignalError("It's already on the main path.");
  const after = audioOut(g, merge)[0]?.to;
  let next = detach(g, id);
  // The merge may be gone now, if this pedal's branch was one of only two.
  const cable =
    (nodeById(next, merge) && audioOut(next, merge)[0]) ||
    (after ? next.cables.find((c) => c.kind === "audio" && c.to === after) : undefined);
  if (!cable) return appendToChain(next, id);
  next = insertOnCable(next, cable.id, id);
  return next;
}

/** Swaps a pedal with its neighbour on the same path: -1 is earlier (toward the input), 1 is later. */
export function moveAlong(g: SignalGraph, id: string, dir: -1 | 1): SignalGraph {
  if (dir === -1) {
    const before = audioIn(g, id)[0];
    const prev = before && nodeById(g, before.from);
    if (!prev || prev.type === "source" || prev.type === "merge") throw new SignalError("It's already first on this path.");
    const into = audioIn(g, prev.id)[0];
    if (!into) throw new SignalError("It's already first on this path.");
    return insertOnCable(g, into.id, id);
  }
  const after = audioOut(g, id)[0];
  const next = after && nodeById(g, after.to);
  if (!next || next.type === "destination" || next.type === "split") throw new SignalError("It's already last on this path.");
  const out = audioOut(g, next.id)[0];
  if (!out) throw new SignalError("It's already last on this path.");
  return insertOnCable(g, out.id, id);
}

/** Toggles whether a controller controls `targetId`. */
export function toggleControl(g: SignalGraph, controllerId: string, targetId: string): SignalGraph {
  const existing = g.cables.find((c) => c.kind === "control" && c.from === controllerId && c.to === targetId);
  return existing ? disconnect(g, existing.id) : connect(g, controllerId, targetId, "control");
}

/** Adds another output (a second amp, a DI) fed from a split just before `destinationId`. */
export function addOutputBeside(g: SignalGraph, destinationId: string, label: string): SignalGraph {
  const into = audioIn(g, destinationId)[0];
  let next = addEndPoint(g, "destination", label);
  const added = next.nodes[next.nodes.length - 1];
  if (!into) return next;
  const from = nodeById(next, into.from)!;
  if (from.type === "split") return connect(next, from.id, added.id);
  const split: SignalNode = { id: newId(), type: "split" };
  next = disconnect({ ...next, nodes: [...next.nodes, split] }, into.id);
  next = connect(next, from.id, split.id);
  next = connect(next, split.id, destinationId);
  return connect(next, split.id, added.id);
}

export function renameEndPoint(g: SignalGraph, id: string, label: string): SignalGraph {
  const trimmed = label.trim();
  const node = nodeById(g, id);
  if (!trimmed || !node || (node.type !== "source" && node.type !== "destination") || node.label === trimmed) return g;
  return { ...g, nodes: g.nodes.map((n) => (n === node ? { ...node, label: trimmed } : n)) };
}

/**
 * "Auto Arrange": every audio pedal on the playground in one series chain, in the order they sit on the board
 * from right to left (on most boards the guitar plugs in on the right). Controllers keep their settings and
 * targets; other inputs and outputs, and any splits, are cleared.
 */
export function autoArrange(g: SignalGraph, items: Item[]): SignalGraph {
  const source = g.nodes.find((n) => n.type === "source") ?? { id: newId(), type: "source" as const, label: "Guitar", channels: "mono" as const };
  const output = g.nodes.find((n) => n.type === "destination") ?? { id: newId(), type: "destination" as const, label: "Amp", channels: "mono" as const };
  const pedals = items.filter((i) => i.kind === "pedal");
  const controllers = g.nodes.filter((n) => isController(n) && pedals.some((p) => p.id === n.id));
  const audio = pedals
    .filter((p) => !controllers.some((c) => c.id === p.id))
    .sort((a, b) => b.x + b.width / 2 - (a.x + a.width / 2) || a.y - b.y);

  const keep = (id: string): SignalNode => (g.nodes.find((n) => n.id === id && n.type === "item") as SignalNode | undefined) ?? { id, type: "item" };
  let next: SignalGraph = {
    nodes: [source, output, ...audio.map((p) => keep(p.id)), ...controllers],
    cables: g.cables.filter((c) => c.kind === "control" && controllers.some((x) => x.id === c.from) && audio.some((p) => p.id === c.to)),
  };
  const chain = [source.id, ...audio.map((p) => p.id), output.id];
  for (let i = 1; i < chain.length; i++) next = connect(next, chain[i - 1], chain[i]);
  return next;
}
