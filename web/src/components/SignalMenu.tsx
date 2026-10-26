import * as Dropdown from "@radix-ui/react-dropdown-menu";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  Columns2,
  Gamepad2,
  LocateFixed,
  Pencil,
  Plus,
  Rows2,
  Speaker,
  Trash2,
  Volume2,
} from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { create } from "zustand";
import { itemName } from "../lib/itemName";
import {
  audioIn,
  channelsFromHere,
  insertOnCable,
  ioOf,
  isController,
  nodeById,
  removeNode,
  setIo,
  type ControlKind,
  type SignalGraph,
} from "../lib/signal";
import {
  addOutputBeside,
  appendToChain,
  backToSeries,
  mergeAhead,
  moveAlong,
  moveToParallel,
  parallelTo,
  renameEndPoint,
  toggleControl,
} from "../lib/signalEdits";
import type { Item } from "../lib/types";
import { usePlayground } from "../store/playground";
import { useUi } from "../store/ui";
import { menuContentClass, rowClass } from "./ContextMenu";
import { hideTip, platformKeys } from "./Tooltip";

/** What was clicked: a tile in the diagram, a "+" on a wire, or a pedal in the Not in Chain tray. */
export type SignalMenuTarget = { kind: "tile" | "tray"; id: string } | { kind: "slot"; cableId: string };

interface OpenMenu {
  target: SignalMenuTarget;
  x: number;
  y: number;
  key: number;
}

export const useSignalMenu = create<{ open: OpenMenu | null }>(() => ({ open: null }));
let opens = 0;

/** Opens the menu just under `el`. */
export function openSignalMenu(target: SignalMenuTarget, el: Element) {
  hideTip();
  const r = el.getBoundingClientRect();
  useSignalMenu.setState({ open: { target, x: r.left, y: r.bottom, key: ++opens } });
}

export const closeSignalMenu = () => useSignalMenu.setState({ open: null });

export const CONTROL_LABEL: Record<ControlKind, string> = { exp: "Expression", midi: "MIDI", aux: "Aux Switch" };

const ICON = { size: 15, strokeWidth: 2 } as const;

/** Runs a signal edit as one undo step; a rule it breaks shows as a toast instead. */
export const edit = (fn: (g: SignalGraph) => SignalGraph, message?: string) => usePlayground.getState().editSignal(fn, message);

function Row({ icon, label, shortcut, onSelect, disabled, danger }: { icon?: ReactNode; label: string; shortcut?: string; onSelect: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <Dropdown.Item
      disabled={disabled}
      onSelect={onSelect}
      className={`${rowClass} ${danger ? "text-danger data-[highlighted]:bg-danger/10 active:bg-danger/20" : "text-ink data-[highlighted]:bg-surface-hover active:bg-chrome-line"}`}
    >
      <span aria-hidden className={`grid size-4 shrink-0 place-items-center ${danger ? "" : "text-ink-muted group-data-[highlighted]:text-ink"}`}>
        {icon}
      </span>
      <span className="flex-1 whitespace-nowrap">{label}</span>
      {shortcut && <kbd className="ml-6 font-sans text-xs tracking-normal text-ink-muted pointer-coarse:hidden">{platformKeys(shortcut)}</kbd>}
    </Dropdown.Item>
  );
}

function CheckRow({ label, checked, onSelect }: { label: string; checked: boolean; onSelect: () => void }) {
  return (
    <Dropdown.CheckboxItem
      checked={checked}
      onSelect={(e) => {
        e.preventDefault(); // stay open, so several can be ticked in a row
        onSelect();
      }}
      className={`${rowClass} text-ink data-[highlighted]:bg-surface-hover active:bg-chrome-line`}
    >
      <span aria-hidden className="grid size-4 shrink-0 place-items-center text-brand">
        <Dropdown.ItemIndicator>
          <Check {...ICON} />
        </Dropdown.ItemIndicator>
      </span>
      <span className="flex-1 whitespace-nowrap">{label}</span>
    </Dropdown.CheckboxItem>
  );
}

