import { Check } from "lucide-react";
import { useState } from "react";
import { startCheckout, type Interval } from "../lib/billing";
import { useAuth } from "../store/auth";
import { useCloud } from "../store/cloud";
import { useUi, type UpgradeReason } from "../store/ui";
import { Modal } from "./Modal";

// Display-only labels, for example "$4 / month". Real prices live in Stripe; leave unset to hide them.
const LABELS: Record<Interval, string | undefined> = {
  month: import.meta.env.VITE_PRO_PRICE_MONTHLY as string | undefined,
  year: import.meta.env.VITE_PRO_PRICE_YEARLY as string | undefined,
};

const HEADLINE: Record<UpgradeReason, string> = {
  menu: "Upgrade to Pro",
  limit: "You've used your free playground",
  save: "This playground isn't saved to your account",
  avatar: "Use any pedal as your avatar",
};

const BLURB: Record<UpgradeReason, string> = {
  menu: "Keep as many playgrounds as you like, saved to your account and available on every device.",
  limit: "Free accounts keep one saved playground. Pro lets you save as many as you like.",
  save: "Free accounts keep one saved playground, so changes to this one are only stored on this device. Pro saves them all.",
  avatar: "Free accounts pick an avatar from our featured pedals. Pro lets you search the whole catalog for yours.",
};

const FREE = ["1 saved playground", "Share and fork playgrounds", "Every pedal and pedalboard", "Custom pedals and boards", "Featured pedal avatars"];
const PRO = ["Unlimited saved playgrounds", "Any catalog pedal as your avatar", "Everything in Free"];

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

  if (!reason) return null;

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
          <div className="mb-2 text-sm font-semibold">Pro</div>
          <ul className="space-y-1.5">{PRO.map((f) => <Feature key={f}>{f}</Feature>)}</ul>
        </div>
      </div>

      {!user ? (
        <>
          <p className="mb-3 text-sm text-ink-muted">Sign in first so Pro is attached to your account.</p>
          <button onClick={() => { closeUpgrade(); onSignIn(); }} className="h-9 w-full rounded-control bg-brand text-sm font-medium text-brand-ink hover:bg-brand-hover">
            Sign in
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
                <div className="font-medium">{i === "year" ? "Annual" : "Monthly"}</div>
                {LABELS[i] && <div className="text-xs text-ink-muted">{LABELS[i]}</div>}
              </button>
            ))}
          </div>
          {error && <p className="mb-2 text-sm text-danger">{error}</p>}
          <button
            onClick={() => void checkout()}
            disabled={busy}
            className="h-9 w-full rounded-control bg-brand text-sm font-medium text-brand-ink hover:bg-brand-hover disabled:opacity-50"
          >
            {busy ? "Opening checkout…" : "Continue to checkout"}
          </button>
          <p className="mt-2 text-center text-xs text-ink-muted">Payment is handled securely by Stripe. Cancel anytime from your account.</p>
        </>
      )}

      <div className="mt-4 flex items-center justify-between text-sm">
        {reason === "limit" ? (
          <button onClick={unsavedInstead} className="text-ink-muted hover:text-ink hover:underline">
            Start an unsaved canvas instead
          </button>
        ) : (
          <span />
        )}
        <button onClick={closeUpgrade} className="text-ink-muted hover:text-ink">
          Not now
        </button>
      </div>
    </Modal>
  );
}
