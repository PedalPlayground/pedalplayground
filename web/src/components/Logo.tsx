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
 * The wordmark (256×16) with a catalog pedal in its icon. The pedal is pinned to the icon's top, right and bottom
 * edges, so its width follows its aspect ratio.
 */
export function Logo() {
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
    <span className="relative block h-4 w-64" role="img" aria-label="Pedal Playground">
      <img src={logoUrl} alt="" width={256} height={16} className="app-logo block h-4 w-64" />
      <span className="absolute left-0 top-0 block h-4 w-6">
        {src && <img src={src} alt="" className="absolute right-px top-px block h-[13.64px] w-auto" />}
      </span>
    </span>
  );
}
