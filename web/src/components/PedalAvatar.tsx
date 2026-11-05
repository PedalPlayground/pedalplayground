import { User } from "lucide-react";
import { thumbUrl } from "../lib/catalog";
import { useCatalog } from "../store/catalog";

/** A pedal photo at its natural shape (no circular crop), fitted inside a `size` × `size` box. */
/** Fits in a `size` square, or with `height`, is that tall at its own width. */
export function PedalAvatar({ pedalKey, size = 24, height }: { pedalKey: string; size?: number; height?: number }) {
  const manifest = useCatalog((s) => s.manifest);
  const src = thumbUrl(manifest, "pedal", pedalKey);
  if (!src) return <User size={size * 0.6} className="text-ink-muted" aria-hidden />;
  if (height) return <img src={src} alt="" style={{ height }} className="block w-auto max-w-none" />;
  return <img src={src} alt="" style={{ maxWidth: size, maxHeight: size }} className="block h-auto w-auto object-contain" />;
}
