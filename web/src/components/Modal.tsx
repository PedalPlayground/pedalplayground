import { useEffect, type ReactNode } from "react";

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="animate-fade fixed inset-0 z-50 grid place-items-center bg-ink/30 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-label={title}
        className={`animate-enter max-h-full w-full overflow-y-auto rounded-panel bg-surface p-5 shadow-panel ${wide ? "max-w-2xl" : "max-w-sm"}`}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-3 text-base font-semibold">{title}</h2>
        {children}
      </div>
    </div>
  );
}
