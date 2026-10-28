import { Sparkles, X } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { usableFeaturedPedals } from "../lib/featuredPedals";
import { useAuth } from "../store/auth";
import { useBilling } from "../store/billing";
import { useCatalog } from "../store/catalog";
import { usePlayground } from "../store/playground";
import { useUi } from "../store/ui";

interface Step {
  /** `data-tour` value of the element to point at. No target shows a centered card. */
  target?: string;
  /** Spotlight padding around the target; negative pulls it inside (for the full-size canvas). */
  pad?: number;
  title: string;
  body: string;
  /** A hero across the top of the card: "intro" is the big shimmering "2.0"; "pro" is a quieter Pro banner. */
  hero?: "intro" | "pro";
}

const coarse = () => typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;

/** `pro`: the account already has Pro, so the Pro step is left out. `billing`: Pro is on sale at all. */
function buildSteps(signedIn: boolean, cloudEnabled: boolean, pro: boolean, billing: boolean): Step[] {
  const touch = coarse();
  const steps: Step[] = [
    {
      hero: "intro",
      title: "Welcome to Pedal Playground 2.0!",
      body: "Plan, arrange and show off your pedalboard or gear collection before you buy a thing. New in 2.0: sign in to keep your boards on every device, share them with a link, and build on a snappy canvas that zooms to any size.",
    },
    {
      target: "add",
      title: "Add Gear",
      body: "Search for gear to add to your Playground.",
    },
    {
      target: "selection",
      title: "Arrange Your Board",
      body: touch
        ? "Drag gear to move it, pinch to zoom, and drag empty space to pan. Tap a piece for its menu: rotate, lock, layer, swap or remove."
        : "Drag gear to move it. Scroll to pan, and pinch or hold ⌘/Ctrl while scrolling to zoom. Click a piece for its menu: rotate, lock, layer, swap or remove.",
    },
  ];
  if (cloudEnabled) {
    steps.push(
      signedIn
        ? { target: "account", title: "Your Playgrounds", body: "Everything you build saves to your account. Find all your boards here, and share any of them with a link." }
        : {
            target: "account",
            title: "Save Your Work",
            body: "Your playground is saved temporarily on this device. Sign in to save it to your account, open it anywhere, and share it with a link.",
          },
    );
    // Last: Pro, with its own (quieter) hero.
    if (billing && !pro) {
      steps.push({
        hero: "pro",
        title: "Go Pro",
        body: "Pro gives you unlimited saved playgrounds, copies of anyone's shared boards, and any pedal as your avatar. It also keeps Pedal Playground running.",
      });
    }
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
 * Gives the tour a pedal to point at: the first pedal already on the Playground, or else one classic pedal added to
 * the empty canvas. It ends up selected, so its halo and the selection menu are on screen.
 */
async function stageDemoPedal() {
  useUi.getState().setMode("playground");
  const play = usePlayground.getState();
  const existing = play.items.find((i) => i.kind === "pedal") ?? play.items[0];
  if (existing) return play.reveal(existing.id);
  const manifest = await useCatalog.getState().load();
  if (!manifest || usePlayground.getState().items.length) return;
  const key = usableFeaturedPedals(manifest)[0];
  const pedal = manifest.pedals.find((p) => p.image === key) ?? manifest.pedals[0];
  if (!pedal) return;
  demo = { before: usePlayground.getState().toDocument() };
  usePlayground.getState().addCatalogItem("pedal", pedal);
  demo.id = usePlayground.getState().selected[0];
}

/** The pedal the tour added to an empty canvas, and the board from just before, so the tour can take it away again. */
let demo: { before: ReturnType<ReturnType<typeof usePlayground.getState>["toDocument"]>; id?: string } | null = null;

/** Takes the tour's demo pedal back off (if nothing else was added since), leaving the canvas empty with no undo step. */
function removeDemoPedal() {
  const d = demo;
  demo = null;
  const { items } = usePlayground.getState();
  if (!d?.id || items.length !== 1 || items[0].id !== d.id) return;
  usePlayground.getState().loadDocument(d.before);
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
    const { billingEnabled, entitlements } = useBilling.getState();
    setSteps(buildSteps(signedIn, cloudEnabled, entitlements?.plan === "pro", billingEnabled));
    setIndex(0);
    void stageDemoPedal();
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

  // The demo pedal and its menu can appear after a step is shown (the catalog loads first), so measure again then.
  const selectedCount = usePlayground((p) => p.selected.length);
  useEffect(() => {
    if (!open) return;
    const f = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(f);
  }, [open, selectedCount, measure]);

  useEffect(() => {
    if (!open) return;
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [open, measure]);

  // Ending the tour takes the demo pedal back off. Finishing then drops the user straight into adding gear;
  // skipping just closes it.
  const close = useCallback(() => {
    removeDemoPedal();
    endTour();
  }, [endTour]);
  const finish = useCallback(() => {
    close();
    useUi.getState().setSearchOpen(true);
  }, [close]);
  const next = useCallback(() => (last ? finish() : setIndex((i) => i + 1)), [last, finish]);
  const back = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") back();
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    // Capture so the canvas's own shortcuts (arrows nudge, Esc deselects) don't also fire.
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, next, back, close]);

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
        className="pointer-events-none absolute rounded-[10px] shadow-[0_0_0_9999px_rgb(10_11_16/0.65)] motion-safe:transition-all motion-safe:duration-300 motion-safe:ease-out"
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
        // A fresh card per step that slides in on one axis only (from the side its target is on), rather than gliding
        // diagonally from the last step's spot.
        key={index}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        aria-describedby="tour-body"
        className={`absolute ${step.hero ? "w-[min(360px,calc(100vw-24px))] overflow-hidden" : "w-[min(320px,calc(100vw-24px))]"} rounded-panel bg-surface p-4 shadow-panel ${
          cardSize ? `animate-enter ${arrow?.side === "bottom" ? "[--enter-y:6px]" : arrow ? "[--enter-y:-6px]" : "[--enter-y:8px]"}` : ""
        }`}
        style={{ left, top, opacity: cardSize ? 1 : 0 }}
      >
        {arrow && (
          <span
            aria-hidden
            className={`absolute size-3 rotate-45 bg-surface ${arrow.side === "bottom" ? "-bottom-1.5" : "-top-1.5"}`}
            style={{ left: arrow.x - 6 }}
          />
        )}
        {step.hero === "intro" && (
          <div aria-hidden className="tour-hero relative -mx-4 -mt-4 mb-4 grid h-40 place-items-center overflow-hidden">
            <span className="shimmer-text text-[88px] font-bold leading-none tracking-[-0.04em]">2.0</span>
          </div>
        )}
        {step.hero === "pro" && (
          <div aria-hidden className="tour-hero-pro relative -mx-4 -mt-4 mb-4 flex h-24 items-center justify-center gap-2 overflow-hidden">
            <Sparkles size={22} className="text-white/85" />
            <span className="text-[40px] font-bold leading-none tracking-[-0.03em] text-white">Pro</span>
          </div>
        )}
        <button
          onClick={close}
          aria-label="Close tour"
          className={`absolute right-2 top-2 z-10 grid size-7 place-items-center rounded-control outline-none focus-visible:ring-2 focus-visible:ring-brand ${
            step.hero ? "text-white/80 hover:bg-white/15 hover:text-white" : "text-ink-muted hover:bg-surface-hover"
          }`}
        >
          <X size={16} />
        </button>
        <h2 id="tour-title" className={`pr-6 font-semibold tracking-[-0.01em] ${step.hero ? "text-lg" : "text-[15px]"}`}>
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
            {step.hero === "pro" ? (
              <button
                onClick={() => {
                  close();
                  useUi.getState().openUpgrade("menu");
                }}
                className="h-8 rounded-control px-3 text-sm text-brand outline-none hover:underline focus-visible:ring-2 focus-visible:ring-brand"
              >
                See Pro
              </button>
            ) : index === 0 ? (
              <button onClick={close} className="h-8 rounded-control px-3 text-sm text-ink-muted outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-brand">
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
