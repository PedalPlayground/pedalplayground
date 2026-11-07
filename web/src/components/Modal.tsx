import { X } from "lucide-react";
import { useEffect, type ReactNode } from "react";

/**
 * `closeX` adds an X button in the top-right corner, for dialogs without their own Close or Cancel button.
 * `footer` sits just below the dialog, on the backdrop, without moving the dialog off center.
 */
export function Modal({
  title,
  onClose,
  children,
  wide,
  closeX,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  closeX?: boolean;
  footer?: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="animate-fade fixed inset-0 z-50 flex items-center justify-center modal-backdrop p-4" onClick={onClose}>
      <div className={`relative flex max-h-full w-full flex-col ${wide ? "max-w-2xl" : "max-w-sm"}`}>
        {/* min-h-0: the dialog shrinks to fit the screen and scrolls inside, rather than running off the bottom. */}
        <div
          role="dialog"
          // Session recordings (Clarity) skip dialog contents: sign-in, usernames, board names and descriptions.
          data-clarity-mask="True"
          aria-label={title}
          className="animate-enter relative min-h-0 w-full overflow-y-auto rounded-container bg-surface p-5 shadow-modal"
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
        {footer && (
          <div
            className="animate-enter absolute inset-x-0 top-full mt-3 text-center text-xs text-ink-muted"
            onClick={(e) => e.stopPropagation()}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
