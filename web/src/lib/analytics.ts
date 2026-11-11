/**
 * Google Analytics 4 and Microsoft Clarity (session replays and heatmaps). Each is off unless its ID is set at build
 * time (VITE_GA_ID "G-XXXXXXXXXX", VITE_CLARITY_ID), never runs on localhost, and stops for anyone who says no or turns
 * "Usage analytics" off in Terms & Privacy. GA's ads personalization is disabled.
 */
const GA_ID = import.meta.env.VITE_GA_ID as string | undefined;
const CLARITY_ID = import.meta.env.VITE_CLARITY_ID as string | undefined;
const KEY = "pp:analytics";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    clarity?: (...args: unknown[]) => void;
  }
}

/** True when this build has an analytics ID, so Settings only offers the switch when it does something. */
export const analyticsAvailable = !!GA_ID || !!CLARITY_ID;

/**
 * Who is asked before analytics starts. "regional" (the default) asks visitors whose time zone is in Europe, where
 * cookie-consent rules apply, and counts everyone else in unless they opt out. "all" asks everyone; "off" never asks.
 * Set with VITE_CONSENT at build time.
 */
const CONSENT_MODE = (import.meta.env.VITE_CONSENT as string | undefined) ?? "regional";

const inConsentRegion = (): boolean => {
  try {
    return /^(Europe\/|Atlantic\/(Reykjavik|Faroe|Canary|Madeira|Azores)$)/.test(Intl.DateTimeFormat().resolvedOptions().timeZone);
  } catch {
    return true; // can't tell, so ask
  }
};

export const consentRequired = (): boolean => CONSENT_MODE === "all" || (CONSENT_MODE !== "off" && inConsentRegion());

type Choice = "on" | "off" | null;
const choice = (): Choice => {
  try {
    const v = localStorage.getItem(KEY);
    return v === "on" || v === "off" ? v : null;
  } catch {
    return null;
  }
};

/** Analytics runs when the visitor said yes, or hasn't been asked and doesn't need to be. */
export const analyticsOn = (): boolean => {
  const c = choice();
  return c ? c === "on" : !consentRequired();
};

/** True while the banner should be showing: analytics exists, consent is needed, and nobody has answered yet. */
export const consentPending = (): boolean => analyticsAvailable && consentRequired() && choice() === null;

const listeners = new Set<() => void>();
export const subscribeConsent = (fn: () => void) => {
  listeners.add(fn);
  return () => void listeners.delete(fn);
};
/** A snapshot for useSyncExternalStore: changes whenever the answer does. */
export const consentSnapshot = (): string => `${choice()}|${consentPending()}`;

const isLocal = () => ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname) || location.hostname.endsWith(".localhost");

let loaded = false;

/** Loads Microsoft Clarity's tag. */
function startClarity(id: string) {
  window.clarity =
    window.clarity ||
    function () {
      // eslint-disable-next-line prefer-rest-params
      ((window.clarity as unknown as { q?: unknown[] }).q = (window.clarity as unknown as { q?: unknown[] }).q || []).push(arguments);
    };
  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.clarity.ms/tag/${encodeURIComponent(id)}`;
  document.head.appendChild(script);
}

/** The signed-in account, kept so Clarity can be told even if it starts after sign-in. */
let identity: { id: string; name?: string } | null = null;

function sendIdentity() {
  if (!identity || !loaded || !analyticsOn()) return;
  // Clarity hashes the ID in the browser before sending it. The username is public anyway (it's shown on shared
  // boards) and labels the recording in the dashboard. Never pass an email here.
  window.clarity?.("identify", identity.id, undefined, undefined, identity.name);
}

/** Links Clarity recordings to the signed-in account (null when signed out). Does nothing if analytics is off. */
export function identifyUser(id: string | null, name?: string | null) {
  identity = id ? { id, name: name ?? undefined } : null;
  sendIdentity();
}

/** Loads GA and Clarity once, for whichever IDs this build has, if the visitor allows it. */
export function startAnalytics() {
  if (!analyticsAvailable || loaded || isLocal() || !analyticsOn()) return;
  loaded = true;
  if (CLARITY_ID) {
    startClarity(CLARITY_ID);
    sendIdentity();
  }
  if (!GA_ID) return;
  window.dataLayer = window.dataLayer || [];
  window.gtag = function () {
    // gtag requires the arguments object itself, not an array.
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer!.push(arguments);
  };
  window.gtag("js", new Date());
  // Page views are sent by trackPage, one per screen, so GA's own first one is off. Its address is cleaned too, so a
  // sign-in link's token or a typed search never reaches GA.
  window.gtag("config", GA_ID, {
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
    send_page_view: false,
    page_location: cleanLocation(),
  });
  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_ID)}`;
  document.head.appendChild(script);
  sendPage();
}

