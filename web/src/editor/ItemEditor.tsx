import { Check as CheckIcon, ImageUp, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { canvasImageUrl, type Manifest } from "../lib/catalog";
import { imageStats, runChecks, sameBrand, type Fields, type ImageStats } from "../lib/editorChecks";
import { plainField } from "../lib/inputProps";
import { PEDAL_TYPES, VOLTAGES } from "../lib/specs";

/** Pixels per inch for the side-by-side preview. */
const PREVIEW_PPI = 28;

export const inputClass =
  "h-8 w-full rounded-[5px] border border-line bg-surface px-2 text-[13px] text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/25";
export const labelClass = "mb-1 block text-xs text-ink-muted";
export const primaryButton = "btn-primary h-8 rounded-[5px] px-3 text-[13px] disabled:opacity-50";
export const secondaryButton =
  "press h-8 rounded-[5px] border border-line bg-surface px-3 text-[13px] font-medium text-ink hover:bg-surface-hover disabled:opacity-50";

const num = (s: string) => {
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
};

/**
 * The fields of one item, its photo at canvas scale beside same-brand pedals, and the automatic checks.
 * `image` is the photo to show (a new file's object URL, or a signed link to the current source).
 */
export function ItemEditor({
  fields,
  onChange,
  image,
  onPickFile,
  manifest,
  skipImage,
  lockKind,
}: {
  fields: Fields;
  onChange: (f: Fields) => void;
  image: string | null;
  onPickFile?: (file: File) => void;
  manifest: Manifest | null;
  /** The item's own image key, so it isn't flagged as its own duplicate. */
  skipImage?: string;
  lockKind?: boolean;
}) {
  const [stats, setStats] = useState<ImageStats | null>(null);
  const [imageError, setImageError] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const set = (patch: Partial<Fields>) => onChange({ ...fields, ...patch });

  useEffect(() => {
    setStats(null);
    setImageError(false);
    if (!image) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => setStats(imageStats(img));
    img.onerror = () => setImageError(true);
    img.src = image;
  }, [image]);

  const list = manifest ? (fields.kind === "pedal" ? manifest.pedals : manifest.pedalboards) : [];
  const checks = useMemo(() => runChecks(fields, stats, list, skipImage), [fields, stats, list, skipImage]);
  const neighbours = useMemo(() => sameBrand(list, fields, 3, skipImage), [list, fields, skipImage]);

  return (
    <div className="grid gap-5 md:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
      <div className="grid content-start gap-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Kind</label>
            <select
              className={inputClass}
              value={fields.kind}
              disabled={lockKind}
              onChange={(e) => set({ kind: e.target.value as Fields["kind"], type: undefined })}
            >
              <option value="pedal">Pedal</option>
              <option value="pedalboard">Pedalboard</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Brand</label>
            <input {...plainField} className={inputClass} value={fields.brand} onChange={(e) => set({ brand: e.target.value })} />
          </div>
        </div>
        <div>
          <label className={labelClass}>Name</label>
          <input {...plainField} className={inputClass} value={fields.name} onChange={(e) => set({ name: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Width (in)</label>
            <input
              {...plainField}
              className={inputClass}
              inputMode="decimal"
              defaultValue={fields.width || ""}
              onChange={(e) => set({ width: num(e.target.value) })}
            />
          </div>
          <div>
            <label className={labelClass}>Height (in)</label>
            <input
              {...plainField}
              className={inputClass}
              inputMode="decimal"
              defaultValue={fields.height || ""}
              onChange={(e) => set({ height: num(e.target.value) })}
            />
          </div>
        </div>
        {fields.kind === "pedal" && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Current draw (mA)</label>
                <input
                  {...plainField}
                  className={inputClass}
                  inputMode="numeric"
                  defaultValue={fields.ma ?? ""}
                  onChange={(e) => {
                    const v = e.target.value.trim();
                    set({ ma: v ? Math.round(num(v)) : undefined });
                  }}
                />
              </div>
              <div>
                <label className={labelClass}>Voltage</label>
                <select className={inputClass} value={fields.voltage ?? ""} onChange={(e) => set({ voltage: e.target.value || undefined })}>
                  <option value="">Unknown</option>
                  {VOLTAGES.map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className={labelClass}>Type</label>
              <select className={inputClass} value={fields.type ?? ""} onChange={(e) => set({ type: e.target.value || undefined })}>
                <option value="">Unknown</option>
                {PEDAL_TYPES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </div>
          </>
        )}
        {onPickFile && (
          <div>
            <input
              ref={fileInput}
              type="file"
              accept="image/png,image/webp,image/jpeg"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onPickFile(f);
                e.target.value = "";
              }}
            />
            <button type="button" className={`${secondaryButton} flex items-center gap-1.5`} onClick={() => fileInput.current?.click()}>
              <ImageUp size={15} /> {image ? "Replace photo" : "Choose photo"}
            </button>
            <p className="mt-1 text-xs text-ink-muted">PNG with a transparent background, ideally. 10 MB at most.</p>
          </div>
        )}
      </div>

      <div className="grid content-start gap-4">
        <div className="overflow-x-auto rounded-lg border border-line bg-canvas p-4">
          <div className="flex min-h-24 items-end gap-5">
            <Figure label="This one" src={image} w={fields.width} h={fields.height} highlight broken={imageError} />
            {neighbours.map((n) => (
              <Figure
                key={n.image}
                label={n.name}
                src={canvasImageUrl(manifest, fields.kind, n.image)}
                w={n.width}
                h={n.height}
              />
            ))}
          </div>
          <p className="mt-3 text-xs text-ink-muted">
            Drawn at the same scale, stretched to the entered size. A photo that looks squashed, or a size far off its
            neighbours, means a wrong number.
          </p>
        </div>
        <ul className="grid gap-1.5">
          {checks.map((c) => (
            <li key={c.text} className={`flex items-start gap-2 text-[13px] ${c.ok ? "text-ink-muted" : "text-ink"}`}>
              {c.ok ? (
                <CheckIcon size={15} className="mt-0.5 shrink-0 text-[#12a150]" />
              ) : (
                <TriangleAlert size={15} className="mt-0.5 shrink-0 text-[#d97706]" />
              )}
              <span>{c.text}</span>
            </li>
          ))}
          {!image && <li className="text-[13px] text-ink-muted">Add a photo to run the photo checks.</li>}
        </ul>
      </div>
    </div>
  );
}

function Figure({ label, src, w, h, highlight, broken }: { label: string; src: string | null; w: number; h: number; highlight?: boolean; broken?: boolean }) {
  const pw = Math.max(8, w * PREVIEW_PPI);
  const ph = Math.max(8, h * PREVIEW_PPI);
  return (
    <figure className="flex shrink-0 flex-col items-center gap-1.5">
      <div
        className={`relative ${highlight ? "outline-2 outline-offset-2 outline-dashed outline-brand/60" : ""}`}
        style={{ width: pw, height: ph }}
      >
        {src && !broken ? (
          <img src={src} alt="" className="absolute inset-0 size-full" style={{ objectFit: "fill" }} />
        ) : (
          <div className="absolute inset-0 grid place-items-center rounded bg-ink/10 text-[11px] text-ink-muted">
            {broken ? "Can't load" : "No photo"}
          </div>
        )}
      </div>
      <figcaption className="max-w-[140px] truncate text-center text-[11px] text-ink-muted" title={label}>
        {label}
        <span className="block tabular-nums">
          {+w.toFixed(3)} × {+h.toFixed(3)} in
        </span>
      </figcaption>
    </figure>
  );
}
