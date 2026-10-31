import { Check } from "lucide-react";
import { useEffect, useState } from "react";
import { fetchPrices, formatPrice, startCheckout, type Interval, type Prices } from "../lib/billing";
import { useAuth } from "../store/auth";
import { useCloud } from "../store/cloud";
import { useUi, type UpgradeReason } from "../store/ui";
import { Modal } from "./Modal";

// Fallback labels, for example "$4 / month", used only if prices can't be loaded from Stripe.
const FALLBACK: Record<Interval, string | undefined> = {
  month: import.meta.env.VITE_PRO_PRICE_MONTHLY as string | undefined,
  year: import.meta.env.VITE_PRO_PRICE_YEARLY as string | undefined,
};

const HEADLINE: Record<UpgradeReason, string> = {
  menu: "Upgrade to Pro",
  limit: "You've Used Your Free Playgrounds",
  save: "This Playground Isn't Saved to Your Account",
  avatar: "Use Any Pedal as Your Avatar",
  copy: "Make Your Own Copy",
};

const BLURB: Record<UpgradeReason, string> = {
  menu: "Keep as many playgrounds as you like, saved to your account and available on every device.",
  limit: "Free accounts keep 3 saved playgrounds. Pro lets you save as many as you like.",
  save: "Free accounts keep 3 saved playgrounds, so changes to this one are only stored on this device. Pro saves them all.",
  avatar: "Free accounts pick an avatar from our featured pedals. Pro lets you search the whole catalog for yours.",
  copy: "Pro lets you copy any shared playground into your account and make it your own.",
};

const FREE = ["3 saved playgrounds", "Share your playgrounds", "Every pedal and pedalboard", "Custom pedals and boards", "Featured pedal avatars"];
const PRO = ["Unlimited saved playgrounds", "Copy shared playgrounds", "Any catalog pedal as your avatar", "Everything in Free"];

interface PriceLabels {
  /** The price for each billing period, e.g. "$4 / month". */
  period: Record<Interval, string | undefined>;
  /** The annual plan's monthly equivalent and saving, e.g. "$3.33 / month, save 17%". */
  yearNote?: string;
  /** One line for the Pro card, e.g. "$4 / month or $40 / year". */
  summary?: string;
}

function priceLabels(prices: Prices | null): PriceLabels {
  const m = prices?.month;
  const y = prices?.year;
  const period = {
    month: m ? `${formatPrice(m.amount, m.currency)} / month` : FALLBACK.month,
    year: y ? `${formatPrice(y.amount, y.currency)} / year` : FALLBACK.year,
  };
  let yearNote: string | undefined;
  if (y) {
    yearNote = `${formatPrice(Math.round(y.amount / 12), y.currency)} / month`;
    const saving = m && m.currency === y.currency ? Math.round((1 - y.amount / (m.amount * 12)) * 100) : 0;
    if (saving > 0) yearNote += `, save ${saving}%`;
  }
  const summary = period.month && period.year ? `${period.month} or ${period.year}` : (period.month ?? period.year);
  return { period, yearNote, summary };
}

function Feature({ children }: { children: string }) {
  return (
    <li className="flex items-start gap-2 text-sm">
      <Check size={14} className="mt-0.5 shrink-0 text-brand" />
      {children}
    </li>
  );
}

export function UpgradeDialog({ onSignIn }: { onSignIn: () => void }) {
  const reason = useUi((u) => u.upgrade);
  const closeUpgrade = useUi((u) => u.closeUpgrade);
  const user = useAuth((s) => s.user);
  const [interval, setInterval] = useState<Interval>("year");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prices, setPrices] = useState<Prices | null>(null);

  useEffect(() => {
    if (!reason) return;
    let live = true;
    fetchPrices()
      .then((p) => live && setPrices(p))
      .catch(() => {}); // fall back to the build-time labels, if any
    return () => {
      live = false;
    };
  }, [reason]);

  if (!reason) return null;
  const labels = priceLabels(prices);

  const checkout = async () => {
    setBusy(true);
    setError(null);
    try {
      await startCheckout(interval); // navigates away on success
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start checkout.");
      setBusy(false);
    }
  };

  const unsavedInstead = () => {
    useCloud.getState().newPlayground();
    closeUpgrade();
  };

  return (
    <Modal title={HEADLINE[reason]} onClose={closeUpgrade} wide>
      <p className="mb-4 text-sm text-ink-muted">{BLURB[reason]}</p>

      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-control border border-line p-3">
          <div className="mb-2 text-sm font-semibold">Free</div>
          <ul className="space-y-1.5">{FREE.map((f) => <Feature key={f}>{f}</Feature>)}</ul>
        </div>
        <div className="rounded-control border-2 border-brand p-3">
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <span className="text-sm font-semibold">Pro</span>
            {labels.summary && <span className="animate-fade text-xs text-ink-muted">{labels.summary}</span>}
          </div>
          <ul className="space-y-1.5">{PRO.map((f) => <Feature key={f}>{f}</Feature>)}</ul>
        </div>
      </div>

      {!user ? (
        <>
          <p className="mb-3 text-sm text-ink-muted">Sign in first so Pro is attached to your account.</p>
          <button onClick={() => { closeUpgrade(); onSignIn(); }} className="h-9 w-full btn-primary">
            Sign In
          </button>
        </>
      ) : (
        <>
          <div className="mb-3 flex gap-2" role="radiogroup" aria-label="Billing period">
            {(["year", "month"] as const).map((i) => (
              <button
                key={i}
                role="radio"
                aria-checked={interval === i}
                onClick={() => setInterval(i)}
                className={`flex-1 rounded-control border px-3 py-2 text-left text-sm ${interval === i ? "border-brand bg-brand/10" : "border-line hover:bg-surface-hover"}`}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-medium">{i === "year" ? "Annual" : "Monthly"}</span>
                  {labels.period[i] && <span className="animate-fade font-medium">{labels.period[i]}</span>}
                </div>
                {i === "year" && labels.yearNote && <div className="animate-fade text-xs text-ink-muted">{labels.yearNote}</div>}
                {i === "month" && labels.period.month && <div className="animate-fade text-xs text-ink-muted">Billed monthly</div>}
              </button>
            ))}
          </div>
          {error && <p className="mb-2 text-sm text-danger">{error}</p>}
          <button
            onClick={() => void checkout()}
            disabled={busy}
            className="h-9 w-full disabled:opacity-50 btn-primary"
          >
            {busy ? "Opening checkout…" : "Continue to Checkout"}
          </button>
          <p className="mt-2 text-center text-xs text-ink-muted">Payment is handled securely by Stripe. Cancel anytime from your account.</p>
        </>
      )}

      <div className="mt-4 flex items-center justify-between text-sm">
        {reason === "limit" ? (
          <button onClick={unsavedInstead} className="text-ink-muted hover:text-ink hover:underline">
            Start an Unsaved Canvas Instead
          </button>
        ) : (
          <span />
        )}
        <button onClick={closeUpgrade} className="text-ink-muted hover:text-ink">
          Not Now
        </button>
      </div>
    </Modal>
  );
}
