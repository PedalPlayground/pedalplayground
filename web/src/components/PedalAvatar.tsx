import { User } from "lucide-react";
import { thumbUrl } from "../lib/catalog";
import { useCatalog } from "../store/catalog";

/** A pedal photo at its natural shape (no circular crop), fitted inside a `size` × `size` box. */
export function PedalAvatar({ pedalKey, size = 24 }: { pedalKey: string; size?: number }) {
  const manifest = useCatalog((s) => s.manifest);
  const src = thumbUrl(manifest, "pedal", pedalKey);
  if (!src) return <User size={size * 0.6} className="text-ink-muted" aria-hidden />;
  return <img src={src} alt="" style={{ maxWidth: size, maxHeight: size }} className="block h-auto w-auto object-contain" />;
}
