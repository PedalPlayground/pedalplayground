/**
 * What a jack is: Trav's list of jack labels (Nov 2026), as a tree flattened into ids like "output.stereo.trs". A
 * plug can carry one (`Plug.jack`); it says which way the signal runs, and which labels fit a cable's type. Pure data.
 */
import type { CableKind } from "./plugs";

export interface JackLabel {
  /** Dotted path, stored on the plug. */
  id: string;
  /** The top of the tree, like "Output" (the menu groups by it). */
  group: string;
  /** The rest of the path, like "Stereo · TRS to TRS", or the group's name for the top itself. */
  label: string;
  /** Which way signal goes through this jack: out of the pedal, or into it. */
  role: "in" | "out";
  /** The cable types this label fits. */
  kinds: CableKind[];
}

type Node = { key: string; label: string; kinds?: CableKind[]; children?: Node[] };

const mono: Node = {
  key: "mono",
  label: "Mono",
  kinds: ["mono"],
  children: [
    { key: "left", label: "Left" },
    { key: "right", label: "Right" },
  ],
};
const stereo = (split = true): Node => ({
  key: "stereo",
  label: "Stereo",
  kinds: ["stereo"],
  children: split
    ? [
        { key: "trs", label: "TRS to TRS" },
        { key: "y", label: "TRS to dual Mono (Y-split)" },
      ]
    : undefined,
});
const audio: CableKind[] = ["mono", "stereo"];
const inOut = (kinds: CableKind[]): Node[] => [
  { key: "out", label: "Out", kinds },
  { key: "in", label: "In", kinds },
];

/** The tree. A node's `kinds` default to its parent's. */
const TREE: (Node & { role: "in" | "out" | "split" })[] = [
  {
    key: "output",
    label: "Output",
    role: "out",
    kinds: audio,
    children: [mono, stereo(), { key: "wet", label: "Effect (Wet)" }, { key: "dry", label: "Clean (Dry)" }],
  },
  { key: "input", label: "Input", role: "in", kinds: audio, children: [mono, stereo()] },
  { key: "send", label: "Loop Send", role: "out", kinds: audio, children: [mono, stereo()] },
  { key: "return", label: "Loop Return", role: "in", kinds: audio, children: [mono, stereo(false)] },
  { key: "tap", label: "Tap Tempo", role: "in", kinds: ["tap"] },
  { key: "midi-in", label: "MIDI In", role: "in", kinds: ["midi"] },
  {
    key: "midi-out",
    label: "MIDI Out",
    role: "out",
    kinds: ["midi"],
    children: [
      { key: "din", label: "5 pin" },
      { key: "trs", label: "¼″ TRS" },
      { key: "mini", label: "3.5 mm TRS" },
    ],
  },
  { key: "midi-thru", label: "MIDI Thru", role: "out", kinds: ["midi"] },
  { key: "power", label: "Power", role: "split", kinds: ["power"], children: [...inOut(["power"]), { key: "4-24v", label: "4–24V" }] },
  { key: "remote", label: "Remote", role: "split", kinds: ["switching"], children: inOut(["switching"]) },
  { key: "exp", label: "Expression", role: "split", kinds: ["exp"], children: inOut(["exp"]) },
];

function flatten(): JackLabel[] {
  const out: JackLabel[] = [];
  for (const top of TREE) {
    const walk = (n: Node, path: string[], names: string[], kinds: CableKind[], role: "in" | "out") => {
      const k = n.kinds ?? kinds;
      // Under Power, Remote and Expression the child says the way: "Out" or "In" (anything else counts as in).
      const r = top.role === "split" && path.length === 1 ? (n.key === "out" ? "out" : "in") : role;
      const id = [...path, n.key].join(".");
      const label = names.length ? [...names, n.label].slice(1).join(" · ") : n.label;
      out.push({ id, group: top.label, label, role: r, kinds: k });
      for (const c of n.children ?? []) walk(c, [...path, n.key], [...names, n.label], k, r);
    };
    walk(top, [], [], top.kinds ?? [], top.role === "split" ? "in" : top.role);
  }
  return out;
}

export const JACK_LABELS: JackLabel[] = flatten();
const byId = new Map(JACK_LABELS.map((j) => [j.id, j]));
export const jackLabel = (id: string | undefined) => (id ? byId.get(id) : undefined);

/** The labels that fit a cable type ("other" fits everything). The tops of Power, Remote and Expression are left out: pick a way. */
export const jacksFor = (kind: CableKind) =>
  JACK_LABELS.filter((j) => (kind === "other" || j.kinds.includes(kind)) && !(byId.has(`${j.id}.out`) && byId.has(`${j.id}.in`)));

/** The usual label at the other end of a cable from this one: an output goes to an input, MIDI Out to MIDI In, and so on. */
export function matchingJack(id: string): string | undefined {
  const [top, ...rest] = id.split(".");
  const swap: Record<string, string> = { output: "input", send: "input", input: "output", return: "output" };
  if (swap[top]) {
    // Keep the detail when the other side has it (Wet and Dry outputs go to a plain input).
    for (let n = rest.length; n >= 0; n--) {
      const cand = [swap[top], ...rest.slice(0, n)].join(".");
      if (byId.has(cand)) return cand;
    }
  }
  if (top === "midi-out" || top === "midi-thru") return "midi-in";
  if (top === "midi-in") return "midi-out";
  if (rest[0] === "out" || rest[0] === "in") return `${top}.${rest[0] === "out" ? "in" : "out"}`;
  return undefined;
}