function Sub({ icon, label, children, disabled }: { icon: ReactNode; label: string; children: ReactNode; disabled?: boolean }) {
  return (
    <Dropdown.Sub>
      <Dropdown.SubTrigger disabled={disabled} className={`${rowClass} text-ink data-[highlighted]:bg-surface-hover data-[state=open]:bg-surface-hover`}>
        <span aria-hidden className="grid size-4 shrink-0 place-items-center text-ink-muted group-data-[highlighted]:text-ink">
          {icon}
        </span>
        <span className="flex-1 whitespace-nowrap">{label}</span>
        <ChevronRight size={14} className="ml-4 text-ink-muted" />
      </Dropdown.SubTrigger>
      <Dropdown.Portal>
        <Dropdown.SubContent sideOffset={4} collisionPadding={8} className={`${menuContentClass} max-h-80 overflow-y-auto`}>
          {children}
        </Dropdown.SubContent>
      </Dropdown.Portal>
    </Dropdown.Sub>
  );
}

const Separator = () => <Dropdown.Separator className="-mx-1 my-1 h-px bg-line" />;
const Label = ({ children }: { children: ReactNode }) => (
  <Dropdown.Label className="max-w-60 truncate px-2 pb-1 pt-0.5 text-xs font-semibold text-ink-muted">{children}</Dropdown.Label>
);

/** Pedals that could go into the chain: on the playground, audio (not controllers), and not wired in yet. */
function spareAudio(g: SignalGraph, items: Item[], onDiagram: Set<string>) {
  return items.filter((i) => i.kind === "pedal" && !onDiagram.has(i.id) && !isController(nodeById(g, i.id)));
}

/** Pedals wired into the audio chain, for controllers to control. */
function chainPedals(g: SignalGraph, items: Item[]) {
  return items.filter((i) => {
    const n = nodeById(g, i.id);
    return n?.type === "item" && !isController(n) && g.cables.some((c) => c.kind === "audio" && (c.from === i.id || c.to === i.id));
  });
}

function showOnPlayground(id: string) {
  useUi.getState().setMode("playground");
  usePlayground.getState().reveal(id);
}

function ControllerRows({ g, id, items }: { g: SignalGraph; id: string; items: Item[] }) {
  const node = nodeById(g, id);
  const kind = node?.type === "item" ? node.io?.control : undefined;
  const targets = chainPedals(g, items);
  return (
    <>
      <Label>Controls</Label>
      {targets.length === 0 && <Row label="Wire some pedals in first" disabled onSelect={() => {}} />}
      {targets.map((t) => (
        <CheckRow
          key={t.id}
          label={itemName(t)}
          checked={g.cables.some((c) => c.kind === "control" && c.from === id && c.to === t.id)}
          onSelect={() => edit((s) => toggleControl(s, id, t.id))}
        />
      ))}
      <Separator />
      <Sub icon={<Gamepad2 {...ICON} />} label={`Type: ${kind ? CONTROL_LABEL[kind] : "Expression"}`}>
        {(Object.keys(CONTROL_LABEL) as ControlKind[]).map((k) => (
          <CheckRow key={k} label={CONTROL_LABEL[k]} checked={kind === k} onSelect={() => edit((s) => setIo(s, id, { control: k }))} />
        ))}
      </Sub>
      <Row icon={<Volume2 {...ICON} />} label="Treat as Audio Pedal" onSelect={() => edit((s) => setIo(s, id, { control: undefined }), "Now an Audio Pedal")} />
    </>
  );
}

