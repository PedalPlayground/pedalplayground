import { X } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useAuth } from "../store/auth";
import { useUi } from "../store/ui";

interface Step {
  /** `data-tour` value of the element to point at. No target shows a centered card. */
  target?: string;
  /** Spotlight padding around the target; negative pulls it inside (for the full-size canvas). */
  pad?: number;
  title: string;
  body: string;
}

const coarse = () => typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;

function buildSteps(signedIn: boolean, cloudEnabled: boolean): Step[] {
  const touch = coarse();
  const steps: Step[] = [
    {
      title: "Welcome to the New Pedal Playground",
      body: "Plan your pedalboard before you buy a thing. Here's a quick look around.",
    },
    {
      target: "add",
      title: "Add Gear",
      body: "Search for pedals and boards, then drop them onto your Playground.",
    },
    {
      target: "canvas",
      pad: -10,
      title: "Arrange Your Board",
      body: touch
        ? "Drag to move gear. Tap it to rotate, replace or delete. Pinch to zoom."
        : "Drag to move gear. Click it to rotate, replace or delete. Scroll to pan, and pinch or hold ⌘/Ctrl while scrolling to zoom.",
    },
  ];
  if (cloudEnabled) {
    steps.push(
      signedIn
        ? { target: "account", title: "Your Playgrounds", body: "Everything you build saves to your account. Find all your boards here." }
        : { target: "account", title: "Save Your Work", body: "Your board is kept on this device. Sign in to save it to your account and open it anywhere." },
      { target: "share", title: "Share It", body: "Get a link anyone can open as their own copy." },
    );
  }
  return steps;
}

const PAD = 6; // space between the target and the spotlight edge
const GAP = 12; // space between the spotlight and the card
const EDGE = 12; // minimum distance from the viewport edge

type Rect = { x: number; y: number; w: number; h: number };

function targetRect(name?: string, pad = PAD): Rect | null {
  if (!name) return null;
  // Several elements can share a name (e.g. phone and desktop variants); use the visible one.
  for (const el of document.querySelectorAll<HTMLElement>(`[data-tour="${name}"]`)) {
    const r = el.getBoundingClientRect();
    if (r.width && r.height) return { x: r.left - pad, y: r.top - pad, w: r.width + pad * 2, h: r.height + pad * 2 };
  }
  return null;
}

/**
 * A short coach-mark tour: dims the app, spotlights one control at a time and explains it in a line or two.
 * Opens once on a device's first visit (see App) and can be replayed from Settings. Esc or "Skip" ends it.
 */
