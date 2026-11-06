import { ArrowLeft, Plus } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { affiliateProps, buyLinks, DISCLOSURE } from "../lib/affiliate";
import { canvasImageUrl, thumbUrl, type Kind, type Manifest } from "../lib/catalog";
import { handoffHref } from "../lib/handoff";
import { formatMa } from "../lib/specs";
import type { CatalogItem } from "../lib/types";

/** Link to one item's page. Boards say so, since a pedal and a board can share an image key. */
export const itemHref = (kind: Kind, item: CatalogItem) => `/gear/?item=${encodeURIComponent(item.image)}${kind === "pedalboard" ? "&kind=boards" : ""}`;

/** Photo scale on the item page: big enough to read the knobs, shrunk to fit narrow screens. */
const PX_PER_INCH = 56;
const RELATED = 12;

const fmtIn = (n: number) => String(Math.round(n * 100) / 100);
const fmtMm = (n: number) => String(Math.round(n * 25.4));

/** One item's page: photo at scale, size and specs, Add to My Playground, Buy links, more from the brand, similar sizes. */
export function ItemPage({
  kind,
  item,
  manifest,
  usage,
  onBack,
  onBrand,
  card,
}: {
  kind: Kind;
  item: CatalogItem;
  manifest: Manifest;
  usage: Map<string, number>;
  onBack: () => void;
  onBrand: (brand: string) => void;
  card: (item: CatalogItem) => ReactNode;
}) {
  const all = kind === "pedal" ? manifest.pedals : manifest.pedalboards;
  const src = canvasImageUrl(manifest, kind, item.image);
  const thumb = thumbUrl(manifest, kind, item.image);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => setLoaded(false), [src]);
  const used = (c: CatalogItem) => usage.get(`${kind}:${c.image}`) ?? 0;

  useEffect(() => {
    document.title = `${item.brand} ${item.name} · Pedal Playground`;
    return () => void (document.title = "Gear · Pedal Playground");
  }, [item]);

  const sameBrand = useMemo(() => all.filter((c) => c.brand === item.brand && c !== item), [all, item]);
  const fromBrand = useMemo(() => [...sameBrand].sort((a, b) => used(b) - used(a)).slice(0, RELATED), [sameBrand, usage]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Other brands' gear within a hair of the same size (either way round), closest first, then most used. */
  const similar = useMemo(() => {
    const tol = kind === "pedal" ? 0.2 : 1;
    const off = (c: CatalogItem) =>
      Math.min(
        Math.max(Math.abs(c.width - item.width), Math.abs(c.height - item.height)),
        Math.max(Math.abs(c.width - item.height), Math.abs(c.height - item.width)),
      );
    return all
      .filter((c) => c.brand !== item.brand && off(c) <= tol)
      .sort((a, b) => Math.round((off(a) - off(b)) * 20) || used(b) - used(a))
      // At most two from any one brand, so the row isn't one brand's whole range.
      .filter((c, i, list) => list.slice(0, i).filter((d) => d.brand === c.brand).length < 2)
      .slice(0, RELATED);
  }, [all, item, kind, usage]); // eslint-disable-line react-hooks/exhaustive-deps

  const buy = buyLinks(item.brand, item.name);
  const specs: [string, string][] = [
    ["Size", `${fmtIn(item.width)}″ × ${fmtIn(item.height)}″ (${fmtMm(item.width)} × ${fmtMm(item.height)} mm)`],
    ...(item.type ? [["Type", item.type] as [string, string]] : []),
    ...(item.voltage ? [["Power", item.voltage] as [string, string]] : []),
    ...(item.ma ? [["Current draw", formatMa(item.ma)] as [string, string]] : []),
    ...(item.added
      ? [["Added to the catalog", new Date(`${item.added}T12:00:00`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })] as [string, string]]
      : []),
  ];

  return (
    <>
      <button type="button" onClick={onBack} className="flex items-center gap-1 text-[13px] font-semibold text-brand hover:underline">
        <ArrowLeft size={14} strokeWidth={2.5} />
        Back to Gear
      </button>

      <div className="mt-4 grid gap-6 md:grid-cols-[minmax(0,1fr)_320px] md:gap-8">
        {/* The photo at real proportions on the canvas color, shrunk to fit. */}
        <div className="flex min-h-[260px] items-center justify-center overflow-hidden rounded-panel bg-canvas p-6 md:min-h-[420px]">
          {src && (
            <img
              src={src}
              alt={`${item.brand} ${item.name}`}
              onLoad={() => setLoaded(true)}
              style={{
                width: item.width * PX_PER_INCH,
                maxWidth: "100%",
                aspectRatio: `${item.width} / ${item.height}`,
                maxHeight: 560,
                // The thumbnail stands in while the full photo loads.
                backgroundImage: loaded || !thumb ? undefined : `url(${thumb})`,
                backgroundSize: "contain",
                backgroundRepeat: "no-repeat",
                backgroundPosition: "center",
              }}
              className="object-contain drop-shadow-[0_6px_14px_rgb(16_18_27/0.18)]"
            />
          )}
        </div>

        <div>
          <button
            type="button"
            onClick={() => onBrand(item.brand)}
            className="text-sm font-medium text-ink-muted outline-none hover:text-ink hover:underline focus-visible:ring-2 focus-visible:ring-brand"
          >
            {item.brand}
          </button>
          <h1 className="mt-0.5 text-2xl font-bold leading-tight tracking-[-0.01em]">{item.name}</h1>

          <a
            href={handoffHref({ kind: "add", id: `${kind}:${item.image}` })}
            className="btn-primary press mt-5 flex h-10 w-full items-center justify-center gap-1.5 rounded-control text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <Plus size={16} strokeWidth={2.5} />
            Add to My Playground
          </a>

          {buy.length > 0 && (
            <div className="mt-2 flex flex-col gap-2">
              {buy.map((b) => (
                <a
                  key={b.store}
                  href={b.href}
                  {...affiliateProps}
                  className="press flex h-10 items-center justify-center rounded-control border border-line bg-surface text-sm font-semibold outline-none hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-brand"
                >
                  Find it on {b.store}
                </a>
              ))}
              <p className="text-xs text-ink-muted">{DISCLOSURE}</p>
            </div>
          )}

          <dl className="mt-6 divide-y divide-line border-y border-line text-sm">
            {specs.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 py-2.5">
                <dt className="text-ink-muted">{k}</dt>
                <dd className="text-right font-medium tabular-nums">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      {fromBrand.length > 0 && (
        <Related
          title={`More from ${item.brand}`}
          action={
            sameBrand.length > fromBrand.length && (
              <button type="button" onClick={() => onBrand(item.brand)} className="text-[13px] font-semibold text-brand hover:underline">
                See all {(sameBrand.length + 1).toLocaleString("en-US")}
              </button>
            )
          }
        >
          {fromBrand.map(card)}
        </Related>
      )}
      {similar.length > 0 && <Related title="Similar size">{similar.map(card)}</Related>}
    </>
  );
}

function Related({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="mt-12">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-bold tracking-[-0.01em]">{title}</h2>
        {action}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 min-[560px]:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">{children}</div>
    </section>
  );
}
