import { ArrowLeft, MessageSquareWarning, Pencil, Plus } from "lucide-react";
import { PhotoViewer } from "../components/PhotoViewer";
import { trackPage } from "../lib/analytics";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { affiliateProps, buyLinks, DISCLOSURE } from "../lib/affiliate";
import { canvasImageUrl, itemTypes, thumbUrl, type Kind, type Manifest } from "../lib/catalog";
import { boardUrl, fetchFeaturedOn, type FeaturedBoard } from "../lib/gallery";
import { handoffHref } from "../lib/handoff";
import { gearItemHref } from "../lib/gearLink";
import { formatMa } from "../lib/specs";
import { nameLink, RoleBadges } from "../components/RoleBadge";
import type { CatalogItem } from "../lib/types";
import { useIsEditor } from "../lib/useIsEditor";

/** Link to one item's page. Boards say so, since a pedal and a board can share an image key. */
export const itemHref = (kind: Kind, item: CatalogItem) => gearItemHref(kind, item.image);

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
  onSuggestFix,
  card,
}: {
  kind: Kind;
  item: CatalogItem;
  manifest: Manifest;
  usage: Map<string, number>;
  onBack: () => void;
  onBrand: (brand: string) => void;
  /** Opens Suggest Gear on Wrong Info with this item picked. */
  onSuggestFix: () => void;
  card: (item: CatalogItem) => ReactNode;
}) {
  const all = kind === "pedal" ? manifest.pedals : manifest.pedalboards;
  const src = canvasImageUrl(manifest, kind, item.image);
  const thumb = thumbUrl(manifest, kind, item.image);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => setLoaded(false), [src]);
  /** The photo enlarged over the page. */
  const [zoomed, setZoomed] = useState(false);
  useEffect(() => setZoomed(false), [src]);
  const used = (c: CatalogItem) => usage.get(`${kind}:${c.image}`) ?? 0;

  /** Public boards that use it (null while loading). */
  const [featured, setFeatured] = useState<FeaturedBoard[] | null>(null);
  useEffect(() => {
    let live = true;
    setFeatured(null);
    void fetchFeaturedOn(kind, item.image).then((b) => live && setFeatured(b));
    return () => {
      live = false;
    };
  }, [kind, item.image]);

  useEffect(() => {
    document.title = `${item.brand} ${item.name} · Pedal Playground`;
    trackPage(`Gear: ${item.brand} ${item.name}`);
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
  /** Facts as small tiles: a label, the value, and sometimes a quieter second line. Types span the full width. */
  const types = itemTypes(item);
  const specs: { label: string; value: string; sub?: string; wide?: boolean }[] = [
    ...(types.length ? [{ label: types.length > 1 ? "Types" : "Type", value: types.join(", "), wide: true }] : []),
    { label: "Size", value: `${fmtIn(item.width)}″ × ${fmtIn(item.height)}″`, sub: `${fmtMm(item.width)} × ${fmtMm(item.height)} mm` },
    ...(item.added
      ? [{ label: "Added", value: new Date(`${item.added}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) }]
      : []),
    ...(item.voltage ? [{ label: "Power", value: item.voltage }] : []),
    ...(item.ma ? [{ label: "Current draw", value: formatMa(item.ma) }] : []),
  ];
  const editor = useIsEditor();

  return (
    <>
      <button type="button" onClick={onBack} className="flex items-center gap-1 text-[13px] font-semibold text-brand">
        <ArrowLeft size={14} strokeWidth={2.5} />
        <span className="underline-offset-2 hover:underline">Back to Gear</span>
      </button>

      <div className="mt-4 grid gap-6 md:grid-cols-[minmax(0,1fr)_320px] 2xl:grid-cols-[minmax(0,1fr)_380px] md:gap-8">
        {/* The photo at real proportions on the canvas color, shrunk to fit. */}
        <div className="flex min-h-[260px] items-center justify-center overflow-hidden rounded-container bg-canvas p-6 md:min-h-[420px]">
          {src && (
            // Click to see it bigger.
            <button
              type="button"
              onClick={() => setZoomed(true)}
              aria-label={`Enlarge photo of ${item.brand} ${item.name}`}
              style={{ width: item.width * PX_PER_INCH, maxWidth: "min(100%, 520px)" }}
              className="cursor-zoom-in rounded-inner outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <img
                src={src}
                alt={`${item.brand} ${item.name}`}
                onLoad={() => setLoaded(true)}
                style={{
                  aspectRatio: `${item.width} / ${item.height}`,
                  maxHeight: 420,
                  // The thumbnail stands in while the full photo loads.
                  backgroundImage: loaded || !thumb ? undefined : `url(${thumb})`,
                  backgroundSize: "contain",
                  backgroundRepeat: "no-repeat",
                  backgroundPosition: "center",
                }}
                className="w-full object-contain drop-shadow-[0_6px_14px_rgb(16_18_27/0.18)]"
              />
            </button>
          )}
          {zoomed && src && (
            <PhotoViewer
              src={src}
              alt={`${item.brand} ${item.name}`}
              aspect={item.width / item.height}
              onClose={() => setZoomed(false)}
            />
          )}
        </div>

        <div>
          <h1 className="text-2xl font-bold leading-tight tracking-[-0.01em]">{item.name}</h1>
          <button
            type="button"
            onClick={() => onBrand(item.brand)}
            className={`mt-1 text-sm font-medium text-ink-muted outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-brand ${nameLink}`}
          >
            {item.brand}
          </button>

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
                  className="press flex h-10 items-center justify-center rounded-control bg-soft text-sm font-semibold outline-none hover:bg-soft-hover focus-visible:ring-2 focus-visible:ring-brand"
                >
                  Find it on {b.store}
                </a>
              ))}
              <p className="text-xs text-ink-muted">{DISCLOSURE}</p>
            </div>
          )}

          <dl className="mt-6 grid grid-cols-2 gap-2">
            {specs.map((sp) => (
              <div key={sp.label} className={`rounded-panel bg-card px-3.5 py-3 ${sp.wide ? "col-span-2" : ""}`}>
                <dt className="text-xs text-ink-muted">{sp.label}</dt>
                <dd className="mt-0.5 text-[15px] font-semibold tabular-nums tracking-[-0.01em]">{sp.value}</dd>
                {sp.sub && <dd className="text-xs tabular-nums text-ink-muted">{sp.sub}</dd>}
              </div>
            ))}
          </dl>
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
            <button
              type="button"
              onClick={onSuggestFix}
              className="inline-flex items-center gap-1 text-[13px] font-semibold text-brand outline-none hover:underline focus-visible:ring-2 focus-visible:ring-brand"
            >
              <MessageSquareWarning size={13} strokeWidth={2.25} />
              Suggest a fix
            </button>
            {editor && (
              <a
                href={`/editor/#catalog?kind=${kind}&key=${encodeURIComponent(item.image)}`}
                className="inline-flex items-center gap-1 text-[13px] font-semibold text-brand hover:underline"
              >
                <Pencil size={13} strokeWidth={2.25} />
                Edit in catalog
              </a>
            )}
          </div>
        </div>
      </div>

      {featured && featured.length > 0 && (
        <Related title="Featured on" cols="grid-cols-1 min-[480px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {featured.map((b) => (
            <FeaturedCard key={b.id} board={b} />
          ))}
        </Related>
      )}

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

/** A public board that uses this item: its picture, name and author, opening the board. */
function FeaturedCard({ board }: { board: FeaturedBoard }) {
  return (
    <a
      href={boardUrl(board.slug)}
      className="group flex flex-col overflow-hidden rounded-panel bg-card outline-none transition-colors hover:bg-card-hover focus-visible:ring-2 focus-visible:ring-brand"
    >
      <span className="aspect-[8/5] w-full border-b border-chrome-line p-3">
        {board.thumbnail && <img src={board.thumbnail} alt="" loading="lazy" className="size-full object-contain" />}
      </span>
      <span className="px-3.5 pb-3 pt-2.5">
        <span className="line-clamp-1 text-sm font-semibold">{board.name}</span>
        <span className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-muted">
          {board.username && <span>{board.username}</span>}
          <RoleBadges username={board.username} />
        </span>
      </span>
    </a>
  );
}

function Related({ title, action, children, cols }: { title: string; action?: ReactNode; children: ReactNode; cols?: string }) {
  return (
    <section className="mt-12">
      <div className="flex items-center justify-between gap-3">
        <h2 className="min-w-0 flex-1 text-lg font-bold tracking-[-0.01em]">{title}</h2>
        {action}
      </div>
      <div className={`mt-4 grid gap-3 ${cols ?? "grid-cols-2 min-[560px]:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7"}`}>{children}</div>
    </section>
  );
}
