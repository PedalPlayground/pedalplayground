/**
 * The signal path: how the gear on a playground is wired together. It's a graph kept beside the items, so a
 * pedal can sit on the board without being in the chain. Pure functions only; the store applies them.
 *
 * Nothing here guesses mono or stereo, or which gear is a controller. Everything starts as mono audio and
 * the user says otherwise.
 */
import type { Item } from "./types";

export type Channels = "mono" | "stereo";

/** What a controller sends instead of audio. */
export type ControlKind = "exp" | "midi" | "aux";

/** How a pedal's audio goes in and out, as the user has set it. Missing fields mean mono. */
export interface IoProfile {
  inChannels: Channels;
  outChannels: Channels;
  /** Set when the user treats this pedal as a controller: it has no audio, only control cables. */
  control?: ControlKind;
}

export type SignalNode =
  /** A pedal on the playground. Its id is the item's id, so replacing the pedal keeps its place in the chain. */
  | { id: string; type: "item"; io?: Partial<IoProfile> }
  /** End points that aren't on the playground: "Guitar" and "Amp FX Send" are sources; "Amp" and "DI / PA" are destinations. */
  | { id: string; type: "source" | "destination"; label: string; channels: Channels }
  /** Where a path splits in two or more, or where paths meet again. */
  | { id: string; type: "split" | "merge" };

export interface Cable {
  id: string;
  from: string;
  to: string;
  /** Audio cables are mono or stereo depending on their two ends. Control cables run from a controller to a pedal. */
  kind: "audio" | "control";
}

export interface SignalGraph {
  nodes: SignalNode[];
  cables: Cable[];
}

/** A rule an edit would break. The store shows it as a toast and leaves the graph as it was. */
export class SignalError extends Error {}

const newId = () => crypto.randomUUID();

/** A new playground's chain: the guitar plugged straight into the amp. */
export function defaultSignal(): SignalGraph {
  const guitar: SignalNode = { id: newId(), type: "source", label: "Guitar", channels: "mono" };
  const amp: SignalNode = { id: newId(), type: "destination", label: "Amp", channels: "mono" };
  return { nodes: [guitar, amp], cables: [{ id: newId(), from: guitar.id, to: amp.id, kind: "audio" }] };
}

export const nodeById = (g: SignalGraph, id: string) => g.nodes.find((n) => n.id === id);

/** The node's I/O with every unset field filled in as mono audio. */
export function ioOf(node: SignalNode): IoProfile {
  switch (node.type) {
    case "item":
      return { inChannels: node.io?.inChannels ?? "mono", outChannels: node.io?.outChannels ?? "mono", control: node.io?.control };
    case "source":
    case "destination":
      return { inChannels: node.channels, outChannels: node.channels };
    default:
      return { inChannels: "mono", outChannels: "mono" };
  }
}

export const isController = (node: SignalNode | undefined) => node?.type === "item" && !!node.io?.control;

const audioIn = (g: SignalGraph, id: string) => g.cables.filter((c) => c.kind === "audio" && c.to === id);
const audioOut = (g: SignalGraph, id: string) => g.cables.filter((c) => c.kind === "audio" && c.from === id);

/** How many audio cables can come into and go out of a node. Fan-out and fan-in go through split and merge nodes. */
function audioLimits(node: SignalNode): { ins: number; outs: number } {
  if (isController(node)) return { ins: 0, outs: 0 };
  switch (node.type) {
    case "source":
      return { ins: 0, outs: 1 };
    case "destination":
      return { ins: 1, outs: 0 };
    case "split":
      return { ins: 1, outs: Infinity };
    case "merge":
      return { ins: Infinity, outs: 1 };
    default:
      return { ins: 1, outs: 1 };
  }
}

/** A cable carries stereo only when the output it leaves and the input it enters are both stereo. */
export function cableChannels(g: SignalGraph, c: Cable): Channels | null {
  if (c.kind !== "audio") return null;
  const from = nodeById(g, c.from);
  const to = nodeById(g, c.to);
  if (!from || !to) return null;
  return channelsOut(g, from) === "stereo" && channelsIn(to) === "stereo" ? "stereo" : "mono";
}

/** Junctions pass on whatever comes into them. */
function channelsOut(g: SignalGraph, node: SignalNode, seen = new Set<string>()): Channels {
  if (node.type !== "split" && node.type !== "merge") return ioOf(node).outChannels;
  if (seen.has(node.id)) return "mono";
  seen.add(node.id);
  const ins = audioIn(g, node.id)
    .map((c) => nodeById(g, c.from))
    .filter((n): n is SignalNode => !!n);
  return ins.length > 0 && ins.every((n) => channelsOut(g, n, seen) === "stereo") ? "stereo" : "mono";
}

