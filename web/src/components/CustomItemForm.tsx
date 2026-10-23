import { useState } from "react";
import { DEFAULT_PEDAL_COLOR, PEDAL_COLOR_PRESETS } from "../lib/color";
import { usePlayground } from "../store/playground";
import { useUi } from "../store/ui";

const MM_PER_INCH = 25.4;
const MAX_INCHES = 60;

const field =
  "h-9 w-full rounded-control border border-line bg-surface px-3 text-sm outline-none focus:border-brand placeholder:text-ink-muted";

export function CustomItemForm({ onDone }: { onDone: () => void }) {
  const units = useUi((u) => u.units);
  const add = usePlayground((s) => s.addCustomItem);
  const [kind, setKind] = useState<"pedal" | "pedalboard">("pedal");
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");
  const [name, setName] = useState("");
  const [color, setColor] = useState(DEFAULT_PEDAL_COLOR);
  const [error, setError] = useState<string | null>(null);

  const unitLabel = units === "mm" ? "mm" : "in";
  const toInches = (v: number) => (units === "mm" ? v / MM_PER_INCH : v);
  const placeholder = kind === "pedal" ? (units === "mm" ? ["70", "108"] : ["2.75", "4.25"]) : units === "mm" ? ["610", "318"] : ["24", "12.5"];

  const submit = () => {
    const w = toInches(parseFloat(width));
    const h = toInches(parseFloat(height));
    if (!(w > 0) || !(h > 0)) return setError("Enter a width and height greater than zero.");
    if (w > MAX_INCHES || h > MAX_INCHES) return setError(`That's larger than ${MAX_INCHES} in. Check the units.`);
    add({ kind, width: w, height: h, label: kind === "pedal" ? name.trim() : "Custom pedalboard", color });
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
      <div className="flex gap-1">
        {(["pedal", "pedalboard"] as const).map((k) => (
          <button
            type="button"
            key={k}
            onClick={() => setKind(k)}
            className={`flex-1 rounded-control py-1.5 text-sm ${kind === k ? "bg-brand/10 text-brand" : "text-ink-muted hover:bg-surface-hover"}`}
          >
            {k === "pedal" ? "Pedal" : "Pedalboard"}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-ink-muted">
          Width ({unitLabel})
          <input className={`${field} mt-1`} inputMode="decimal" value={width} placeholder={placeholder[0]} onChange={(e) => setWidth(e.target.value)} autoFocus />
        </label>
        <label className="text-xs text-ink-muted">
          Height ({unitLabel})
          <input className={`${field} mt-1`} inputMode="decimal" value={height} placeholder={placeholder[1]} onChange={(e) => setHeight(e.target.value)} />
        </label>
      </div>

      {kind === "pedal" && (
        <>
          <label className="block text-xs text-ink-muted">
            Name (optional)
            <input className={`${field} mt-1`} value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
          </label>
          <div>
            <div className="mb-1 text-xs text-ink-muted">Color</div>
            <div className="flex flex-wrap items-center gap-1.5">
              {PEDAL_COLOR_PRESETS.map((c) => (
                <button
                  type="button"
                  key={c}
                  aria-label={`Color ${c}`}
                  onClick={() => setColor(c)}
                  className={`size-6 rounded-full ring-offset-2 ring-offset-surface ${color === c ? "ring-2 ring-brand" : "ring-1 ring-line"}`}
                  style={{ background: c }}
                />
              ))}
              <input type="color" aria-label="Custom color" value={color} onChange={(e) => setColor(e.target.value)} className="size-6 cursor-pointer rounded border-0 bg-transparent p-0" />
            </div>
          </div>
        </>
      )}

      {error && <p className="text-sm text-danger">{error}</p>}
      <button type="submit" className="h-9 w-full rounded-control bg-brand text-sm font-medium text-brand-ink hover:bg-brand-hover">
        Add custom {kind}
      </button>
    </form>
  );
}
