import { useEffect, useLayoutEffect, useRef, useState, type FocusEvent, type PointerEvent } from "react";
import { create } from "zustand";

type Side = "top" | "bottom" | "right";

interface Tip {
  label: string;
  shortcut?: string;
  rect: DOMRect;
  side: Side;
  /** Shown right after another tooltip, so it appears without the entrance animation. */
  warm: boolean;
}

const useTip = create<{ tip: Tip | null }>(() => ({ tip: null }));

const DELAY_MS = 450;
/** Moving to the next button within this window shows its tooltip straight away. */
const WARM_MS = 300;

let timer: ReturnType<typeof setTimeout> | undefined;
let lastHidden = 0;

export const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
/** Shortcuts are written with ⌘; other platforms read "Ctrl+" ("Ctrl +" before a plus or minus). */
export const platformKeys = (s: string) => (isMac ? s : s.replace(/⌘(?=[+−])/g, "Ctrl ").replace(/⌘/g, "Ctrl+"));

function show(el: Element, label: string, shortcut: string | undefined, side: Side | undefined, immediate: boolean) {
  clearTimeout(timer);
  const warm = !!useTip.getState().tip || Date.now() - lastHidden < WARM_MS;
  const open = () => {
    if (!el.isConnected) return;
    const rect = el.getBoundingClientRect();
    // Default to below for things near the top of the screen, above for everything else.
    const s = side ?? (rect.top < 80 ? "bottom" : "top");
    useTip.setState({ tip: { label, shortcut: shortcut && platformKeys(shortcut), rect, side: s, warm } });
  };
  if (warm || immediate) open();
  else timer = setTimeout(open, DELAY_MS);
}

export function hideTip() {
  clearTimeout(timer);
  if (useTip.getState().tip) {
    lastHidden = Date.now();
    useTip.setState({ tip: null });
  }
}

/**
 * Props that give an element a tooltip. Spread them onto a button (or a Radix trigger). Mouse and keyboard
 * focus only: touch screens never show tooltips, since there's no hover to dismiss them.
 */
export function tip(label: string, opts: { shortcut?: string; side?: Side } = {}) {
  return {
    onPointerEnter: (e: PointerEvent<Element>) => {
      if (e.pointerType === "mouse") show(e.currentTarget, label, opts.shortcut, opts.side, false);
    },
    onPointerLeave: hideTip,
    onPointerDown: hideTip,
    onFocus: (e: FocusEvent<Element>) => {
      if (e.currentTarget.matches(":focus-visible")) show(e.currentTarget, label, opts.shortcut, opts.side, true);
    },
    onBlur: hideTip,
  };
}

const GAP = 8;
const EDGE = 8;

/** The one tooltip on screen. Rendered once, near the root of the app. */
export function TooltipLayer() {
  const t = useTip((s) => s.tip);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useEffect(() => {
    // Anything that moves the page under the pointer makes the tooltip stale.
    window.addEventListener("wheel", hideTip, { passive: true });
    window.addEventListener("keydown", hideTip);
    window.addEventListener("resize", hideTip);
    return () => {
      window.removeEventListener("wheel", hideTip);
      window.removeEventListener("keydown", hideTip);
      window.removeEventListener("resize", hideTip);
    };
  }, []);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!t || !el) return setPos(null);
    const { width, height } = el.getBoundingClientRect();
    const r = t.rect;
    let left: number;
    let top: number;
    if (t.side === "right") {
      left = r.right + GAP;
      top = r.top + r.height / 2 - height / 2;
    } else {
      left = r.left + r.width / 2 - width / 2;
      top = t.side === "top" ? r.top - GAP - height : r.bottom + GAP;
    }
    left = Math.max(EDGE, Math.min(left, window.innerWidth - width - EDGE));
    top = Math.max(EDGE, Math.min(top, window.innerHeight - height - EDGE));
    setPos({ left, top });
  }, [t]);

  if (!t) return null;
  const enter = t.side === "top" ? "[--enter-y:4px]" : t.side === "bottom" ? "[--enter-y:-4px]" : "[--enter-y:0px]";
  return (
    <div
      ref={ref}
      role="tooltip"
      key={`${t.label}-${t.rect.left}-${t.rect.top}`}
      className={`pointer-events-none fixed z-[100] flex items-center gap-1.5 whitespace-nowrap rounded-[5px] bg-tip px-2 py-1 text-xs font-medium text-tip-ink shadow-[0_2px_8px_rgb(0_0_0/0.15)] ${
        t.warm ? "" : `animate-enter ${enter}`
      }`}
      style={pos ? { left: pos.left, top: pos.top } : { left: 0, top: 0, visibility: "hidden" }}
    >
      {t.label}
      {t.shortcut && <span className="font-normal opacity-60">{t.shortcut}</span>}
    </div>
  );
}
