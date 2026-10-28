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

export const analyticsOn = (): boolean => {
  try {
    return localStorage.getItem(KEY) !== "off";
  } catch {
    return true;
  }
};

const isLocal = () => ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname) || location.hostname.endsWith(".localhost");

let loaded = false;

/** Loads GA once, if this build has an ID and the visitor hasn't opted out. */
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

/** Turns analytics on or off for this device. Turning it off stops tracking at once; turning it on starts it. */
export function setAnalyticsOn(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
    /* storage unavailable */
  }
  if (GA_ID) (window as unknown as Record<string, unknown>)[`ga-disable-${GA_ID}`] = !on;
  if (on) startAnalytics();
}

/** Sends a named event with small, non-identifying details (never names, emails or board contents). */
export function track(event: string, params?: Record<string, string | number | boolean>) {
  if (!loaded || !analyticsOn()) return;
  window.gtag?.("event", event, params);
}
