import { useSyncExternalStore } from "react";
import { consentPending, consentSnapshot, setAnalyticsOn, subscribeConsent } from "../lib/analytics";
import { useUi } from "../store/ui";

/** Asks before analytics cookies are set, for visitors where that's required (see lib/analytics). */
export function ConsentBanner() {
  useSyncExternalStore(subscribeConsent, consentSnapshot);
  const busy = useUi((u) => u.tourOpen);
  if (!consentPending() || busy) return null;
  return (
    <div
      role="region"
      aria-label="Analytics consent"
      className="animate-enter fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] left-3 right-3 z-30 rounded-panel bg-surface p-4 shadow-[var(--shadow-modal)] sm:bottom-12 sm:left-4 sm:right-auto sm:w-80 [--enter-y:8px]"
    >
      <p className="text-sm font-semibold tracking-[-0.01em]">Help improve Pedal Playground?</p>
      <p className="mt-1 text-sm text-ink-muted">
        We'd like to use analytics cookies (Google Analytics and Microsoft Clarity) to see how the site gets used.{" "}
        <button onClick={() => useUi.getState().openLegal()} className="underline hover:text-ink">
          Details
        </button>
      </p>
      <div className="mt-3 flex gap-2">
        <button onClick={() => setAnalyticsOn(true)} className="h-8 flex-1 px-3 text-sm btn-primary">
          Allow
        </button>
        <button onClick={() => setAnalyticsOn(false)} className="h-8 flex-1 rounded-control bg-surface-hover px-3 text-sm font-medium hover:bg-ink/10">
          No Thanks
        </button>
      </div>
    </div>
  );
}
