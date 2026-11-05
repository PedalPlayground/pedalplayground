import { Check as CheckIcon, ImageUp, TriangleAlert } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { fieldError, fieldHelp, fieldInput as inputClass, fieldLabel as labelClass, fieldUnit, fieldWithUnit, fieldWithUnitInput } from "../components/formText";
import { ScaleKey } from "../components/ScaleKey";
import { canvasImageUrl, type Manifest } from "../lib/catalog";
import { PX_PER_INCH } from "../lib/geometry";
import { dotGridStyle } from "../lib/scale";
import { brandSpelling, brandSuggestions, catalogBrands, imageStats, runChecks, sameBrand, type Fields, type ImageStats } from "../lib/editorChecks";
import { plainField } from "../lib/inputProps";
import { PEDAL_TYPES, VOLTAGES } from "../lib/specs";

/** Pixels per inch for the side-by-side preview. */
const PREVIEW_PPI = 28;
/** The preview's scale as a canvas zoom level, for its dots and scale key. */
const PREVIEW_ZOOM = PREVIEW_PPI / PX_PER_INCH;
/** The preview's size before one is entered: a typical pedal (inches). */
const PLACEHOLDER_IN = [2.9, 5.1] as const;

/** Editor forms use the site's form pieces: fields, labels, help under the label, errors under the field. */
export { fieldBox, fieldError, fieldHelp, fieldInput as inputClass, fieldLabel as labelClass } from "../components/formText";
/** The site's button sizes (36px, 14px text), as in the account dialogs. */
export const primaryButton = "btn-primary h-9 px-3 disabled:opacity-50";
export const secondaryButton =
  "press h-9 rounded-control bg-surface-hover px-3 text-sm font-medium text-ink outline-none hover:bg-ink/10 focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50";

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
  const id = useId();
  // Every brand in the catalog (pedals and pedalboards), for the Brand field's suggestions.
  const brands = useMemo(() => (manifest ? catalogBrands([...manifest.pedals, ...manifest.pedalboards]) : []), [manifest]);
  const checks = useMemo(() => runChecks(fields, stats, list, skipImage), [fields, stats, list, skipImage]);
  const neighbours = useMemo(() => sameBrand(list, fields, 3, skipImage), [list, fields, skipImage]);

  return (
    <div className="grid gap-5 md:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
      <div className="grid content-start gap-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass} htmlFor={`${id}-kind`}>Kind</label>
            <select
              id={`${id}-kind`}
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
            <label className={labelClass} htmlFor={`${id}-brand`}>Brand</label>
            <BrandField id={`${id}-brand`} value={fields.brand} brands={brands} onChange={(brand) => set({ brand })} />
          </div>
        </div>
        <div>
          <label className={labelClass} htmlFor={`${id}-name`}>Name</label>
          <input id={`${id}-name`} {...plainField} className={inputClass} value={fields.name} onChange={(e) => set({ name: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass} htmlFor={`${id}-width`}>Width</label>
            <label className={fieldWithUnit}>
              <input
                aria-label="Width (in)"
                id={`${id}-width`}
                {...plainField}
                className={fieldWithUnitInput}
                inputMode="decimal"
                defaultValue={fields.width || ""}
                onChange={(e) => set({ width: num(e.target.value) })}
              />
              <span aria-hidden className={fieldUnit}>
                in
              </span>
            </label>
          </div>
          <div>
            <label className={labelClass} htmlFor={`${id}-height`}>Height</label>
            <label className={fieldWithUnit}>
              <input
                aria-label="Height (in)"
                id={`${id}-height`}
                {...plainField}
                className={fieldWithUnitInput}
                inputMode="decimal"
                defaultValue={fields.height || ""}
                onChange={(e) => set({ height: num(e.target.value) })}
              />
              <span aria-hidden className={fieldUnit}>
                in
              </span>
            </label>
          </div>
        </div>
        {fields.kind === "pedal" && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass} htmlFor={`${id}-ma`}>Current Draw</label>
                <label className={fieldWithUnit}>
                  <input
                    aria-label="Current Draw (mA)"
                    id={`${id}-ma`}
                    {...plainField}
                    className={fieldWithUnitInput}
                    inputMode="numeric"
                    defaultValue={fields.ma ?? ""}
                    onChange={(e) => {
                      const v = e.target.value.trim();
                      set({ ma: v ? Math.round(num(v)) : undefined });
                    }}
                  />
                  <span aria-hidden className={fieldUnit}>
                    mA
                  </span>
                </label>
              </div>
              <div>
                <label className={labelClass} htmlFor={`${id}-voltage`}>Voltage</label>
                <select id={`${id}-voltage`} className={inputClass} value={fields.voltage ?? ""} onChange={(e) => set({ voltage: e.target.value || undefined })}>
                  <option value="">Unknown</option>
                  {VOLTAGES.map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className={labelClass} htmlFor={`${id}-type`}>Type</label>
              <select id={`${id}-type`} className={inputClass} value={fields.type ?? ""} onChange={(e) => set({ type: e.target.value || undefined })}>
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
            <span className={labelClass}>Photo</span>
            <span className={fieldHelp}>PNG with a transparent background, ideally. 10 MB at most.</span>
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
          </div>
        )}
      </div>

      <div className="grid content-start gap-4">
        {/* Like the canvas: its color, its ½ in dots and its scale key, at the preview's scale. */}
        <div className="overflow-x-auto rounded-lg border border-line bg-canvas p-4" style={dotGridStyle(PREVIEW_ZOOM, "in", 16, 16)}>
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
          <ScaleKey zoom={PREVIEW_ZOOM} units="in" className="mt-3" />
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
  // No size yet: a typical pedal's size, so the box and its "No photo" read cleanly above the caption.
  const sized = w > 0 && h > 0;
  const pw = sized ? Math.max(8, w * PREVIEW_PPI) : PLACEHOLDER_IN[0] * PREVIEW_PPI;
  const ph = sized ? Math.max(8, h * PREVIEW_PPI) : PLACEHOLDER_IN[1] * PREVIEW_PPI;
  return (
    <figure className="flex shrink-0 flex-col items-center gap-1.5">
      <div
        className={`relative ${highlight ? "outline-2 outline-offset-2 outline-dashed outline-brand/60" : ""}`}
        style={{ width: pw, height: ph }}
      >
        {src && !broken ? (
          <img src={src} alt="" className="absolute inset-0 size-full" style={{ objectFit: "fill" }} />
        ) : (
          <div className="absolute inset-0 grid place-items-center overflow-hidden rounded bg-ink/10 px-1 text-center text-[11px] leading-tight text-ink-muted">
            {broken ? "Can't load" : "No photo"}
          </div>
        )}
      </div>
      <figcaption className="max-w-[140px] truncate text-center text-[11px] text-ink-muted" title={label}>
        {label}
        <span className="block tabular-nums">{sized ? `${+w.toFixed(3)} × ${+h.toFixed(3)} in` : "No size yet"}</span>
      </figcaption>
    </figure>
  );
}

/**
 * Brand, with suggestions from the catalog as you type (matching ignores case, spaces and punctuation), so a brand
 * doesn't get added twice with another spelling. A brand the catalog spells differently gets a note and a fix.
 */
function BrandField({ id, value, brands, onChange }: { id: string; value: string; brands: string[]; onChange: (brand: string) => void }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const list = open ? brandSuggestions(value, brands).filter((b) => b !== value.trim()) : [];
  const spelling = brandSpelling(value, brands);
  const pick = (brand: string) => {
    onChange(brand);
    setOpen(false);
    setActive(-1);
  };
  return (
    <div className="relative">
      <input
        id={id}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={list.length > 0}
        aria-controls={`${id}-list`}
        aria-activedescendant={active >= 0 && list[active] ? `${id}-option-${active}` : undefined}
        aria-describedby={spelling ? `${id}-spelling` : undefined}
        {...plainField}
        className={inputClass}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (!list.length) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => (a + 1) % list.length);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => (a <= 0 ? list.length - 1 : a - 1));
          } else if (e.key === "Enter" && active >= 0) {
            e.preventDefault();
            pick(list[active]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      {list.length > 0 && (
        <ul id={`${id}-list`} role="listbox" className="absolute inset-x-0 top-full z-20 mt-1 max-h-60 overflow-y-auto rounded-panel bg-surface p-1 shadow-panel">
          {list.map((b, i) => (
            <li
              key={b}
              id={`${id}-option-${i}`}
              role="option"
              aria-selected={i === active}
              // Before the field's blur closes the list.
              onMouseDown={(e) => {
                e.preventDefault();
                pick(b);
              }}
              className={`cursor-pointer rounded-control px-2.5 py-1.5 text-sm ${i === active ? "bg-surface-hover" : "hover:bg-surface-hover"}`}
            >
              {b}
            </li>
          ))}
        </ul>
      )}
      {spelling && (
        <span id={`${id}-spelling`} className={fieldError}>
          The catalog spells it {spelling}.{" "}
          <button type="button" className="font-semibold underline" onClick={() => onChange(spelling)}>
            Use {spelling}
          </button>
        </span>
      )}
    </div>
  );
}