/** Records the visitor's choice. Yes starts analytics; no stops it at once. */
export function setAnalyticsOn(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
    /* storage unavailable */
  }
  if (GA_ID) (window as unknown as Record<string, unknown>)[`ga-disable-${GA_ID}`] = !on;
  if (on) startAnalytics();
  else window.clarity?.("stop");
  listeners.forEach((fn) => fn());
}

/** Address parts that say which screen this is. Everything else (sign-in tokens, search text) is left out. */
const KEEP_PARAMS = ["p", "item", "kind", "brand", "type", "sort", "user"];

/** This page's address with only KEEP_PARAMS, for GA's page_location. */
function cleanLocation(): string {
  const from = new URLSearchParams(location.search);
  const kept = new URLSearchParams();
  for (const k of KEEP_PARAMS) {
    const v = from.get(k);
    if (v) kept.set(k, v);
  }
  const qs = kept.toString();
  return `${location.origin}${location.pathname}${qs ? `?${qs}` : ""}`;
}

/** The screen showing now, kept so its page view can go out once analytics starts (after a yes in the banner). */
let page: string | null = null;
/** The last page view sent, so a screen that re-renders isn't counted twice. */
let sentPage: string | null = null;

function sendPage() {
  if (!page || !loaded || !analyticsOn() || !window.gtag || !GA_ID) return;
  const page_location = cleanLocation();
  const page_title = `${page} · Pedal Playground`;
  const key = `${page_title}|${page_location}`;
  if (key === sentPage) return;
  sentPage = key;
  // Later events (track) are filed under this screen too.
  window.gtag("set", { page_location, page_title });
  window.gtag("event", "page_view", { page_location, page_title });
}

/**
 * Records a page view for the screen now showing ("Playground", "Shared Board", "Gallery", "Gear", or a gear item's
 * name). Call it whenever the screen changes; GA's Pages and Screens report lists them by these titles.
 */
export function trackPage(title: string) {
  page = title;
  sendPage();
}

type Params = Record<string, string | number | boolean>;

/** `localStorage["pp:analytics-debug"] = "1"` logs every event to the console, even on localhost where nothing is sent. */
const debugging = (): boolean => {
  try {
    return localStorage.getItem("pp:analytics-debug") === "1";
  } catch {
    return false;
  }
};

/** Sends a named event with small, non-identifying details (never names, emails or board contents). */
export function track(event: string, params?: Params) {
  if (debugging()) console.info("[analytics]", event, params ?? {});
  if (!loaded || !analyticsOn()) return;
  window.gtag?.("event", event, params);
}

/**
 * Where a playground tool was used from, so GA can show which controls people reach for. "toolbar" is the bottom bar
 * (and the big Add Gear button on wide screens), "side_menu" the stacks down the sides on wide screens, "object_menu"
 * the bar across the top on tablets, "mini_menu" the pill under the selection, "right_click" the context menu,
 * "shortcut" a key, "gesture" a wheel, trackpad or pinch, "panel" a tool's own panel, "settings" the cog menu,
 * "canvas" a button on the canvas itself, "switcher" the playground name menu, "dialog" a dialog's own buttons.
 */
export type ToolVia =
  | "toolbar"
  | "side_menu"
  | "object_menu"
  | "mini_menu"
  | "right_click"
  | "shortcut"
  | "gesture"
  | "panel"
  | "settings"
  | "canvas"
  | "switcher"
  | "dialog";

/**
 * Counts one use of a playground tool as a `tool_use` event: `tool` says which (rotate, zoom_in, plug_add...) and `via`
 * where from. Every playground control goes through here, so one GA report ranks them all. `extra` is for small fixed
 * values only (a plug type, on/off), never typed text.
 */
export function trackTool(tool: string, via: ToolVia, extra?: Params) {
  track("tool_use", { tool, via, ...extra });
}

/** Wraps an action so using it is counted first. For onClick and onSelect handlers. */
export const withTool =
  (tool: string, via: ToolVia, fn: () => void, extra?: Params) =>
  () => {
    trackTool(tool, via, extra);
    fn();
  };

const lastBurst = new Map<string, number>();

/**
 * For tools used in quick bursts (arrow-key nudges, wheel and pinch zoom): counts one use per burst, a burst ending
 * after `gapMs` without another.
 */
export function trackToolBurst(tool: string, via: ToolVia, gapMs = 2000) {
  const key = `${tool}|${via}`;
  const now = Date.now();
  const last = lastBurst.get(key) ?? 0;
  lastBurst.set(key, now);
  if (now - last > gapMs) trackTool(tool, via);
}
