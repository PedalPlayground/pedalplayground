import { Guitar, Route, Speaker } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { thumbUrl, type Manifest } from "../lib/catalog";
import { DEFAULT_PEDAL_COLOR } from "../lib/color";
import { PX_PER_INCH } from "../lib/geometry";
import { itemName } from "../lib/itemName";
import { nodeById, type SignalNode } from "../lib/signal";
import { channelBadge, DESKTOP_METRICS, layoutSignal, PHONE_METRICS, type LayoutMetrics, type TileBox, type Wire } from "../lib/signalLayout";
import type { Item } from "../lib/types";
import { useCatalog } from "../store/catalog";
import { usePlayground } from "../store/playground";
import { useUi } from "../store/ui";
import { PedalArt } from "./PedalArt";
import { tip } from "./Tooltip";

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

const CONTROL_LABEL = { exp: "Expression", midi: "MIDI", aux: "Aux Switch" } as const;

/** The Signal Path mode: the chain as a modeler-style grid. Covers the canvas like the Equipment List. */
export function SignalPath() {
  const items = usePlayground((p) => p.items);
  const signal = usePlayground((p) => p.signal);
  const { manifest, load } = useCatalog();
  const setMode = useUi((u) => u.setMode);
  const setSearchOpen = useUi((u) => u.setSearchOpen);

  useEffect(() => {
    void load();
  }, [load]);

  // The diagram wraps to the room it has, so measure it.
  const box = useRef<HTMLDivElement>(null);
  const [room, setRoom] = useState(0);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setRoom(el.clientWidth));
    ro.observe(el);
    setRoom(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const metrics: LayoutMetrics = { ...(room < 640 ? PHONE_METRICS : DESKTOP_METRICS), maxWidth: room };
  const layout = useMemo(() => (room ? layoutSignal(signal, items, metrics) : null), [signal, items, room]);

  const pedals = items.filter((i) => i.kind === "pedal");
  const byId = new Map(items.map((i) => [i.id, i]));
  const trayItems = (layout?.tray ?? []).map((id) => byId.get(id)!).filter(Boolean);
  const inChain = layout ? layout.tiles.filter((t) => t.kind === "item" || t.kind === "controller").length : 0;

  const addGear = () => {
    setMode("playground");
    setSearchOpen(true);
  };

  return (
    <div className="animate-fade absolute inset-0 z-10 overflow-y-auto overscroll-contain bg-canvas">
      {/* Clears the floating mode rail: beside it on larger screens, below it on phones. */}
      <div className="flex w-full flex-col gap-3 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] pt-[76px] sm:pl-[calc(max(1rem,env(safe-area-inset-left))+64px)] sm:pr-[max(1.5rem,env(safe-area-inset-right))] sm:pt-3">
        <header className="animate-enter px-1 py-1 [--enter-y:4px]">
          <h2 className="text-lg font-semibold tracking-[-0.02em]">Signal Path</h2>
          <p className="text-[13px] text-ink-muted">
            {pedals.length === 0 ? "Nothing on this playground yet" : `${plural(inChain, "Pedal")} in Chain · ${trayItems.length} Not in Chain`}
          </p>
        </header>

        {pedals.length === 0 ? (
          <div className="animate-enter flex flex-col items-center gap-3 rounded-panel bg-surface px-6 py-10 text-center shadow-panel">
            <span className="grid size-10 place-items-center rounded-full bg-brand/10 text-brand">
              <Route size={18} />
            </span>
            <p className="max-w-xs text-sm text-ink-muted">Add pedals to your playground to wire them up here.</p>
            <button
              onClick={addGear}
              className="btn-primary h-[30px] rounded-[5px] px-4 text-[13px] tracking-[-0.01em] outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1 pointer-coarse:h-10"
            >
              Add Gear
            </button>
          </div>
        ) : null}

        <div ref={box} className={`animate-enter overflow-x-auto rounded-panel bg-surface shadow-panel ${pedals.length === 0 ? "hidden" : ""}`}>
          {layout && (
            <div className="relative" style={{ width: layout.width, height: layout.height }} role="img" aria-label={describe(signal.nodes, layout, byId)}>
              <svg className="absolute inset-0 overflow-visible" width={layout.width} height={layout.height} aria-hidden>
                {layout.wires.map((w) => (
                  <WirePath key={w.id} wire={w} />
                ))}
                {layout.deadEnds.map((d, n) => (
                  <path key={n} d={`M${d.x} ${d.y}h10m0 -7v14`} className="fill-none stroke-ink-muted" strokeWidth={2} strokeLinecap="round" />
                ))}
              </svg>
              {layout.junctions.map((j) => (
                <span
                  key={j.id}
                  {...tip(j.type === "split" ? "Split" : "Merge")}
                  className="absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-ink-muted bg-surface"
                  style={{ left: j.x, top: j.y }}
                />
              ))}
              {layout.tiles.map((t) => (
                <Tile
                  key={t.id}
                  box={t}
                  node={nodeById(signal, t.id)}
                  item={byId.get(t.id)}
                  manifest={manifest}
                  warn={layout.warnings.includes(t.id)}
                  small={room < 640}
                />
              ))}
            </div>
          )}
        </div>

        {trayItems.length > 0 && (
          <section className="animate-enter flex flex-col gap-2">
            <h3 className="px-1 text-[13px] font-semibold tracking-[-0.01em] text-ink-muted">Not in Chain</h3>
            <div className="flex flex-wrap gap-2">
              {trayItems.map((item) => (
                <div key={item.id} className="flex h-9 items-center gap-2 rounded-control bg-surface pl-1 pr-3 shadow-panel">
                  <Art item={item} manifest={manifest} size={28} />
                  <span className="max-w-40 truncate text-sm">{itemName(item)}</span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

/** A plain reading of the main path for screen readers: "Guitar, then Boost, then Amp". */
function describe(nodes: SignalNode[], layout: { tiles: TileBox[] }, byId: Map<string, Item>) {
  const names = layout.tiles.map((t) => {
    const n = nodes.find((x) => x.id === t.id);
    if (n?.type === "source" || n?.type === "destination") return n.label;
    const item = byId.get(t.id);
    return item ? itemName(item) : "Pedal";
  });
  return `Signal path: ${names.join(", then ")}`;
}

/** An orthogonal polyline with softly rounded corners. */
function roundedPath(points: [number, number][], r = 8) {
  let d = `M${points[0][0]} ${points[0][1]}`;
  for (let i = 1; i < points.length; i++) {
    const [x, y] = points[i];
    const next = points[i + 1];
    if (!next) {
      d += `L${x} ${y}`;
      break;
    }
    const [px, py] = points[i - 1];
    const lenIn = Math.hypot(x - px, y - py);
    const lenOut = Math.hypot(next[0] - x, next[1] - y);
    const k = Math.min(r, lenIn / 2, lenOut / 2);
    const ax = x - (Math.sign(x - px) * k);
    const ay = y - (Math.sign(y - py) * k);
    const bx = x + Math.sign(next[0] - x) * k;
    const by = y + Math.sign(next[1] - y) * k;
    d += `L${ax} ${ay}Q${x} ${y} ${bx} ${by}`;
  }
  return d;
}

function WirePath({ wire }: { wire: Wire }) {
  const d = roundedPath(wire.points);
  if (wire.kind === "control") {
    return <path d={d} className="fill-none stroke-brand" strokeWidth={1.5} strokeDasharray="4 4" />;
  }
  // Wrapping wires get a small arrow on their run back to the left, so the direction reads at a glance.
  const arrow = wire.wraps && wire.points.length >= 4 ? arrowAt(wire.points[2], wire.points[3]) : null;
  return (
    <g>
      {wire.channels === "stereo" ? (
        <>
          {/* Two strands: a thick line with the background drawn down its middle. */}
          <path d={d} className="fill-none stroke-ink-muted" strokeWidth={5} />
          <path d={d} className="fill-none stroke-surface" strokeWidth={1.5} />
        </>
      ) : (
        <path d={d} className="fill-none stroke-ink-muted" strokeWidth={2} />
      )}
      {arrow && <path d={arrow} className="fill-none stroke-ink-muted" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />}
    </g>
  );
}

function arrowAt([x0, y0]: [number, number], [x1, y1]: [number, number]) {
  if (y0 !== y1) return null;
  const x = (x0 + x1) / 2;
  const dir = Math.sign(x1 - x0) || -1;
  return `M${x - dir * 5} ${y0 - 5}L${x} ${y0}L${x - dir * 5} ${y0 + 5}`;
}

function Tile({
  box,
  node,
  item,
  manifest,
  warn,
  small,
}: {
  box: TileBox;
  node: SignalNode | undefined;
  item: Item | undefined;
  manifest: Manifest | null;
  warn: boolean;
  small: boolean;
}) {
  const badge = channelBadge(node);
  const style = { left: box.x, top: box.y, width: box.w, height: box.h };

  if (node?.type === "source" || node?.type === "destination") {
    const Icon = node.type === "source" ? Guitar : Speaker;
    return (
      <div className="absolute flex flex-col items-center justify-center gap-1.5 rounded-full border border-chrome-line bg-canvas text-center" style={style}>
        <Icon size={small ? 16 : 18} className="text-ink-muted" />
        <span className="w-full truncate px-1 text-xs font-semibold">{node.label}</span>
        {badge && <Badge text={badge} />}
        {warn && <Warning />}
      </div>
    );
  }

  const controller = node?.type === "item" ? node.io?.control : undefined;
  const name = item ? itemName(item) : "Pedal";
  const sub = controller ? CONTROL_LABEL[controller] : item?.pedalType;
  return (
    <div
      {...tip(name)}
      className={`absolute flex flex-col items-center gap-1 rounded-[10px] border bg-surface px-1.5 pb-2 pt-2 text-center ${controller ? "border-dashed border-brand/50" : "border-chrome-line"}`}
      style={style}
    >
      <div className="grid min-h-0 w-full flex-1 place-items-center">{item && <Art item={item} manifest={manifest} size={small ? 44 : 56} />}</div>
      <span className="w-full truncate text-xs font-medium leading-tight">{name}</span>
      <span className="h-3.5 w-full truncate text-[11px] leading-tight text-ink-muted">{sub}</span>
      {badge && <Badge text={badge} />}
      {warn && <Warning />}
    </div>
  );
}

function Badge({ text }: { text: string }) {
  // Sits on the tile's top edge like a tag, clear of the pedal art.
  return (
    <span className="absolute -top-2 right-2 rounded-[4px] border border-brand/30 bg-surface px-1 text-[10px] font-semibold leading-[14px] text-brand">
      {text}
    </span>
  );
}

function Warning() {
  return (
    <span
      {...tip("Stereo into a mono input: the right side is dropped.")}
      className="absolute -left-1 -top-1 size-3 rounded-full border-2 border-surface bg-danger"
    />
  );
}

/** A pedal's picture, fitted into a `size` px square: the catalog thumbnail, or the drawn custom pedal. */
function Art({ item, manifest, size }: { item: Item; manifest: Manifest | null; size: number }) {
  const src = item.image ? thumbUrl(manifest, item.kind, item.image) : null;
  const w = item.width * PX_PER_INCH;
  const h = item.height * PX_PER_INCH;
  const scale = Math.min(size / w, size / h);
  if (src) return <img src={src} alt="" draggable={false} className="select-none object-contain" style={{ width: w * scale, height: h * scale }} />;
  if (!item.custom) return <span className="rounded-[4px] bg-surface-hover" style={{ width: w * scale, height: h * scale }} />;
  return (
    <span className="relative block" style={{ width: w * scale, height: h * scale }}>
      <span className="absolute left-0 top-0 origin-top-left" style={{ width: w, height: h, transform: `scale(${scale})` }}>
        <PedalArt template={item.template} jacks={item.jacks} w={w} h={h} color={item.color ?? DEFAULT_PEDAL_COLOR} label={item.label} />
      </span>
    </span>
  );
}
