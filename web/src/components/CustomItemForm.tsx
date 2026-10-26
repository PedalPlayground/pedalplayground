import { useState } from "react";
import { DEFAULT_PEDAL_COLOR, PEDAL_COLOR_PRESETS } from "../lib/color";
import { PX_PER_INCH } from "../lib/geometry";
import { DEFAULT_PEDAL_TEMPLATE, PEDAL_TEMPLATES, templateInfo, type PedalTemplate } from "../lib/pedalTemplates";
import type { Item } from "../lib/types";
import { usePlayground } from "../store/playground";
import { useUi } from "../store/ui";
import { CustomBoard } from "./CustomItem";
import { PedalArt } from "./PedalArt";
import { tip } from "./Tooltip";

const MM_PER_INCH = 25.4;
const MAX_INCHES = 60;
/** Suggested custom pedalboard size, in inches. */
const BOARD_SIZE = { width: 24, height: 12.5 };

const field =
  "h-9 w-full rounded-control border border-line bg-surface px-3 text-sm outline-none focus:border-brand placeholder:text-ink-muted max-sm:text-base";

/** Draws a custom pedal or board at its real size, scaled down to fit a `boxW` × `boxH` px box. */
function Preview({
  kind,
  template,
  width,
  height,
  color,
  label,
  boxW,
  boxH,
}: {
  kind: Item["kind"];
  template?: PedalTemplate;
  width: number;
  height: number;
  color: string;
  label: string;
  boxW: number;
  boxH: number;
}) {
  const w = width * PX_PER_INCH;
  const h = height * PX_PER_INCH;
  const scale = Math.min(boxW / w, boxH / h);
  return (
    <div className="grid place-items-center" style={{ width: boxW, height: boxH }}>
      <div style={{ width: w * scale, height: h * scale }} className="relative transition-[width,height] duration-200 ease-out">
        <div className="absolute left-0 top-0 origin-top-left" style={{ width: w, height: h, transform: `scale(${scale})` }}>
          {kind === "pedalboard" ? <CustomBoard /> : <PedalArt template={template} w={w} h={h} color={color} label={label} />}
        </div>
      </div>
    </div>
  );
}