function channelsIn(node: SignalNode): Channels {
  return node.type === "split" || node.type === "merge" ? "stereo" : ioOf(node).inChannels;
}

/** Stereo going into a mono input: the right side is dropped. The diagram flags these. */
export function stereoIntoMono(g: SignalGraph): Cable[] {
  return g.cables.filter((c) => {
    if (c.kind !== "audio") return false;
    const from = nodeById(g, c.from);
    const to = nodeById(g, c.to);
    return !!from && !!to && channelsOut(g, from) === "stereo" && channelsIn(to) === "mono";
  });
}

/** True if `to` can already reach `from` through audio cables, so a cable from → to would loop. */
function reaches(g: SignalGraph, start: string, target: string): boolean {
  const stack = [start];
  const seen = new Set<string>();
  while (stack.length) {
    const id = stack.pop()!;
    if (id === target) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const c of audioOut(g, id)) stack.push(c.to);
  }
  return false;
}

/** Adds a pedal to the graph, not yet connected. Does nothing if it's already there. */
export function addItemNode(g: SignalGraph, itemId: string): SignalGraph {
  if (nodeById(g, itemId)) return g;
  return { ...g, nodes: [...g.nodes, { id: itemId, type: "item" }] };
}

export function addEndPoint(g: SignalGraph, type: "source" | "destination", label: string, channels: Channels = "mono"): SignalGraph {
  return { ...g, nodes: [...g.nodes, { id: newId(), type, label, channels }] };
}

/** Connects two nodes, or throws a SignalError saying why it can't. */
export function connect(g: SignalGraph, from: string, to: string, kind: Cable["kind"] = "audio"): SignalGraph {
  const a = nodeById(g, from);
  const b = nodeById(g, to);
  if (!a || !b) throw new SignalError("That gear isn't in the signal path.");
  if (from === to) throw new SignalError("A pedal can't be plugged into itself.");
  if (g.cables.some((c) => c.from === from && c.to === to && c.kind === kind)) return g;

  if (kind === "control") {
    if (!isController(a)) throw new SignalError("Only a controller can control another pedal.");
    if (b.type !== "item" || isController(b)) throw new SignalError("A controller can only control a pedal.");
  } else {
    if (isController(a) || isController(b)) throw new SignalError("Controllers don't carry audio.");
    if (audioOut(g, from).length >= audioLimits(a).outs) throw new SignalError("That output is already in use. Add a split to send it two places.");
    if (audioIn(g, to).length >= audioLimits(b).ins) throw new SignalError("That input is already in use. Add a merge to join two signals.");
    if (reaches(g, to, from)) throw new SignalError("That would loop the signal back on itself.");
  }
  return { ...g, cables: [...g.cables, { id: newId(), from, to, kind }] };
}

export function disconnect(g: SignalGraph, cableId: string): SignalGraph {
  return { ...g, cables: g.cables.filter((c) => c.id !== cableId) };
}

/** Puts a pedal into the audio cable `cableId`, between its two ends. */
export function insertOnCable(g: SignalGraph, cableId: string, itemId: string): SignalGraph {
  const cable = g.cables.find((c) => c.id === cableId && c.kind === "audio");
  if (!cable) throw new SignalError("That cable isn't in the signal path.");
  if (cable.from === itemId || cable.to === itemId) return g; // already right there
  let next = removeNode(addItemNode(g, itemId), itemId, { heal: true });
  next = addItemNode(next, itemId);
  // Healing can replace the cable, so find the one between the same two ends again.
  const target = next.cables.find((c) => c.kind === "audio" && c.from === cable.from && c.to === cable.to);
  if (!target) throw new SignalError("That cable isn't in the signal path.");
  next = disconnect(next, target.id);
  next = connect(next, cable.from, itemId);
  return connect(next, itemId, cable.to);
}

/**
 * Takes a node out of the chain. With `heal`, a node that sat in a single line (one audio cable in, one out)
 * leaves its neighbours plugged into each other. Controllers that controlled it stay, unattached.
 */
export function removeNode(g: SignalGraph, id: string, opts: { heal: boolean }): SignalGraph {
  const ins = audioIn(g, id);
  const outs = audioOut(g, id);
  let next: SignalGraph = {
    nodes: g.nodes.filter((n) => n.id !== id),
    cables: g.cables.filter((c) => c.from !== id && c.to !== id),
  };
  // A branch whose last pedal is deleted goes away, instead of becoming an empty wire from split to merge.
  const emptiesBranch = ins.length === 1 && outs.length === 1 && nodeById(g, ins[0].from)?.type === "split" && nodeById(g, outs[0].to)?.type === "merge";
  if (opts.heal && ins.length === 1 && outs.length === 1 && !emptiesBranch) {
    try {
      next = connect(next, ins[0].from, outs[0].to);
    } catch {
      /* the neighbours can't be joined (both ends already busy), so leave the gap */
    }
  }
  return tidyJunctions(next);
}