export function OnboardingTour() {
  const open = useUi((u) => u.tourOpen);
  const endTour = useUi((u) => u.endTour);
  const signedIn = useAuth((s) => !!s.user);
  const cloudEnabled = useAuth((s) => s.cloudEnabled);
  const [steps, setSteps] = useState<Step[]>([]);
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [cardSize, setCardSize] = useState<{ w: number; h: number } | null>(null);
  const [viewport, setViewport] = useState({ w: window.innerWidth, h: window.innerHeight });
  const card = useRef<HTMLDivElement>(null);
  const primary = useRef<HTMLButtonElement>(null);

  // Fix the step list when the tour opens so signing in mid-tour doesn't reshuffle it.
  useEffect(() => {
    if (!open) return;
    setSteps(buildSteps(signedIn, cloudEnabled));
    setIndex(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const step = steps[index];
  const last = index === steps.length - 1;

  const measure = useCallback(() => {
    setViewport({ w: window.innerWidth, h: window.innerHeight });
    setRect(targetRect(step?.target, step?.pad));
    if (card.current) setCardSize({ w: card.current.offsetWidth, h: card.current.offsetHeight });
  }, [step]);

  useLayoutEffect(() => {
    if (open && step) measure();
  }, [open, step, measure]);

  useEffect(() => {
    if (!open) return;
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [open, measure]);

  const next = useCallback(() => (last ? endTour() : setIndex((i) => i + 1)), [last, endTour]);
  const back = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") endTour();
      else if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") back();
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    // Capture so the canvas's own shortcuts (arrows nudge, Esc deselects) don't also fire.
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, next, back, endTour]);

  useEffect(() => {
    if (!open) return;
    // Wait a frame: opening from the Settings menu, the menu hands focus back to its trigger as it closes.
    const f = requestAnimationFrame(() => primary.current?.focus());
    return () => cancelAnimationFrame(f);
  }, [open, index]);

  if (!open || !step) return null;

  // Place the card above the target if it fits, else below. Big targets (the canvas) get it centered inside.
  const w = cardSize?.w ?? 320;
  const h = cardSize?.h ?? 160;
  let left = (viewport.w - w) / 2;
  let top = (viewport.h - h) / 2;
  let arrow: { side: "top" | "bottom"; x: number } | null = null;
  if (rect) {
    const cx = rect.x + rect.w / 2;
    left = Math.min(Math.max(cx - w / 2, EDGE), viewport.w - w - EDGE);
    if (rect.h > viewport.h * 0.5) {
      top = rect.y + (rect.h - h) / 2;
    } else if (rect.y - GAP - h >= EDGE) {
      top = rect.y - GAP - h;
      arrow = { side: "bottom", x: cx - left };
    } else {
      top = Math.min(rect.y + rect.h + GAP, viewport.h - h - EDGE);
      arrow = { side: "top", x: cx - left };
    }
    if (arrow) arrow.x = Math.min(Math.max(arrow.x, 18), w - 18);
  }

  const spotlight = rect ?? { x: viewport.w / 2, y: viewport.h / 2, w: 0, h: 0 };

  return (
    <div className="fixed inset-0 z-[60]" aria-live="polite">
      {/* Blocks clicks on the app while the tour runs; the dimming comes from the spotlight's shadow. */}
      <div className="absolute inset-0" />
      <div
        aria-hidden
        className="pointer-events-none absolute rounded-[10px] shadow-[0_0_0_9999px_rgb(10_11_16/0.55)] motion-safe:transition-all motion-safe:duration-300 motion-safe:ease-out"
        style={{ left: spotlight.x, top: spotlight.y, width: spotlight.w, height: spotlight.h }}
      />
      {rect && (
        <div
          aria-hidden
          className="pointer-events-none absolute rounded-[10px] ring-2 ring-brand motion-safe:transition-all motion-safe:duration-300 motion-safe:ease-out"
          style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
        />
      )}

      <div
        ref={card}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        aria-describedby="tour-body"
        className="absolute w-[min(320px,calc(100vw-24px))] rounded-panel bg-surface p-4 shadow-panel motion-safe:transition-[left,top,opacity] motion-safe:duration-300 motion-safe:ease-out"
        style={{ left, top, opacity: cardSize ? 1 : 0 }}
      >
        {arrow && (
          <span
            aria-hidden
            className={`absolute size-3 rotate-45 bg-surface ${arrow.side === "bottom" ? "-bottom-1.5" : "-top-1.5"}`}
            style={{ left: arrow.x - 6 }}
          />
        )}
        <button
          onClick={endTour}
          aria-label="Close tour"
          className="absolute right-2 top-2 grid size-7 place-items-center rounded-control text-ink-muted outline-none hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-brand"
        >
          <X size={16} />
        </button>
        <h2 id="tour-title" className="pr-6 text-[15px] font-semibold tracking-[-0.01em]">
          {step.title}
        </h2>
        <p id="tour-body" className="mt-1 text-sm text-ink-muted">
          {step.body}
        </p>

        <div className="mt-4 flex items-center gap-2">
          <div className="flex gap-1" aria-label={`Step ${index + 1} of ${steps.length}`} role="img">
            {steps.map((_, i) => (
              <span key={i} className={`h-1.5 rounded-full transition-all ${i === index ? "w-4 bg-brand" : "w-1.5 bg-line"}`} />
            ))}
          </div>
          <div className="ml-auto flex items-center gap-1">
            {index === 0 ? (
              <button onClick={endTour} className="h-8 rounded-control px-3 text-sm text-ink-muted outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-brand">
                Skip
              </button>
            ) : (
              <button onClick={back} className="h-8 rounded-control px-3 text-sm text-ink-muted outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-brand">
                Back
              </button>
            )}
            <button
              ref={primary}
              onClick={next}
              className="btn-primary h-8 px-3.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1"
            >
              {index === 0 ? "Show Me Around" : last ? "Start Building" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
