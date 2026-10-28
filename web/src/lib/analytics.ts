/**
 * Google Analytics 4. Off unless VITE_GA_ID (a "G-XXXXXXXXXX" measurement ID) is set at build time, never on
 * localhost, and off for anyone who turns "Usage analytics" off in Settings. Ads personalization is disabled.
 */
const GA_ID = import.meta.env.VITE_GA_ID as string | undefined;
const KEY = "pp:analytics";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

/** True when this build has an analytics ID, so Settings only offers the switch when it does something. */
export const analyticsAvailable = !!GA_ID;

/**
 * Who is asked before analytics starts. "regional" (the default) asks visitors whose time zone is in Europe, where
 * cookie-consent rules apply, and counts everyone else in unless they opt out. "all" asks everyone; "off" never asks.
 * Set with VITE_CONSENT at build time.
 */
const CONSENT_MODE = (import.meta.env.VITE_CONSENT as string | undefined) ?? "regional";

const inConsentRegion = (): boolean => {
  try {
    return /^(Europe|Atlantic\/(Reykjavik|Faroe|Canary|Madeira|Azores))\//.test(Intl.DateTimeFormat().resolvedOptions().timeZone);
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

/** Loads GA once, if this build has an ID and the visitor allows it. */
export function startAnalytics() {
  if (!GA_ID || loaded || isLocal() || !analyticsOn()) return;
  loaded = true;
  window.dataLayer = window.dataLayer || [];
  window.gtag = function () {
    // gtag requires the arguments object itself, not an array.
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer!.push(arguments);
  };
  window.gtag("js", new Date());
  window.gtag("config", GA_ID, { allow_google_signals: false, allow_ad_personalization_signals: false });
  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_ID)}`;
  document.head.appendChild(script);
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
  listeners.forEach((fn) => fn());
}

/** Sends a named event with small, non-identifying details (never names, emails or board contents). */
export function track(event: string, params?: Record<string, string | number | boolean>) {
  if (!loaded || !analyticsOn()) return;
  window.gtag?.("event", event, params);
}
