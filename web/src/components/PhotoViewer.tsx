import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { track } from "../lib/analytics";

/**
 * A photo enlarged to fill the screen, on the same dotted backdrop as dialogs (`Modal`).
 * Click anywhere, press Esc or use the X to close. `aspect` is width / height, so the box is sized before the photo loads.
 */
export function PhotoViewer({ src, alt, aspect, onClose }: { src: string; alt: string; aspect: number; onClose: () => void }) {
  const close = useRef<HTMLButtonElement>(null);
  /** The photo's own width, so a small photo isn't blown up past twice its size. */
  const [natural, setNatural] = useState<number | null>(null);

  useEffect(() => track("dialog_open", { dialog: "Photo" }), []);
  // Read through a ref, so a new onClose from the page doesn't move focus around.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    close.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeRef.current();
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      before?.focus?.();
    };
  }, []);

  // Fit the screen less the padding, keep the proportions, and cap at twice the photo's own width.
  const fit = `min(calc(100vw - 2rem), calc((100dvh - 2rem) * ${aspect}))`;
  const width = natural ? `min(${fit}, ${natural * 2}px)` : fit;

  return createPortal(
    <div
      role="dialog"
      aria-label={alt}
      className="animate-fade fixed inset-0 z-50 flex cursor-zoom-out items-center justify-center modal-backdrop p-4"
      onClick={onClose}
    >
      <img
        src={src}
        alt={alt}
        onLoad={(e) => setNatural(e.currentTarget.naturalWidth)}
        style={{ width, aspectRatio: String(aspect) }}
        className="animate-enter object-contain drop-shadow-[0_10px_24px_rgb(16_18_27/0.22)]"
      />
      <button
        ref={close}
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute right-3 top-3 grid size-9 place-items-center rounded-full bg-surface text-ink-muted shadow-float outline-none hover:bg-surface-hover hover:text-ink focus-visible:ring-2 focus-visible:ring-brand"
      >
        <X size={18} />
      </button>
    </div>,
    document.body,
  );
}
