import { X } from "lucide-react";
import { useEffect, type ReactNode } from "react";

/** `closeX` adds an X button in the top-right corner, for dialogs without their own Close or Cancel button. */
export function Modal({
  title,
  onClose,
  children,
  wide,
  closeX,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  closeX?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="animate-fade fixed inset-0 z-50 grid place-items-center bg-[rgb(10_11_16/0.75)] p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-label={title}
        className={`animate-enter relative max-h-full w-full overflow-y-auto rounded-panel bg-surface p-5 shadow-[var(--shadow-modal)] ${wide ? "max-w-2xl" : "max-w-sm"}`}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className={`mb-3 text-base font-semibold ${closeX ? "pr-8" : ""}`}>{title}</h2>
        {closeX && (
          <button
            onClick={onClose}
            aria-label="Close"
            className="absolute right-3 top-3 grid size-8 place-items-center rounded-control text-ink-muted outline-none hover:bg-surface-hover hover:text-ink focus-visible:ring-2 focus-visible:ring-brand"
          >
            <X size={16} />
          </button>
        )}
        {children}
      </div>
    </div>
  );
}
