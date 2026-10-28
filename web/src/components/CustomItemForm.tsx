import { Check } from "lucide-react";
import { useState } from "react";
import { NEW_PEDAL_COLOR, PEDAL_COLOR_PRESETS, readableOn } from "../lib/color";
import { PX_PER_INCH } from "../lib/geometry";
import {
  DEFAULT_PEDAL_TEMPLATE,
  hasSideJacks,
  hasTopJacks,
  JACK_DEPTH,
  PEDAL_TEMPLATES,
  templateInfo,
  withJacks,
  withoutJacks,
  type Jacks,
  type PedalTemplate,
} from "../lib/pedalTemplates";
import { formatSize } from "../lib/units";
import type { Item } from "../lib/types";
import { usePlayground } from "../store/playground";
import { useUi } from "../store/ui";
import { CustomBoard } from "./CustomItem";
import { PedalArt } from "./PedalArt";
import { tip } from "./Tooltip";
import { plainField } from "../lib/inputProps";

const MM_PER_INCH = 25.4;
const MAX_INCHES = 60;
/** Suggested custom pedalboard size, in inches. */
const BOARD_SIZE = { width: 24, height: 12.5 };

/** Shaded, borderless fields, like the rest of the app's forms. */
const field =
  "h-9 w-full rounded-control bg-surface-hover px-3 text-sm outline-none placeholder:text-ink-muted/70 focus:ring-2 focus:ring-brand max-sm:text-base";

/** Draws a custom pedal or board at its real size, scaled down to fit a `boxW` × `boxH` px box. */
function Preview({
  kind,
  template,
  jacks,
  width,
  height,
  color,
  label,
  boxW,
  boxH,
}: {
  kind: Item["kind"];
  template?: PedalTemplate;
  jacks?: Jacks;
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
          {kind === "pedalboard" ? <CustomBoard /> : <PedalArt template={template} jacks={jacks} w={w} h={h} color={color} label={label} />}
        </div>
      </div>
    </div>
  );
}

/**
 * Adds a custom pedal or pedalboard, or with `item`, edits that one. `initialKind` and `initialName` prefill a new
 * one, e.g. from a search that found nothing.
 */