function TileRows({ id, items, onDiagram }: { id: string; items: Item[]; onDiagram: Set<string> }) {
  const g = usePlayground((p) => p.signal);
  const node = nodeById(g, id);
  if (!node) return null;

  if (node.type === "source" || node.type === "destination") {
    const stereo = node.channels === "stereo";
    const outputs = g.nodes.filter((n) => n.type === "destination").length;
    return (
      <>
        <Label>{node.label}</Label>
        <CheckRow label="Stereo" checked={stereo} onSelect={() => edit((s) => setIo(s, id, { inChannels: stereo ? "mono" : "stereo" }))} />
        <Row
          icon={<Pencil {...ICON} />}
          label="Rename…"
          onSelect={() => {
            const name = window.prompt(`Rename ${node.label}`, node.label);
            if (name) edit((s) => renameEndPoint(s, id, name));
          }}
        />
        {node.type === "destination" && (
          <>
            <Row icon={<Speaker {...ICON} />} label="Add Another Output" onSelect={() => edit((s) => addOutputBeside(s, id, `Amp ${outputs + 1}`), "Added an Output")} />
            {outputs > 1 && <Row icon={<Trash2 {...ICON} />} label="Remove Output" danger onSelect={() => edit((s) => removeNode(s, id, { heal: true }), "Removed")} />}
          </>
        )}
      </>
    );
  }
  if (node.type !== "item") return null;

  const item = items.find((i) => i.id === id);
  const name = item ? itemName(item) : "Pedal";
  if (isController(node)) {
    return (
      <>
        <Label>{name}</Label>
        <ControllerRows g={g} id={id} items={items} />
        <Separator />
        <Row icon={<LocateFixed {...ICON} />} label="Show on Playground" onSelect={() => showOnPlayground(id)} />
        <Row icon={<Trash2 {...ICON} />} label="Remove From Chain" shortcut="Delete" danger onSelect={() => edit((s) => removeNode(s, id, { heal: true }), "Removed From Chain")} />
      </>
    );
  }

  const io = ioOf(node);
  const inBranch = !!mergeAhead(g, id);
  const wired = audioIn(g, id).length > 0;
  const spare = spareAudio(g, items, onDiagram);
  return (
    <>
      <Label>{name}</Label>
      <CheckRow label="Stereo Input" checked={io.inChannels === "stereo"} onSelect={() => edit((s) => setIo(s, id, { inChannels: io.inChannels === "stereo" ? "mono" : "stereo" }))} />
      <CheckRow label="Stereo Output" checked={io.outChannels === "stereo"} onSelect={() => edit((s) => setIo(s, id, { outChannels: io.outChannels === "stereo" ? "mono" : "stereo" }))} />
      <Row icon={<Columns2 {...ICON} />} label="Stereo From Here" onSelect={() => edit((s) => channelsFromHere(s, id, "stereo"), "Stereo From Here")} />
      <Row icon={<Rows2 {...ICON} />} label="Mono From Here" onSelect={() => edit((s) => channelsFromHere(s, id, "mono"), "Mono From Here")} />
      <Separator />
      <Row icon={<ArrowLeft {...ICON} />} label="Move Earlier" shortcut="⌥←" disabled={!wired} onSelect={() => edit((s) => moveAlong(s, id, -1), "Moved")} />
      <Row icon={<ArrowRight {...ICON} />} label="Move Later" shortcut="⌥→" disabled={!wired} onSelect={() => edit((s) => moveAlong(s, id, 1), "Moved")} />
      {inBranch ? (
        <Row icon={<Rows2 {...ICON} />} label="Back to Series" onSelect={() => edit((s) => backToSeries(s, id), "Back in Series")} />
      ) : (
        <Row icon={<Columns2 {...ICON} />} label="Move to Parallel Path" disabled={!wired} onSelect={() => edit((s) => moveToParallel(s, id), "Moved to a Parallel Path")} />
      )}
      <Sub icon={<Plus {...ICON} />} label="Add Pedal in Parallel" disabled={!spare.length || !wired}>
        {spare.map((p) => (
          <Row key={p.id} label={itemName(p)} onSelect={() => edit((s) => parallelTo(s, id, p.id), "Added in Parallel")} />
        ))}
      </Sub>
      <Separator />
      <Sub icon={<Gamepad2 {...ICON} />} label="Treat as Controller">
        {(Object.keys(CONTROL_LABEL) as ControlKind[]).map((k) => (
          <Row key={k} label={CONTROL_LABEL[k]} onSelect={() => edit((s) => setIo(s, id, { control: k }), "Now a Controller")} />
        ))}
      </Sub>
      <Row icon={<LocateFixed {...ICON} />} label="Show on Playground" onSelect={() => showOnPlayground(id)} />
      <Row icon={<Trash2 {...ICON} />} label="Remove From Chain" shortcut="Delete" danger onSelect={() => edit((s) => removeNode(s, id, { heal: true }), "Removed From Chain")} />
    </>
  );
}

