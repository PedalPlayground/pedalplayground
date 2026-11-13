import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { track } from "../lib/analytics";

/**
 * A photo enlarged (up to 900 × 900) with room around it, on the same dotted backdrop as dialogs (`Modal`).
 * Click anywhere, press Esc or use the X to close. `aspect` is width / height, so the box is sized before the photo loads;
 * leave it out for a photo whose proportions aren't known (a raw upload), and the box takes the photo's own once it loads.
 */
/** The biggest the photo gets, in CSS pixels, either way. */
const MAX = 900;

export function PhotoViewer({ src, alt, aspect: given, onClose }: { src: string; alt: string; aspect?: number; onClose: () => void }) {
  const close = useRef<HTMLButtonElement>(null);
  /** The photo's own size: a small photo isn't blown up past twice its width, and it gives the proportions when none were passed. */
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const aspect = given ?? (natural ? natural.w / natural.h : 1);

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

  // Fit a box of at most MAX × MAX inside the screen less the padding, keep the proportions,
  // and cap at twice the photo's own width.
  const side = (screen: string) => `min(calc(${screen} - var(--pad) * 2), ${MAX}px)`;
  const fit = `min(${side("100vw")}, calc(${side("100dvh")} * ${aspect}))`;
  const width = natural ? `min(${fit}, ${natural.w * 2}px)` : fit;

  return createPortal(
    <div
      role="dialog"
      aria-label={alt}
      className="animate-fade fixed inset-0 z-50 flex cursor-zoom-out items-center justify-center modal-backdrop p-(--pad) [--pad:2.5rem] sm:[--pad:4rem]"
      // It renders on <body>, but React still passes its clicks up to whatever opened it (a list row, a link), so stop them here.
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        onClose();
      }}
    >
      <img
        src={src}
        alt={alt}
        onLoad={(e) => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
        style={{ width, aspectRatio: String(aspect) }}
        // With no proportions given, it stays hidden until it loads, so the box doesn't jump.
        className={`animate-enter object-contain ${given || natural ? "" : "opacity-0"} drop-shadow-[0_10px_24px_rgb(16_18_27/0.22)]`}
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

/**
 * A photo that opens large in `PhotoViewer` when clicked, with a zoom-in cursor. Wraps the small picture it shows.
 * `nested` is for a photo inside a link or button (a list row): it becomes a focusable span that takes the click for
 * itself, so the rest of the row still opens the item.
 */
export function EnlargeablePhoto({
  src,
  alt,
  aspect,
  nested,
  className = "",
  children,
}: {
  src: string;
  alt: string;
  aspect?: number;
  nested?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const show = (e: React.SyntheticEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setOpen(true);
  };
  const props = {
    onClick: show,
    "aria-label": `Enlarge photo of ${alt}`,
    className: `cursor-zoom-in rounded-inner outline-none focus-visible:ring-2 focus-visible:ring-brand ${className}`,
  };
  return (
    <>
      {nested ? (
        <span
          {...props}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && show(e)}
        >
          {children}
        </span>
      ) : (
        <button type="button" {...props}>
          {children}
        </button>
      )}
      {open && <PhotoViewer src={src} alt={alt} aspect={aspect} onClose={() => setOpen(false)} />}
    </>
  );
}
