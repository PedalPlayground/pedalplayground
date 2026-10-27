import { Check, ChevronDown } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { tip } from "./Tooltip";
import { requestNewPlayground } from "../lib/newPlayground";
import { useAuth } from "../store/auth";
import { useCloud } from "../store/cloud";
import { usePlayground } from "../store/playground";

const item =
  "flex w-full cursor-pointer select-none items-center gap-3 rounded-control px-2 py-1.5 text-left text-sm outline-none hover:bg-surface-hover focus-visible:bg-surface-hover";

function Thumb({ src }: { src: string | null | undefined }) {
  return src ? (
    <img src={src} alt="" className="size-8 shrink-0 rounded object-cover ring-1 ring-line" />
  ) : (
    <span className="size-8 shrink-0 rounded bg-canvas ring-1 ring-line" />
  );
}

type MenuProps = { onRename: () => void; onAll: () => void; onSignIn: () => void };

/** The playground menu: the user's playgrounds, rename, new, and (signed out) sign in. Centered over a dimmed page. */
function PlaygroundMenu({ onRename, onAll, onSignIn, onClose }: MenuProps & { onClose: () => void }) {
  const user = useAuth((s) => s.user);
  const cloudEnabled = useAuth((s) => s.cloudEnabled);
  const { list, cloudId, openPlayground } = useCloud();
  const panel = useRef<HTMLDivElement>(null);

  // Focus the first item; Escape closes; arrow keys move between items like a menu.
  useEffect(() => {
    panel.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") return onClose();
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      e.preventDefault();
      const buttons = [...(panel.current?.querySelectorAll<HTMLButtonElement>("button") ?? [])];
      const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
      const next = e.key === "ArrowDown" ? (i + 1) % buttons.length : (i - 1 + buttons.length) % buttons.length;
      buttons[next]?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  /** Closes the menu, then runs the item's action. */
  const pick = (action: () => void) => () => {
    onClose();
    action();
  };

  return (
    <div className="animate-fade fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <div
        ref={panel}
        role="menu"
        aria-label="Playgrounds"
        className="animate-enter w-72 max-w-full rounded-panel bg-surface p-1.5 shadow-panel"
        onClick={(e) => e.stopPropagation()}
      >
        {user && list.length > 0 && (
          <>
            <p className="px-2 py-1 text-xs text-ink-muted">Your Playgrounds</p>
            {list.slice(0, 6).map((p) => (
              <button key={p.id} role="menuitem" className={item} onClick={pick(() => void openPlayground(p.id))}>
                <Thumb src={p.thumbnail} />
                <span className="min-w-0 flex-1 truncate">{p.name}</span>
                {p.id === cloudId && <Check size={14} className="text-brand" />}
              </button>
            ))}
            <button role="menuitem" className={item} onClick={pick(onAll)}>
              All Playgrounds…
            </button>
            <div className="my-1 h-px bg-line" />
          </>
        )}
        <button role="menuitem" className={item} onClick={pick(onRename)}>
          Rename…
        </button>
        <button role="menuitem" className={item} onClick={pick(requestNewPlayground)}>
          New Playground
        </button>
        {cloudEnabled && !user && (
          <>
            <div className="my-1 h-px bg-line" />
            <button role="menuitem" className={`${item} text-brand`} onClick={pick(onSignIn)}>
              Sign In to Save Across Devices
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/** Header center: "⌄ Playground name", which opens the playground menu (from Figma). */
export function PlaygroundBreadcrumb({ className = "", ...props }: MenuProps & { className?: string }) {
  const name = usePlayground((s) => s.name);
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => {
    setOpen(false);
    trigger.current?.focus();
  }, []);
  return (
    <div className={`flex min-w-0 items-center text-sm/4 font-semibold tracking-[-0.01em] ${className}`}>
      <button
        ref={trigger}
        aria-label={`Playground: ${name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        {...tip("Switch Playgrounds")}
        onClick={() => setOpen(true)}
        className={`-mx-1.5 flex min-w-0 items-center gap-2 rounded-control px-1.5 py-1 outline-none transition-colors hover:bg-ink/5 active:bg-ink/10 focus-visible:ring-2 focus-visible:ring-brand ${open ? "bg-ink/5" : ""}`}
      >
        <ChevronDown size={12} strokeWidth={2.5} className="shrink-0" />
        <span className="truncate">{name}</span>
      </button>
      {open && <PlaygroundMenu {...props} onClose={close} />}
    </div>
  );
}