function TrayRows({ id, items }: { id: string; items: Item[] }) {
  const g = usePlayground((p) => p.signal);
  const item = items.find((i) => i.id === id);
  if (!item) return null;
  const node = nodeById(g, id);
  if (isController(node)) {
    return (
      <>
        <Label>{itemName(item)}</Label>
        <ControllerRows g={g} id={id} items={items} />
        <Separator />
        <Row icon={<LocateFixed {...ICON} />} label="Show on Playground" onSelect={() => showOnPlayground(id)} />
      </>
    );
  }
  return (
    <>
      <Label>{itemName(item)}</Label>
      <Row icon={<Plus {...ICON} />} label="Add to End of Chain" onSelect={() => edit((s) => appendToChain(s, id), "Added to Chain")} />
      <Sub icon={<Gamepad2 {...ICON} />} label="Treat as Controller">
        {(Object.keys(CONTROL_LABEL) as ControlKind[]).map((k) => (
          <Row
            key={k}
            label={CONTROL_LABEL[k]}
            onSelect={() => edit((s) => setIo(nodeById(s, id) ? s : { ...s, nodes: [...s.nodes, { id, type: "item" }] }, id, { control: k }), "Now a Controller")}
          />
        ))}
      </Sub>
      <Row icon={<LocateFixed {...ICON} />} label="Show on Playground" onSelect={() => showOnPlayground(id)} />
    </>
  );
}

function SlotRows({ cableId, items, onDiagram }: { cableId: string; items: Item[]; onDiagram: Set<string> }) {
  const g = usePlayground((p) => p.signal);
  const spare = spareAudio(g, items, onDiagram);
  return (
    <>
      <Label>Insert Here</Label>
      {spare.length === 0 && <Row label="Every pedal is in the chain" disabled onSelect={() => {}} />}
      {spare.map((p) => (
        <Row key={p.id} label={itemName(p)} onSelect={() => edit((s) => insertOnCable(s, cableId, p.id), `Added ${itemName(p)}`)} />
      ))}
    </>
  );
}

/** The one menu for the Signal Path screen. It opens under whatever was clicked. */
export function SignalMenu({ items, onDiagram }: { items: Item[]; onDiagram: Set<string> }) {
  const open = useSignalMenu((m) => m.open);

  useEffect(() => {
    if (!open) return;
    window.addEventListener("wheel", closeSignalMenu, { capture: true, passive: true });
    window.addEventListener("resize", closeSignalMenu);
    return () => {
      window.removeEventListener("wheel", closeSignalMenu, { capture: true });
      window.removeEventListener("resize", closeSignalMenu);
    };
  }, [open]);
  useEffect(() => closeSignalMenu, []);

  if (!open) return null;
  const t = open.target;
  return (
    <Dropdown.Root key={open.key} open modal={false} onOpenChange={(o) => !o && closeSignalMenu()}>
      <Dropdown.Trigger asChild>
        <span className="pointer-events-none fixed size-0" style={{ left: open.x, top: open.y }} />
      </Dropdown.Trigger>
      <Dropdown.Portal>
        <Dropdown.Content side="bottom" align="start" sideOffset={4} collisionPadding={8} onEscapeKeyDown={(e) => e.stopPropagation()} className={`${menuContentClass} max-h-[min(32rem,var(--radix-dropdown-menu-content-available-height))] overflow-y-auto`}>
          {t.kind === "tile" && <TileRows id={t.id} items={items} onDiagram={onDiagram} />}
          {t.kind === "tray" && <TrayRows id={t.id} items={items} />}
          {t.kind === "slot" && <SlotRows cableId={t.cableId} items={items} onDiagram={onDiagram} />}
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
  );
}
