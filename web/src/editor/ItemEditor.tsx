import { Check as CheckIcon, ChevronLeft, ChevronRight, ImageUp, TriangleAlert } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { fieldError, fieldHelp, fieldInput as inputClass, fieldLabel as labelClass, fieldLabelText, fieldUnit, fieldWithUnit, fieldWithUnitInput } from "../components/formText";
import { ScaleKey } from "../components/ScaleKey";
import { tip } from "../components/Tooltip";
import { canvasImageUrl, thumbUrl, type Manifest } from "../lib/catalog";
import { TypeCombo } from "../components/TypeCombo";
import { FEATURED_PEDALS } from "../lib/featuredPedals";
import { fetchGearUsage } from "../lib/trending";
import { PX_PER_INCH } from "../lib/geometry";
import { dotGridStyle } from "../lib/scale";
import { brandSizes, brandSpelling, brandSuggestions, catalogBrands, copiedFields, copySources, imageStats, runChecks, type BrandSize, type Fields, type ImageStats, type Usage } from "../lib/editorChecks";
import type { CatalogItem } from "../lib/types";
import { plainField } from "../lib/inputProps";
import { VOLTAGES } from "../lib/specs";

/** Pixels per inch for the side-by-side preview. */
const PREVIEW_PPI = 28;
/** The preview's scale as a canvas zoom level, for its dots and scale key. */
const PREVIEW_ZOOM = PREVIEW_PPI / PX_PER_INCH;
/** The preview's size before one is entered: a typical pedal (inches). */
const PLACEHOLDER_IN = [2.9, 5.1] as const;
/** The size strip: each size's caption width at least, and the gap between sizes (px). */
const CAPTION_W = 104;
/** Preview figures: the caption's height under each picture, and the space between them (px), so pictures share a baseline. */
const FIGURE_CAPTION_H = 32;
const FIGURE_GAP = 6;
/** A guide line across the preview, at the new item's top or bottom. */
const guide = "pointer-events-none absolute -inset-x-6 z-10 h-px bg-guide/70";
const STRIP_GAP = 24;
/** Room kept at each side of the size strip for its arrows (px). */
const ARROW_W = 32;

