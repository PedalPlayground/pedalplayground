/**
 * Example rigs for the signal path tests and screenshots. Not used by the app.
 */
import { connect, setIo, channelsFromHere, type SignalGraph, type SignalNode } from "./signal";
import type { Item, PlaygroundDocument } from "./types";

const COLORS = ["#d23b3b", "#e08a1e", "#2f8f4e", "#2b6fd6", "#7d4cc9", "#3a3a3a", "#c2c2c2", "#d6c22b"];

export function fixturePedal(id: string, label: string, n: number, pedalType?: string): Item {
  return {
    id,
    kind: "pedal",
    label,
    image: null,
    width: 2.875,
    height: 5.125,
    x: n * 3.2,
    y: 0,
    rotation: 0,
    flipX: false,
    custom: true,
    color: COLORS[n % COLORS.length],
    template: "compact",
    ...(pedalType && { pedalType }),
  };
}

/** Builds a rig: `wire` lists [from, to] pairs by id; "guitar" and "amp" are the default ends. */
export function rig(
  name: string,
  pedals: [id: string, label: string, type?: string][],
  wire: [string, string][],
  opts: {
    ends?: SignalNode[];
    junctions?: SignalNode[];
    controllers?: [id: string, targets: string[], kind?: "exp" | "midi" | "aux"][];
    stereoFrom?: string;
    stereoAmp?: boolean;
    extraPedals?: [id: string, label: string][];
  } = {},
): PlaygroundDocument {
  const items = [...pedals, ...(opts.extraPedals ?? [])].map(([id, label, type], n) => fixturePedal(id, label, n, type));
  let g: SignalGraph = {
    nodes: [
      { id: "guitar", type: "source", label: "Guitar", channels: "mono" },
      { id: "amp", type: "destination", label: "Amp", channels: opts.stereoAmp ? "stereo" : "mono" },
      ...(opts.ends ?? []),
      ...(opts.junctions ?? []),
      ...pedals.map(([id]): SignalNode => ({ id, type: "item" })),
    ],
    cables: [],
  };
  for (const [id, , kind] of opts.controllers ?? []) g = setIo(g, id, { control: kind ?? "exp" });
  for (const [from, to] of wire) g = connect(g, from, to);
  for (const [id, targets] of opts.controllers ?? []) for (const t of targets) g = connect(g, id, t, "control");
  if (opts.stereoFrom) g = channelsFromHere(g, opts.stereoFrom, "stereo");
  return { schemaVersion: 3, savedAt: new Date(0).toISOString(), name, items, signal: g };
}

function series(ids: string[]): [string, string][] {
  const chain = ["guitar", ...ids, "amp"];
  return chain.slice(1).map((id, i) => [chain[i], id]);
}

const names = ["Tuner", "Compressor", "Boost", "Overdrive", "Distortion", "Fuzz", "Wah", "Chorus", "Phaser", "Flanger", "Tremolo", "Delay", "Reverb", "Looper", "Octave", "Volume"];

export const FIXTURES: Record<string, PlaygroundDocument> = {
  empty: rig("Empty", [], [["guitar", "amp"]]),

  series: rig(
    "Series",
    names.slice(0, 5).map((n, i) => [`p${i}`, n]),
    series(names.slice(0, 5).map((_, i) => `p${i}`)),
  ),

  long: rig(
    "Long chain",
    names.map((n, i) => [`p${i}`, n]),
    series(names.map((_, i) => `p${i}`)),
  ),

  parallel: rig(
    "Wet/dry blend",
    [
      ["comp", "Compressor"],
      ["drive", "Overdrive"],
      ["fuzz", "Fuzz"],
      ["delay", "Delay"],
      ["verb", "Reverb"],
      ["trem", "Tremolo"],
    ],
    [
      ["guitar", "comp"],
      ["comp", "s1"],
      ["s1", "drive"],
      ["s1", "fuzz"],
      ["fuzz", "trem"],
      ["drive", "m1"],
      ["trem", "m1"],
      ["m1", "delay"],
      ["delay", "verb"],
      ["verb", "amp"],
    ],
    { junctions: [{ id: "s1", type: "split" }, { id: "m1", type: "merge" }], stereoFrom: "delay", stereoAmp: true },
  ),

  dryPath: rig(
    "Clean blend",
    [["fuzz", "Fuzz"]],
    [
      ["guitar", "s1"],
      ["s1", "fuzz"],
      ["s1", "m1"],
      ["fuzz", "m1"],
      ["m1", "amp"],
    ],
    { junctions: [{ id: "s1", type: "split" }, { id: "m1", type: "merge" }] },
  ),

  twoAmps: rig(
    "Two amps with a tuner",
    [
      ["tuner", "Tuner"],
      ["drive", "Overdrive"],
      ["chorus", "Chorus"],
      ["delay", "Delay"],
      ["trem", "Tremolo"],
    ],
    [
      ["guitar", "s0"],
      ["s0", "drive"],
      ["s0", "tuner"],
      ["drive", "chorus"],
      ["chorus", "s1"],
      ["s1", "delay"],
      ["s1", "trem"],
      ["delay", "amp"],
      ["trem", "amp2"],
    ],
    {
      ends: [{ id: "amp2", type: "destination", label: "Amp 2", channels: "mono" }],
      junctions: [{ id: "s0", type: "split" }, { id: "s1", type: "split" }],
    },
  ),

  controllers: rig(
    "Expression and remotes",
    [
      ["wah", "Wah"],
      ["drive", "Overdrive"],
      ["delay", "Delay"],
      ["verb", "Reverb"],
      ["exp", "Expression"],
      ["remote", "Tap Tempo"],
    ],
    series(["wah", "drive", "delay", "verb"]),
    {
      controllers: [
        ["exp", ["wah"]],
        ["remote", ["delay", "verb"], "aux"],
      ],
      extraPedals: [["spare", "Spare Fuzz"]],
    },
  ),
};