/** Adds a custom pedal or pedalboard, or with `item`, edits that one. */
export function CustomItemForm({ onDone, item }: { onDone: () => void; item?: Item }) {
  const units = useUi((u) => u.units);
  const add = usePlayground((s) => s.addCustomItem);
  const update = usePlayground((s) => s.updateCustomItem);
  const toUnits = (inches: number) => (units === "mm" ? String(Math.round(inches * MM_PER_INCH)) : String(+inches.toFixed(3)));

  const [kind, setKind] = useState<Item["kind"]>(item?.kind ?? "pedal");
  const [template, setTemplate] = useState<PedalTemplate>(item ? (item.template ?? "classic") : DEFAULT_PEDAL_TEMPLATE);
  const [width, setWidth] = useState(item ? toUnits(item.width) : "");
  const [height, setHeight] = useState(item ? toUnits(item.height) : "");
  const [name, setName] = useState(item?.kind === "pedal" ? item.label : "");
  const [color, setColor] = useState(item?.color ?? DEFAULT_PEDAL_COLOR);
  const [error, setError] = useState<string | null>(null);

  const unitLabel = units === "mm" ? "mm" : "in";
  const toInches = (v: number) => (units === "mm" ? v / MM_PER_INCH : v);
  // Empty size fields mean the suggested size for the template (or board), shown as the placeholder.
  const suggested = kind === "pedal" ? templateInfo(template) : BOARD_SIZE;
  const placeholder = [toUnits(suggested.width), toUnits(suggested.height)];
  const w = width.trim() ? toInches(parseFloat(width)) : suggested.width;
  const h = height.trim() ? toInches(parseFloat(height)) : suggested.height;
  const sizeOk = w > 0 && h > 0 && w <= MAX_INCHES && h <= MAX_INCHES;

  const submit = () => {
    if (!(w > 0) || !(h > 0)) return setError("Enter a width and height greater than zero.");
    if (w > MAX_INCHES || h > MAX_INCHES) return setError(`That's larger than ${MAX_INCHES} in. Check the units.`);
    const fields = {
      width: w,
      height: h,
      label: kind === "pedal" ? name.trim() : "Custom Pedalboard",
      color: kind === "pedal" ? color : null,
      template: kind === "pedal" ? template : undefined,
    };
    if (item) update(item.id, fields);
    else add({ kind, ...fields });
    onDone();
  };

  return (
    <form
      className="space-y-3 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      {!item && (
        <div className="flex gap-1">
          {(["pedal", "pedalboard"] as const).map((k) => (
            <button
              type="button"
              key={k}
              onClick={() => {
                setKind(k);
                setError(null);
              }}
              className={`flex-1 rounded-control py-1.5 text-sm ${kind === k ? "bg-brand/10 text-brand" : "text-ink-muted hover:bg-surface-hover"}`}
            >
              {k === "pedal" ? "Pedal" : "Pedalboard"}
            </button>
          ))}
        </div>
      )}

      {kind === "pedal" && (
        <div>
          <div className="mb-1 text-xs text-ink-muted">Style</div>
          <div className="grid grid-cols-3 gap-1.5">
            {PEDAL_TEMPLATES.map((t) => (
              <button
                type="button"
                key={t.id}
                aria-pressed={template === t.id}
                {...tip(t.hint)}
                onClick={() => setTemplate(t.id)}
                className={`press flex flex-col items-center gap-1 rounded-control border px-1 pb-1.5 pt-2 text-xs transition-colors ${
                  template === t.id ? "border-brand bg-brand/10 text-brand" : "border-line text-ink hover:bg-surface-hover"
                }`}
              >
                <Preview kind="pedal" template={t.id} width={t.width} height={t.height} color={color} label="" boxW={72} boxH={44} />
                <span className="truncate font-medium">{t.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-3">
        <div className="grid shrink-0 place-items-center rounded-control bg-canvas" style={{ width: 112, height: kind === "pedal" ? 140 : 92 }}>
          {sizeOk ? (
            <Preview kind={kind} template={template} width={w} height={h} color={color} label={name.trim()} boxW={96} boxH={kind === "pedal" ? 124 : 76} />
          ) : (
            <span className="px-2 text-center text-xs text-ink-muted">Check the size</span>
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-ink-muted">
              Width ({unitLabel})
              <input className={`${field} mt-1`} inputMode="decimal" value={width} placeholder={placeholder[0]} onChange={(e) => setWidth(e.target.value)} autoFocus={!item} />
            </label>
            <label className="text-xs text-ink-muted">
              Height ({unitLabel})
              <input className={`${field} mt-1`} inputMode="decimal" value={height} placeholder={placeholder[1]} onChange={(e) => setHeight(e.target.value)} />
            </label>
          </div>
          {kind === "pedal" && (
            <label className="block text-xs text-ink-muted">
              Name (optional)
              <input className={`${field} mt-1`} value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
            </label>
          )}
        </div>
      </div>

      {kind === "pedal" && (
        <div>
          <div className="mb-1 text-xs text-ink-muted">Color</div>
          <div className="flex flex-wrap items-center gap-1.5">
            {PEDAL_COLOR_PRESETS.map((c) => (
              <button
                type="button"
                key={c.hex}
                aria-label={c.name}
                aria-pressed={color === c.hex}
                {...tip(c.name)}
                onClick={() => setColor(c.hex)}
                className={`press size-6 rounded-full shadow-[inset_0_1px_0_rgb(255_255_255/0.35),inset_0_-1px_1px_rgb(0_0_0/0.25)] ring-offset-2 ring-offset-surface ${color === c.hex ? "ring-2 ring-brand" : "ring-1 ring-black/15"}`}
                style={{ background: c.hex }}
              />
            ))}
            <input type="color" aria-label="Custom color" value={color} onChange={(e) => setColor(e.target.value)} className="size-6 cursor-pointer rounded border-0 bg-transparent p-0" />
          </div>
        </div>
      )}

      {error && <p className="text-sm text-danger">{error}</p>}
      <button type="submit" className="h-9 w-full btn-primary">
        {item ? "Save Changes" : kind === "pedal" ? "Add Custom Pedal" : "Add Custom Pedalboard"}
      </button>
    </form>
  );
}