/** Removes splits and merges that no longer split or merge anything, joining what was on either side. */
export function tidyJunctions(g: SignalGraph): SignalGraph {
  let next = g;
  for (;;) {
    const lone = next.nodes.find((n) => {
      if (n.type === "split") return audioOut(next, n.id).length < 2;
      if (n.type === "merge") return audioIn(next, n.id).length < 2;
      return false;
    });
    if (!lone) return next;
    const ins = audioIn(next, lone.id);
    const outs = audioOut(next, lone.id);
    next = { nodes: next.nodes.filter((n) => n !== lone), cables: next.cables.filter((c) => c.from !== lone.id && c.to !== lone.id) };
    if (ins.length === 1 && outs.length === 1) {
      try {
        next = connect(next, ins[0].from, outs[0].to);
      } catch {
        /* leave the gap */
      }
    }
  }
}

/** Changes a pedal's I/O. Turning it into a controller unplugs its audio; turning it back unplugs its control cables. */
export function setIo(g: SignalGraph, id: string, patch: Partial<IoProfile>): SignalGraph {
  const node = nodeById(g, id);
  if (!node) return g;
  if (node.type === "source" || node.type === "destination") {
    const channels = patch.outChannels ?? patch.inChannels;
    return channels ? { ...g, nodes: g.nodes.map((n) => (n === node ? { ...node, channels } : n)) } : g;
  }
  if (node.type !== "item") return g;

  const io = { ...node.io, ...patch };
  for (const key of Object.keys(io) as (keyof IoProfile)[]) {
    if (io[key] === undefined || (key !== "control" && io[key] === "mono")) delete io[key];
  }
  const updated: SignalNode = Object.keys(io).length ? { ...node, io } : { id: node.id, type: "item" };
  let next: SignalGraph = { ...g, nodes: g.nodes.map((n) => (n === node ? updated : n)) };

  const wasController = isController(node);
  const nowController = isController(updated);
  if (!wasController && nowController) {
    // Out of the audio path, healed around, then back in the graph on its own. Controllers can't be controlled.
    const healed = removeNode(next, id, { heal: true });
    next = { nodes: [...healed.nodes, updated], cables: healed.cables };
  }
  if (wasController && !nowController) next = { ...next, cables: next.cables.filter((c) => !(c.kind === "control" && c.from === id)) };
  return next;
}

/**
 * "Stereo From Here": this pedal's output, and the input and output of every pedal after it, become stereo,
 * up to the next merge or destination. `channels: "mono"` is "Mono From Here".
 */
export function channelsFromHere(g: SignalGraph, id: string, channels: Channels): SignalGraph {
  const start = nodeById(g, id);
  if (!start || isController(start)) return g;
  let next = start.type === "item" || start.type === "source" ? setIo(g, id, { outChannels: channels }) : g;
  const queue = audioOut(next, id).map((c) => c.to);
  const seen = new Set<string>();
  while (queue.length) {
    const nid = queue.shift()!;
    if (seen.has(nid)) continue;
    seen.add(nid);
    const node = nodeById(next, nid);
    if (!node || node.type === "merge" || node.type === "destination") continue;
    if (node.type === "item") next = setIo(next, nid, { inChannels: channels, outChannels: channels });
    queue.push(...audioOut(next, nid).map((c) => c.to));
  }
  return next;
}

/** Drops pedals that aren't on the playground (or are pedalboards), healing around them, and cables with a missing end. */
export function normalizeSignal(raw: SignalGraph | undefined, items: Item[]): SignalGraph {
  if (!raw || !Array.isArray(raw.nodes) || !Array.isArray(raw.cables)) return defaultSignal();
  const pedals = new Set(items.filter((i) => i.kind === "pedal").map((i) => i.id));
  const seen = new Set<string>();
  const nodes = raw.nodes.filter((n) => {
    if (!n || typeof n.id !== "string" || seen.has(n.id)) return false;
    seen.add(n.id);
    return ["item", "source", "destination", "split", "merge"].includes(n.type);
  });
  const ids = new Set(nodes.map((n) => n.id));
  const cables = raw.cables.filter((c) => c && ids.has(c.from) && ids.has(c.to) && (c.kind === "audio" || c.kind === "control"));
  const missing = nodes.filter((n) => n.type === "item" && !pedals.has(n.id)).map((n) => n.id);
  return tidyJunctions(removeItems({ nodes, cables }, missing));
}

/** What's left after these items are deleted from the playground, with the chain healed around each one. */
export function removeItems(g: SignalGraph, ids: string[]): SignalGraph {
  return ids.reduce((next, id) => (nodeById(next, id) ? removeNode(next, id, { heal: true }) : next), g);
}