export function CustomItemForm({
  onDone,
  onBack,
  item,
  initialKind,
  initialName,
}: {
  onDone: () => void;
  /** Shows a Back to Search button under the submit button. */
  onBack?: () => void;
  item?: Item;
  initialKind?: Item["kind"];
  initialName?: string;
}) {
  const units = useUi((u) => u.units);
  const setUnits = useUi((u) => u.setUnits);
  const add = usePlayground((s) => s.addCustomItem);
  const update = usePlayground((s) => s.updateCustomItem);
  const toUnits = (inches: number) => (units === "mm" ? String(Math.round(inches * MM_PER_INCH)) : String(+inches.toFixed(3)));

  const [kind, setKind] = useState<Item["kind"]>(item?.kind ?? initialKind ?? "pedal");
  const [template, setTemplate] = useState<PedalTemplate>(item ? (item.template ?? "classic") : DEFAULT_PEDAL_TEMPLATE);
  // The size fields are the enclosure; jacks add to the footprint on top of it.
  const enclosure = item ? withoutJacks(item.width, item.height, item.jacks) : null;
  const [width, setWidth] = useState(enclosure ? toUnits(enclosure.width) : "");
  const [height, setHeight] = useState(enclosure ? toUnits(enclosure.height) : "");
  const initialJacks = item ? item.jacks : (templateInfo(DEFAULT_PEDAL_TEMPLATE).jacks ?? undefined);
  const [jackTop, setJackTop] = useState(hasTopJacks(initialJacks));
  const [jackSide, setJackSide] = useState(hasSideJacks(initialJacks));
  // Until the user picks jacks themselves, each style brings its usual ones.
  const [jacksPicked, setJacksPicked] = useState(!!item);
  const [name, setName] = useState(item ? (item.kind === "pedal" ? item.label : "") : (initialName ?? ""));
  const [color, setColor] = useState(item?.color ?? NEW_PEDAL_COLOR);
  const [error, setError] = useState<string | null>(null);

  const unitLabel = units === "mm" ? "mm" : "in";
  const toInches = (v: number) => (units === "mm" ? v / MM_PER_INCH : v);
  // Empty size fields mean the suggested size for the template (or board), shown as the placeholder.
  const suggested = kind === "pedal" ? templateInfo(template) : BOARD_SIZE;
  const placeholder = [toUnits(suggested.width), toUnits(suggested.height)];
  const w = width.trim() ? toInches(parseFloat(width)) : suggested.width;
  const h = height.trim() ? toInches(parseFloat(height)) : suggested.height;
  const jacks: Jacks | undefined = kind !== "pedal" ? undefined : jackTop && jackSide ? "both" : jackTop ? "top" : jackSide ? "side" : undefined;
  const foot = withJacks(w, h, jacks);
  const sizeOk = w > 0 && h > 0 && foot.width <= MAX_INCHES && foot.height <= MAX_INCHES;
  const jackDepth = units === "mm" ? `${Math.round(JACK_DEPTH * MM_PER_INCH)} mm` : `${JACK_DEPTH}″`;

  const switchUnits = () => {
    const next = units === "mm" ? "in" : "mm";
    const convert = (v: string) => {
      const n = parseFloat(v);
      if (!v.trim() || !(n > 0)) return v;
      return next === "mm" ? String(Math.round(n * MM_PER_INCH)) : String(+(n / MM_PER_INCH).toFixed(3));
    };
    setWidth(convert(width));
    setHeight(convert(height));
    setUnits(next);
  };

  const pickTemplate = (t: PedalTemplate) => {
    setTemplate(t);
    if (jacksPicked) return;
    const j = templateInfo(t).jacks;
    setJackTop(hasTopJacks(j));
    setJackSide(hasSideJacks(j));
  };
  const jackButton = (on: boolean, set: (v: boolean) => void, text: string, hint: string) => (
    <button
      type="button"
      aria-pressed={on}
      {...tip(hint)}
      onClick={() => {
        set(!on);
        setJacksPicked(true);
      }}
      className={`press h-8 flex-1 rounded-control border text-sm transition-colors ${on ? "border-brand bg-brand/10 text-brand" : "border-line text-ink hover:bg-surface-hover"}`}
    >
      {text}
    </button>
  );

  const submit = () => {
    if (!(w > 0) || !(h > 0)) return setError("Enter a width and height greater than zero.");
    if (foot.width > MAX_INCHES || foot.height > MAX_INCHES) return setError(`That's larger than ${MAX_INCHES} in. Check the units.`);
    const fields = {
      width: foot.width,
      height: foot.height,
      jacks,
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
        <label className="block text-xs text-ink-muted">
          Name (optional)
          <input className={`${field} mt-1`} {...plainField} autoCapitalize="words" enterKeyHint="done" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} autoFocus={!item} />
        </label>
      )}

      {kind === "pedal" && (
        <div>
          <div className="mb-1 text-xs text-ink-muted">Style</div>
          {/* Just the pictures (each style's name is its accessible label). */}
          <div className="grid grid-cols-3 gap-1.5">
            {PEDAL_TEMPLATES.map((t) => (
              <button
                type="button"
                key={t.id}
                aria-label={t.name}
                aria-pressed={template === t.id}
                onClick={() => pickTemplate(t.id)}
                className={`press grid place-items-center rounded-control border p-1.5 transition-colors ${
                  template === t.id ? "border-brand bg-brand/10" : "border-line hover:bg-surface-hover"
                }`}
              >
                <Preview kind="pedal" template={t.id} jacks={t.jacks ?? undefined} {...withJacks(t.width, t.height, t.jacks)} color={color} label="" boxW={72} boxH={44} />
              </button>
            ))}
          </div>
        </div>
      )}

      {kind === "pedal" && (
        // One line: the label left, flat swatches right (a check marks the pick), the last a color wheel for any color.
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-ink-muted">Color</span>
          <div className="flex items-center gap-1">
            {PEDAL_COLOR_PRESETS.map((c) => (
              <button
                type="button"
                key={c.hex}
                aria-label={c.name}
                aria-pressed={color === c.hex}
                {...tip(c.name)}
                onClick={() => setColor(c.hex)}
                className="press grid size-[22px] place-items-center rounded-[6px] outline-none focus-visible:ring-2 focus-visible:ring-brand"
                style={{ background: c.hex, color: readableOn(c.hex) }}
              >
                {color === c.hex && <Check size={13} strokeWidth={3} />}
              </button>
            ))}
            <label
              {...tip("Any Color")}
              className="press relative grid size-[22px] cursor-pointer place-items-center rounded-[6px] text-white focus-within:ring-2 focus-within:ring-brand"
              style={{ background: "conic-gradient(#ff4d4d, #ffd84d, #4dff88, #4dd8ff, #6b4dff, #ff4dd8, #ff4d4d)" }}
            >
              {!PEDAL_COLOR_PRESETS.some((c) => c.hex === color) && (
                <span className="grid size-3.5 place-items-center rounded-full ring-2 ring-white" style={{ background: color }} />
              )}
              <input type="color" aria-label="Any color" value={color} onChange={(e) => setColor(e.target.value)} className="absolute inset-0 size-full cursor-pointer opacity-0" />
            </label>
          </div>
        </div>
      )}

      <div>
        {/* One label row (with the app-wide units switch) and one row of fields: "Width 2.6 in" "Height 4.8 in". */}
        <div className="mb-1 flex items-center justify-between">
          <span className="text-xs text-ink-muted">Dimensions</span>
          <div role="radiogroup" aria-label="Units" className="flex rounded-control bg-surface-hover p-0.5 text-[11px] font-medium">
            {(["in", "mm"] as const).map((u) => (
              <button
                key={u}
                type="button"
                role="radio"
                aria-checked={units === u}
                onClick={() => units !== u && switchUnits()}
                className={`rounded-[3px] px-1.5 py-0.5 outline-none focus-visible:ring-2 focus-visible:ring-brand ${units === u ? "bg-surface text-ink shadow-sm" : "text-ink-muted hover:text-ink"}`}
              >
                {u}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              ["Width", width, setWidth, placeholder[0], !item && kind !== "pedal"],
              ["Height", height, setHeight, placeholder[1], false],
            ] as const
          ).map(([labelText, value, set, hint, focus]) => (
            <label key={labelText} className="flex h-9 min-w-0 items-center gap-1.5 rounded-control bg-surface-hover px-2.5 focus-within:ring-2 focus-within:ring-brand">
              <span className="shrink-0 text-xs text-ink-muted">{labelText}</span>
              <input
                className="h-full min-w-0 flex-1 bg-transparent text-right text-sm outline-none placeholder:text-ink-muted/70 max-sm:text-base"
                {...plainField}
                inputMode="decimal"
                enterKeyHint="done"
                aria-label={`${labelText} (${unitLabel})`}
                value={value}
                placeholder={hint}
                onChange={(e) => set(e.target.value)}
                autoFocus={focus}
              />
              <span aria-hidden className="shrink-0 text-xs text-ink-muted">
                {unitLabel}
              </span>
            </label>
          ))}
        </div>
      </div>

      {kind === "pedal" && (
        <div>
          <div className="mb-1 text-xs text-ink-muted">Jacks</div>
          <div className="flex gap-1.5">
            {jackButton(jackTop, setJackTop, "Top", `Jacks on top add ${jackDepth} to the height`)}
            {jackButton(jackSide, setJackSide, "Sides", `Side jacks add ${jackDepth} to each side`)}
          </div>
        </div>
      )}

      {/* The preview with its name and footprint, laid out like a search result. */}
      <div className="flex items-center gap-3 p-2">
        <div className="grid size-16 shrink-0 place-items-center rounded-control bg-canvas p-1">
          {sizeOk ? (
            <Preview kind={kind} template={template} jacks={jacks} width={foot.width} height={foot.height} color={color} label={name.trim()} boxW={56} boxH={56} />
          ) : (
            <span className="text-center text-[10px] leading-tight text-ink-muted">Check the size</span>
          )}
        </div>
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium">{name.trim() || (kind === "pedal" ? "Custom Pedal" : "Custom Pedalboard")}</span>
          <span className="block truncate text-xs text-ink-muted">
            {sizeOk ? `${formatSize(foot.width, foot.height, units)}${jacks ? " with jacks" : ""}` : "Check the width and height"}
          </span>
        </span>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}
      <button type="submit" className="h-9 w-full btn-primary">
        {item ? "Save Changes" : kind === "pedal" ? "Add Custom Pedal" : "Add Custom Pedalboard"}
      </button>
      {onBack && (
        <button type="button" onClick={onBack} className="mx-auto block text-sm text-ink-muted hover:text-ink hover:underline">
          Back to Search
        </button>
      )}
    </form>
  );
}
