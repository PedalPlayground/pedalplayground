import { useMemo } from "react";
import logoUrl from "../assets/logo.svg";
import { thumbUrl } from "../lib/catalog";
import { FEATURED_PEDALS } from "../lib/featuredPedals";
import { useAuth } from "../store/auth";
import { useCatalog } from "../store/catalog";
import { useUi } from "../store/ui";


const VISIT_KEY = "pp:logo-pedal";

/** One random pick per browser session ("visit"), so reloads don't reshuffle it. */
function pickForVisit(): number {
  try {
    const saved = sessionStorage.getItem(VISIT_KEY);
    if (saved !== null && Number(saved) < FEATURED_PEDALS.length) return Number(saved);
    const n = Math.floor(Math.random() * FEATURED_PEDALS.length);
    sessionStorage.setItem(VISIT_KEY, String(n));
    return n;
  } catch {
    return Math.floor(Math.random() * FEATURED_PEDALS.length);
  }
}

/**
 * The wordmark (256×16) with a catalog pedal in its icon. `iconOnly` crops it to the 24×16 icon at every size; otherwise
 * it's the icon on small screens and the full wordmark from `fullFrom` up. The pedal is pinned to the icon's top, right and bottom
 * edges, so its width follows its aspect ratio.
 */
export function Logo({ iconOnly = false, fullFrom = "sm" }: { iconOnly?: boolean; fullFrom?: "sm" | "lg" }) {
  const manifest = useCatalog((s) => s.manifest);
  const signedIn = useAuth((s) => !!s.user);
  const avatar = useUi((u) => u.avatar);
  const start = useMemo(pickForVisit, []);

  const src = useMemo(() => {
    if (!manifest) return null;
    // Signed-in users see their own avatar pedal in the logo.
    if (signedIn) return thumbUrl(manifest, "pedal", avatar);
    // Start at this visit's pick and take the first usable pedal (portrait, with an image).
    for (let k = 0; k < FEATURED_PEDALS.length; k++) {
      const key = FEATURED_PEDALS[(start + k) % FEATURED_PEDALS.length];
      const p = manifest.pedals.find((i) => i.image === key);
      if (p && p.height > p.width) return thumbUrl(manifest, "pedal", key);
    }
    return null;
  }, [manifest, start, signedIn, avatar]);

  return (
    <span className={`relative block h-4 w-6 overflow-hidden ${iconOnly ? "" : fullFrom === "lg" ? "lg:w-64" : "sm:w-64"}`} role="img" aria-label="Pedal Playground">
      <img src={logoUrl} alt="" width={256} height={16} className="app-logo block h-4 w-64 max-w-none" />
      <span className="absolute left-0 top-0 block h-4 w-6">
        {src && <img src={src} alt="" className="absolute right-px top-px block h-[13.64px] w-auto" />}
      </span>
    </span>
  );
}

/**
 * The header brand: the logo icon (with its pedal) inside a brand-colored selection frame with corner handles, and
 * "PEDAL / PLAYGROUND" stacked beside it (from laptop width up).
 */
export function Brand() {
  const handle = "absolute size-[3.75px] bg-brand";
  return (
    <span className="flex items-center gap-1.5">
      <span aria-hidden className="relative block h-[30px] w-10 shrink-0">
        <span className="absolute inset-[1.25px] border-[1.875px] border-brand" />
        <span className={`${handle} left-0 top-0`} />
        <span className={`${handle} right-0 top-0`} />
        <span className={`${handle} bottom-0 left-0`} />
        <span className={`${handle} bottom-0 right-0`} />
        {/* The 24×16 icon, scaled to 30×20. */}
        <span className="absolute left-[5px] top-[5px] origin-top-left scale-125">
          <Logo iconOnly />
        </span>
      </span>
      <span className="font-wordmark whitespace-nowrap text-base/[14px] uppercase tracking-[-0.01em] text-ink max-lg:hidden">
        <span className="block font-semibold">Pedal</span>
        <span className="block font-extrabold">Playground</span>
      </span>
    </span>
  );
}