/** Editor forms use the site's form pieces: fields, labels, help under the label, errors under the field. */
export { fieldBox, fieldError, fieldHelp, fieldInput as inputClass, fieldLabel as labelClass } from "../components/formText";
/** The site's button sizes (36px, 14px text), as in the account dialogs. */
export const primaryButton = "btn-primary h-9 whitespace-nowrap px-3 disabled:opacity-50";
export const secondaryButton =
  "press h-9 whitespace-nowrap rounded-control bg-surface-hover px-3 text-sm font-medium text-ink outline-none hover:bg-soft-hover focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50";

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
  /** Bumped when sizes are filled in from elsewhere (a size chip, Copy From, a preview), so the number fields redraw. */
  const [filled, setFilled] = useState(0);
  const fill = (patch: Partial<Fields>) => {
    set(patch);
    setFilled((n) => n + 1);
  };
  const [copying, setCopying] = useState(false);

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
  // How often each item gets added to playgrounds (the site's featured pedals count a little too), so chips and
  // Copy From show the pedals people know first.
  const [adds, setAdds] = useState<Map<string, number>>(new Map());
  useEffect(() => void fetchGearUsage().then(setAdds), []);
  const usage = useMemo<Usage>(() => {
    const featured = new Set<string>(FEATURED_PEDALS);
    return (i) => (adds.get(`${fields.kind}:${i.image}`) ?? 0) + (featured.has(i.image) ? 0.5 : 0);
  }, [adds, fields.kind]);
  // Every size the brand comes in, most used first, each shown by its most added pedal beside this one in the preview
  // (the item being edited left out). Clicking one copies its size.
  const sizes = useMemo(
    () => brandSizes(skipImage ? list.filter((i) => i.image !== skipImage) : list, fields.brand, 60, usage, 1),
    [list, skipImage, fields.brand, usage],
  );
  const sameSize = (w: number, h: number) => Math.abs(fields.width - w) < 0.005 && Math.abs(fields.height - h) < 0.005;

  return (
    <div className="grid gap-5 md:grid-cols-[minmax(0,400px)_minmax(0,1fr)]">
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
                key={`w${filled}`}
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
                key={`h${filled}`}
                defaultValue={fields.height || ""}
                onChange={(e) => set({ height: num(e.target.value) })}
              />
              <span aria-hidden className={fieldUnit}>
                in
              </span>
            </label>
          </div>
        </div>
        <div className="-mt-1 flex justify-end">
          <button type="button" aria-expanded={copying} onClick={() => setCopying((o) => !o)} className="text-xs font-semibold text-brand hover:underline">
            Copy From…
          </button>
        </div>
        {copying && (
          <CopyFrom
            items={list}
            brand={fields.brand}
            usage={usage}
            thumb={(i) => thumbUrl(manifest, fields.kind, i.image)}
            onPick={(from, withSpecs) => {
              fill(copiedFields(from, withSpecs));
              setCopying(false);
            }}
            onClose={() => setCopying(false)}
          />
        )}
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
                    key={`ma${filled}`}
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
              <span className={labelClass}>Types</span>
              <span className={fieldHelp}>The first is the main type. Drag to reorder.</span>
              <TypeCombo
                value={[...(fields.type ? [fields.type] : []), ...(fields.extraTypes ?? []).filter((t) => t !== fields.type)]}
                onChange={(types) => set({ type: types[0], extraTypes: types.slice(1) })}
              />
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
        <div>
          <span className={labelClass}>Size Reference</span>
          <div className="overflow-hidden rounded-panel bg-canvas px-6 pb-5 pt-14" style={dotGridStyle(PREVIEW_ZOOM, "in", 24, 0)}>
            <div className="relative flex items-end gap-8">
              {/* Guides at the new item's top and bottom, across the whole preview, to compare heights at a glance. */}
              {fields.width > 0 && fields.height > 0 && (
                <>
                  <span aria-hidden className={guide} style={{ bottom: FIGURE_CAPTION_H + FIGURE_GAP + Math.round(fields.height * PREVIEW_PPI) }} />
                  <span aria-hidden className={guide} style={{ bottom: FIGURE_CAPTION_H + FIGURE_GAP }} />
                </>
              )}
              <Figure label="This one" src={image} w={fields.width} h={fields.height} broken={imageError} />
              {sizes.length > 0 && (
                <SizeStrip
                  kind={fields.kind}
                  sizes={sizes}
                  selected={(z) => sameSize(z.width, z.height)}
                  src={(z) => canvasImageUrl(manifest, fields.kind, z.example.image)}
                  onUse={(z) => fill({ width: z.width, height: z.height })}
                />
              )}
            </div>
            <ScaleKey zoom={PREVIEW_ZOOM} units="in" className="mt-5" />
          </div>
        </div>
        <ul className="grid gap-1.5">
          {checks.map((c) => (
            <li key={c.text} className={`flex items-start gap-2 text-[13px] ${c.ok ? "text-ink-muted" : "text-ink"}`}>
              {c.ok ? (
                <CheckIcon size={15} className="mt-0.5 shrink-0 text-positive" />
              ) : (
                <TriangleAlert size={15} className="mt-0.5 shrink-0 text-warning" />
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

function Figure({
  label,
  src,
  w,
  h,
  broken,
}: {
  label: string;
  src: string | null;
  w: number;
  h: number;
  broken?: boolean;
}) {
  // No size yet: a typical pedal's size, so the box and its "No photo" read cleanly above the caption.
  const sized = w > 0 && h > 0;
  const pw = sized ? Math.max(8, w * PREVIEW_PPI) : PLACEHOLDER_IN[0] * PREVIEW_PPI;
  const ph = sized ? Math.max(8, Math.round(h * PREVIEW_PPI)) : PLACEHOLDER_IN[1] * PREVIEW_PPI;
  return (
    <figure className="flex shrink-0 flex-col items-center" style={{ gap: FIGURE_GAP }}>
      <div className="relative" style={{ width: pw, height: ph }}>
        {src && !broken ? (
          <img src={src} alt="" className="absolute inset-0 size-full" style={{ objectFit: "fill" }} />
        ) : (
          <div className="absolute inset-0 grid place-items-center overflow-hidden rounded-inner bg-soft px-1 text-center text-[11px] leading-tight text-ink-muted">
            {broken ? "Can't load" : "No photo"}
          </div>
        )}
      </div>
      <figcaption className="max-w-[140px] truncate text-center text-[11px] leading-4 text-ink-muted" style={{ height: FIGURE_CAPTION_H }} title={label}>
        {label}
        <span className="block font-semibold tabular-nums text-ink">{sized ? `${+w.toFixed(3)} × ${+h.toFixed(3)} in` : "No size yet"}</span>
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
        <ul id={`${id}-list`} role="listbox" className="absolute inset-x-0 top-full z-20 mt-1 max-h-60 overflow-y-auto rounded-panel bg-surface p-1 shadow-float">
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

/**
 * "Copy From…": find a catalog item (the brand's own first) and copy its brand and size. Power and type come too when
 * that box is ticked.
 */
function CopyFrom({
  items,
  brand,
  usage,
  thumb,
  onPick,
  onClose,
}: {
  items: CatalogItem[];
  brand: string;
  usage: Usage;
  thumb: (item: CatalogItem) => string | null;
  onPick: (from: CatalogItem, withSpecs: boolean) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const [withSpecs, setWithSpecs] = useState(false);
  const found = copySources(items, text, brand, 12, usage);
  return (
    <div className="grid gap-2 rounded-panel bg-surface p-3 ring-1 ring-chrome-line">
      <div className="flex items-center justify-between gap-2">
        <span className={fieldLabelText}>Copy From</span>
        <button type="button" onClick={onClose} className="text-xs text-ink-muted hover:text-ink">
          Cancel
        </button>
      </div>
      <input
        {...plainField}
        autoFocus
        aria-label="Search the catalog to copy from"
        placeholder="Search by brand or name"
        className={inputClass}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && onClose()}
      />
      <label className="flex items-center gap-2 text-[13px] text-ink">
        <input type="checkbox" checked={withSpecs} onChange={(e) => setWithSpecs(e.target.checked)} className="accent-[var(--color-brand)]" />
        Also copy power and type
      </label>
      {found.length === 0 ? (
        <p className="text-[13px] text-ink-muted">{text.trim() ? "Nothing matches." : "Type a brand or name."}</p>
      ) : (
        <ul className="grid max-h-56 grid-cols-1 gap-0.5 overflow-y-auto">
          {found.map((i) => (
            <li key={i.image}>
              <button
                type="button"
                onClick={() => onPick(i, withSpecs)}
                className="flex w-full items-center gap-2.5 rounded-control px-2 py-1.5 text-left text-sm hover:bg-surface-hover"
              >
                <Thumb src={thumb(i)} />
                <span className="min-w-0 flex-1 truncate">
                  <span className="text-ink-muted">{i.brand}</span> {i.name}
                </span>
                <span className="shrink-0 text-xs tabular-nums text-ink-muted">
                  {+i.width.toFixed(2)} × {+i.height.toFixed(2)} in
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** A small catalog thumbnail (fits a 24px square), for size chips and Copy From rows. */
function Thumb({ src }: { src: string | null }) {
  return (
    <span className="grid size-6 shrink-0 place-items-center">
      {src && <img src={src} alt="" loading="lazy" className="max-h-6 max-w-6 object-contain" />}
    </span>
  );
}

/**
 * The brand's sizes in the preview, most used first, each drawn at the preview's scale by its most added pedal. Split
 * into pages that fit the width (only the current page is drawn, so one huge unit doesn't stretch every page), with
 * arrows at the sides. Clicking a size copies its dimensions.
 */
function SizeStrip({
  kind,
  sizes,
  selected,
  src,
  onUse,
}: {
  kind: Fields["kind"];
  sizes: BrandSize[];
  selected: (z: BrandSize) => boolean;
  src: (z: BrandSize) => string | null;
  onUse: (z: BrandSize) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [page, setPage] = useState(0);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // A size takes its drawn width or its caption's; pages fill greedily (leaving room for the arrows), one size at least.
  const pages = useMemo(() => {
    const room = width - 2 * ARROW_W;
    const out: BrandSize[][] = [];
    let row: BrandSize[] = [];
    let used = 0;
    for (const z of sizes) {
      const w = Math.max(z.width * PREVIEW_PPI, CAPTION_W);
      if (row.length && used + STRIP_GAP + w > room) {
        out.push(row);
        row = [];
        used = 0;
      }
      used += (row.length ? STRIP_GAP : 0) + w;
      row.push(z);
    }
    if (row.length) out.push(row);
    return out;
  }, [sizes, width]);
  useEffect(() => setPage(0), [sizes]);
  const at = Math.min(page, Math.max(0, pages.length - 1));
  const arrow =
    "press absolute top-1/2 z-20 grid size-8 -translate-y-1/2 place-items-center rounded-full text-ink hover:bg-soft outline-none focus-visible:ring-2 focus-visible:ring-brand";
  const plural = kind === "pedal" ? "pedals" : "boards";

  return (
    <div ref={box} className="relative min-w-0 flex-1 self-stretch">
      {at > 0 && (
        <button type="button" aria-label="Previous sizes" {...tip("Previous")} onClick={() => setPage(at - 1)} className={`${arrow} left-0`}>
          <ChevronLeft size={20} strokeWidth={2.25} />
        </button>
      )}
      {at < pages.length - 1 && (
        <button type="button" aria-label="More sizes" {...tip("More")} onClick={() => setPage(at + 1)} className={`${arrow} right-0`}>
          <ChevronRight size={20} strokeWidth={2.25} />
        </button>
      )}
      <div className="flex h-full items-end" style={{ gap: STRIP_GAP, paddingInline: ARROW_W }}>
        {width > 0 &&
          (pages[at] ?? []).map((z) => {
            const on = selected(z);
            const url = src(z);
            const size = `${+z.width.toFixed(2)} × ${+z.height.toFixed(2)} in`;
            return (
              <button
                key={`${z.width}x${z.height}`}
                type="button"
                aria-label={`Copy dimensions ${size}, like ${z.example.name}`}
                {...tip("Copy Dimensions")}
                onClick={() => onUse(z)}
                className="press flex shrink-0 flex-col items-center rounded-control outline-none focus-visible:ring-2 focus-visible:ring-brand"
                style={{ gap: FIGURE_GAP, width: Math.max(z.width * PREVIEW_PPI, CAPTION_W) }}
              >
                <span className="relative block" style={{ width: z.width * PREVIEW_PPI, height: z.height * PREVIEW_PPI }}>
                  {url && <img src={url} alt="" loading="lazy" className="absolute inset-0 size-full" style={{ objectFit: "fill" }} />}
                </span>
                <span className="block w-full text-center text-[11px] leading-4" style={{ height: FIGURE_CAPTION_H }}>
                  <span className={`block font-semibold tabular-nums ${on ? "text-brand" : "text-ink"}`}>{size}</span>
                  <span className="block text-ink-muted">
                    {z.count} {z.count === 1 ? plural.slice(0, -1) : plural}
                  </span>
                </span>
              </button>
            );
          })}
      </div>
    </div>
  );
}
