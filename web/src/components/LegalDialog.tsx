import { useSyncExternalStore } from "react";
import { analyticsAvailable, analyticsOn, consentSnapshot, setAnalyticsOn, subscribeConsent } from "../lib/analytics";
import { BUY_LINKS } from "../lib/affiliate";
import { useUi } from "../store/ui";
import { Modal } from "./Modal";

/** Last time the text below changed. */
const UPDATED = "October 28, 2026";

const h = "mb-1 mt-4 text-sm font-semibold";
const p = "text-sm text-ink-muted";

/** Terms, disclaimer and privacy notice in one place. Opened from Settings and from the sign-up form. */
export function LegalDialog() {
  const open = useUi((u) => u.legalOpen);
  const close = useUi((u) => u.closeLegal);
  useSyncExternalStore(subscribeConsent, consentSnapshot);
  const analytics = analyticsOn();
  if (!open) return null;
  return (
    <Modal title="Terms, Disclaimer and Privacy" onClose={close} wide closeX>
      <div className="max-h-[65vh] overflow-y-auto pr-1">
        <p className="text-xs text-ink-muted">Updated {UPDATED}</p>

        <h3 className={h}>Planning tool, not a guarantee</h3>
        <p className={p}>
          Pedal Playground is a free tool for planning pedalboards and gear collections. Sizes, layouts, power figures and
          other details come from manufacturers' published specs and from contributors, and may be wrong, out of date or
          approximate. Always check dimensions, power requirements and compatibility with the manufacturer before you buy
          or wire anything. You use the tool at your own risk, and it's provided as is, with no warranties.
        </p>

        <h3 className={h}>Not affiliated</h3>
        <p className={p}>
          Pedal Playground isn't affiliated with, endorsed by or sponsored by any pedal or gear maker. Product names, brands
          and images belong to their owners and appear only to identify the products. If you own a listed product and want it
          changed or removed, find @tehtrav on X or Threads and say so.
        </p>

        <h3 className={h}>Your playgrounds</h3>
        <p className={p}>
          You own what you build. Boards stay on your device until you sign in, and then they're saved to your account. A board
          you share, or add to the public gallery, can be seen by anyone with the link (or by anyone, for the gallery), and
          people may open their own copy. Don't put anything private in a board you share. Keep your account secure; you're
          responsible for what happens under it.
        </p>

        <h3 className={h}>What we collect</h3>
        <p className={p}>
          If you create an account: your email address, your username (which is public on boards you share), and your boards.
          Sign-in and storage run on Supabase. If you buy Pro, Stripe handles your payment details; we never see your card
          number. We count how often catalog gear is added, without recording who added it. We don't sell your data.
        </p>

        <h3 className={h}>Analytics and cookies</h3>
        <p className={p}>
          {analyticsAvailable
            ? "We use Google Analytics 4 to see how the site is used (pages, features, rough location, device type). It sets cookies and sends usage data to Google. Ad personalization is turned off. Where the law asks, we only turn it on if you say yes. You can change your choice for this device here:"
            : "This build doesn't use analytics. If it does in future, we'll say so here."}
        </p>
        {analyticsAvailable && (
          <label className="mt-2 flex cursor-pointer items-center justify-between gap-4 rounded-control bg-surface-hover px-3 py-2 text-sm">
            Usage analytics
            <input
              type="checkbox"
              checked={analytics}
              onChange={(e) => setAnalyticsOn(e.target.checked)}
              className="size-4 accent-[var(--color-brand)]"
            />
          </label>
        )}
        <p className={`${p} mt-2`}>The app also keeps your settings and your unsaved board in your browser's local storage.</p>

        {BUY_LINKS && (
          <>
            <h3 className={h}>Affiliate links</h3>
            <p className={p}>Some Buy links earn us a commission if you purchase, at no extra cost to you.</p>
          </>
        )}

        <h3 className={h}>Using the site</h3>
        <p className={p}>
          Don't misuse the site: no scraping at a scale that harms it, no attacks, and no uploading anything unlawful or that
          infringes someone else's rights. We may change or remove features, limit accounts, or remove content or accounts that
          break these rules. To the extent the law allows, we aren't liable for losses from using the site. Pro is billed
          through Stripe and can be cancelled any time from your account. We may update this page; the date above says when.
        </p>

        <h3 className={h}>Questions or deleting your data</h3>
        <p className={p}>Find @tehtrav on X or Threads and ask. Include the email on your account if it's about your data.</p>
      </div>
    </Modal>
  );
}
