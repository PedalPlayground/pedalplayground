import { ChevronDown, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import pancakeArt from "../assets/plugs/pancake.svg";
import reanArt from "../assets/plugs/rean.svg";
import sp400Art from "../assets/plugs/sp400.svg";
import { itemBounds } from "../lib/geometry";
import { plainField } from "../lib/inputProps";
import { spacedItems, usePlayground } from "../store/playground";
import { useUi, type Units } from "../store/ui";

const MM_PER_INCH = 25.4;

/** Thin side of common right-angle 1/4" plugs: the room one needs between two pedals. Pancake's is an estimate drawn from the illustration's proportions. */
const PLUGS = [
  { id: "rean", name: "Rean", mm: 14.5, art: reanArt, w: 217, h: 212, collar: 14 },
  { id: "sp400", name: "SP400", mm: 8.3, art: sp400Art, w: 189, h: 133, collar: 24 },
  { id: "pancake", name: "Pancake", mm: 11.5, art: pancakeArt, w: 203, h: 201, collar: 46 },
];
type Plug = (typeof PLUGS)[number];

/** The illustrations draw the barrel to the left and the body at the right edge; the second plug is mirrored. */
const ART_SCALE = 0.4;
const ART_TOP = Math.max(...PLUGS.map((p) => p.collar));
const ART_H = Math.max(...PLUGS.map((p) => ART_TOP - p.collar + p.h)) * ART_SCALE;

/** Top-down view of two right-angle plugs back to back: barrels run out to their pedals, bodies stand side by side between. */
function PlugDrawing({ left, right }: { left: Plug; right: Plug | null }) {
  const place = (p: Plug, mirrored: boolean) => (
    <img
      alt=""
      src={p.art}
      draggable={false}
      className="absolute max-w-none"
      style={{
        width: p.w * ART_SCALE,
        height: p.h * ART_SCALE,
        top: (ART_TOP - p.collar) * ART_SCALE,
        ...(mirrored ? { left: "50%", transform: "scaleX(-1)", transformOrigin: "left center" } : { right: "50%" }),
      }}
    />
  );
  return (
    <div className="relative mx-auto" style={{ height: ART_H, width: "100%" }} role="img" aria-label="Two plugs side by side">
      {place(left, false)}
      {right && place(right, true)}
    </div>
  );
}

/** The average gap the selection has now, in inches (never negative). */
function currentGap(selected: string[]) {
  const picked = usePlayground.getState().items.filter((i) => selected.includes(i.id));
  if (picked.length < 2) return 0;
  const bounds = picked.map(itemBounds).sort((a, b) => a.left - b.left);
  const widths = bounds.reduce((sum, b) => sum + (b.right - b.left), 0);
  return Math.max(0, (bounds[bounds.length - 1].right - bounds[0].left - widths) / (bounds.length - 1));
}

/**
 * "Space Between": a drawer docked down the canvas's left side, like Add Gear. The selection lines up left to right
 * with the chosen gap, shown live on the canvas as it's changed; Apply keeps it (and is one undo step), closing puts it back.
 */
export function SpaceBetweenPanel() {
  const units = useUi((u) => u.units);
  const setUnits = useUi((u) => u.setUnits);
  const setSpacingOpen = useUi((u) => u.setSpacingOpen);
  const searchOpen = useUi((u) => u.searchOpen);
  const selected = usePlayground((s) => s.selected);
  const spaceByGap = usePlayground((s) => s.spaceByGap);

  const fmt = (inches: number, u: Units = units) => (u === "mm" ? String(Math.round(inches * MM_PER_INCH * 10) / 10) : String(+inches.toFixed(3)));
  const [value, setValue] = useState(() => fmt(currentGap(usePlayground.getState().selected)));
  const [plug1, setPlug1] = useState<string | null>(null);
  const [plug2, setPlug2] = useState<string | null>(null);
  const [guideOpen, setGuideOpen] = useState(() => {
    try {
      return localStorage.getItem("pp:plug-guide") !== "closed";
    } catch {
      return true;
    }
  });
  const gap = parseFloat(value);
  const gapInches = units === "mm" ? gap / MM_PER_INCH : gap;
  const mmOf = (id: string | null) => PLUGS.find((p) => p.id === id)?.mm ?? 0;

  // Dock: tell the canvas how much of its left edge this covers, like the Add Gear panel does.
  const dockRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = dockRef.current;
    if (!el) return;
    const setCover = usePlayground.getState().setCoverLeft;
    const measure = () => setCover(el.offsetLeft + el.offsetWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => {
      ro.disconnect();
      setCover(0);
    };
  }, []);

  // Live preview. Items are swapped without touching undo history; `shown` is what we last put on the canvas, so
  // anything else changing the items (a drag, an undo) is left alone when the preview is taken back.
  const ids = useRef(selected);
  const base = useRef(usePlayground.getState().items);
  const shown = useRef<typeof base.current | null>(null);
  const dirty = useRef(false);
  const kept = useRef(false);
  const revert = () => {
    if (shown.current && usePlayground.getState().items === shown.current) usePlayground.setState({ items: base.current });
    shown.current = null;
  };
  useEffect(() => {
    if (!dirty.current) return;
    revert();
    if (!(gapInches >= 0)) return;
    const next = spacedItems(base.current, ids.current, gapInches);
    if (next !== base.current) {
      usePlayground.setState({ items: next });
      shown.current = next;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gapInches]);
  useEffect(
    () => () => {
      if (!kept.current) revert();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // Close when the selection no longer holds two or more items, or another panel takes the left side.
  const same = selected.length === ids.current.length && selected.every((id) => ids.current.includes(id));
  useEffect(() => {
    if (!same || searchOpen) setSpacingOpen(false);
  }, [same, searchOpen, setSpacingOpen]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setSpacingOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setSpacingOpen]);

  const edit = (v: string) => {
    dirty.current = true;
    setValue(v);
  };
  const pick = (which: 1 | 2, id: string | null) => {
    const a = which === 1 ? id : plug1;
    const b = which === 2 ? id : plug2;
    if (which === 1) setPlug1(id);
    else setPlug2(id);
    if (a || b) edit(fmt((mmOf(a) + mmOf(b)) / MM_PER_INCH));
  };
  const changeUnits = (u: Units) => {
    if (u === units) return;
    if (gap >= 0) setValue(fmt(gapInches, u));
    setUnits(u);
  };
  const toggleGuide = () =>
    setGuideOpen((o) => {
      try {
        localStorage.setItem("pp:plug-guide", o ? "closed" : "open");
      } catch {
        /* storage unavailable */
      }
      return !o;
    });
  const apply = () => {
    if (!(gapInches >= 0)) return;
    revert();
    kept.current = true;
    spaceByGap(gapInches);
    setSpacingOpen(false);
  };

  const cell = (on: boolean) =>
    `h-7 rounded-[5px] text-xs outline-none focus-visible:ring-2 focus-visible:ring-brand ${on ? "bg-brand/15 font-medium text-brand" : "bg-surface-hover text-ink hover:bg-ink/10"}`;
  const size = (mm: number) => (units === "mm" ? `${mm} mm` : `${(mm / MM_PER_INCH).toFixed(2)} in`);

  return (
    <div
      ref={dockRef}
      role="dialog"
      aria-label="Space Between"
      className="animate-dock absolute left-3 top-3 z-40 flex w-[min(280px,calc(100%-1.5rem))] flex-col rounded-panel bg-surface p-4 shadow-panel"
    >
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold">Space Between</h2>
        <button
          type="button"
          onClick={() => setSpacingOpen(false)}
          aria-label="Close"
          className="grid size-8 place-items-center rounded-control text-ink-muted outline-none hover:bg-surface-hover hover:text-ink focus-visible:ring-2 focus-visible:ring-brand"
        >
          <X size={16} />
        </button>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          apply();
        }}
      >
        <div className="mb-1 flex items-center justify-between">
          <label htmlFor="space-between-gap" className="text-xs text-ink-muted">
            Spacing
          </label>
          <div role="radiogroup" aria-label="Units" className="flex rounded-control bg-surface-hover p-0.5 text-[11px] font-medium">
            {(["in", "mm"] as const).map((u) => (
              <button
                key={u}
                type="button"
                role="radio"
                aria-checked={units === u}
                onClick={() => changeUnits(u)}
                className={`rounded-[3px] px-1.5 py-0.5 outline-none focus-visible:ring-2 focus-visible:ring-brand ${units === u ? "bg-surface text-ink shadow-sm" : "text-ink-muted hover:text-ink"}`}
              >
                {u}
              </button>
            ))}
          </div>
        </div>
        <label className="mb-3 flex h-9 items-center gap-1 rounded-control bg-surface-hover px-3 focus-within:ring-2 focus-within:ring-brand">
          <input
            id="space-between-gap"
            autoFocus
            inputMode="decimal"
            {...plainField}
            value={value}
            onChange={(e) => edit(e.target.value)}
            onFocus={(e) => e.target.select()}
            className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none"
          />
          <span aria-hidden className="text-sm text-ink-muted">
            {units}
          </span>
        </label>

        <button
          type="button"
          onClick={toggleGuide}
          aria-expanded={guideOpen}
          className="mb-1 flex w-full items-center gap-1 rounded-[5px] text-xs text-ink-muted outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-brand"
        >
          <ChevronDown size={14} className={guideOpen ? "" : "-rotate-90"} />
          Plug guide
        </button>
        {guideOpen && (
          <div className="mb-3 rounded-control bg-surface-hover/60 p-2">
            <p className="mb-1 text-[11px] leading-snug text-ink-muted">
              Pedal sizes already include their jacks, so you only need room for the plugs. Pick two where jacks face each other.
            </p>
            <PlugDrawing left={PLUGS.find((p) => p.id === plug1) ?? PLUGS[1]} right={PLUGS.find((p) => p.id === plug2) ?? null} />
            <div className="mt-1 grid grid-cols-[3.5rem_1fr_1fr] items-center gap-1 text-[11px] text-ink-muted">
              <span />
              <span className="text-center">Plug 1</span>
              <span className="text-center">Plug 2</span>
              {PLUGS.map((p) => (
                <div key={p.id} className="contents">
                  <span className="truncate">{p.name}</span>
                  <button type="button" aria-pressed={plug1 === p.id} onClick={() => pick(1, plug1 === p.id ? null : p.id)} className={cell(plug1 === p.id)}>
                    {size(p.mm)}
                  </button>
                  <button type="button" aria-pressed={plug2 === p.id} onClick={() => pick(2, plug2 === p.id ? null : p.id)} className={cell(plug2 === p.id)}>
                    {size(p.mm)}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
        <button type="submit" disabled={!(gapInches >= 0)} className="h-9 w-full btn-primary disabled:opacity-50">
          Apply
        </button>
      </form>
    </div>
  );
}
