import { useState } from "react";
import { openBillingPortal } from "../lib/billing";
import { useAuth } from "../store/auth";
import { useBilling } from "../store/billing";
import { useUi } from "../store/ui";
import { Modal } from "./Modal";

const field =
  "h-9 w-full rounded-control border border-line bg-surface px-3 text-sm outline-none focus:border-brand placeholder:text-ink-muted";
const primary =
  "h-9 w-full disabled:opacity-50 btn-primary";

export function AccountDialog({ onClose }: { onClose: () => void }) {
  const { user, cloudEnabled, sendCode, verifyCode } = useAuth();
  const { entitlements, billingEnabled } = useBilling();
  const openUpgrade = useUi((u) => u.openUpgrade);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    setBusy(true);
    setError(null);
    const err = await sendCode(email.trim());
    setBusy(false);
    if (err) return setError(err);
    setStep("code");
    setCode("");
    setMessage(`We sent a 6-digit code to ${email.trim()}.`);
  };

  const verify = async () => {
    setBusy(true);
    setError(null);
    const err = await verifyCode(email.trim(), code);
    setBusy(false);
    if (err) return setError(err);
    onClose();
  };

  return (
    <Modal title="Account" onClose={onClose}>
      {!cloudEnabled && <p className="text-sm text-ink-muted">Cloud sign-in is not configured on this build.</p>}

      {cloudEnabled && user && (
        <>
          <p className="text-xs text-ink-muted">Signed in as</p>
          <p className="text-sm font-medium">{user.email}</p>
          {billingEnabled && entitlements && (
            <div className="mt-4 rounded-control border border-line p-3">
              <div className="text-sm font-medium">{entitlements.plan === "pro" ? "Pro" : "Free Plan"}</div>
              <div className="mt-0.5 text-xs text-ink-muted">
                {entitlements.plan === "pro"
                  ? entitlements.currentPeriodEnd
                    ? `${entitlements.cancelAtPeriodEnd ? "Ends" : "Renews"} ${new Date(entitlements.currentPeriodEnd).toLocaleDateString()}`
                    : "Unlimited Playgrounds"
                  : `${entitlements.playgroundCount} of ${entitlements.maxPlaygrounds ?? "unlimited"} playground${entitlements.maxPlaygrounds === 1 ? "" : "s"} used`}
              </div>
              {entitlements.plan === "pro" ? (
                entitlements.status && (
                  <button
                    onClick={() => void openBillingPortal().catch((e: Error) => setError(e.message))}
                    className="mt-2 text-sm text-brand hover:underline"
                  >
                    Manage Subscription
                  </button>
                )
              ) : (
                <button onClick={() => { onClose(); openUpgrade("menu"); }} className="mt-2 text-sm text-brand hover:underline">
                  Upgrade to Pro
                </button>
              )}
            </div>
          )}
        </>
      )}

      {cloudEnabled && !user && step === "email" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <p className="mb-3 text-sm text-ink-muted">Sign in with your email. We'll send you a code, no password needed.</p>
          <input
            type="email"
            autoFocus
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className={`${field} mb-3`}
          />
          <button type="submit" disabled={!email.trim() || busy} className={primary}>
            {busy ? "Sending…" : "Email Me a Code"}
          </button>
        </form>
      )}

      {cloudEnabled && !user && step === "code" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void verify();
          }}
        >
          {message && <p className="mb-3 text-sm text-ink-muted">{message}</p>}
          <input
            autoFocus
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9 ]*"
            maxLength={9}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="123456"
            aria-label="6-digit code"
            className={`${field} mb-3 text-center text-lg tracking-[0.4em]`}
          />
          <button type="submit" disabled={code.replace(/\s/g, "").length < 6 || busy} className={primary}>
            {busy ? "Checking…" : "Sign In"}
          </button>
          <div className="mt-3 flex justify-between text-sm">
            <button type="button" onClick={() => void send()} disabled={busy} className="text-brand hover:underline disabled:opacity-50">
              Send a New Code
            </button>
            <button type="button" onClick={() => { setStep("email"); setError(null); setMessage(null); }} className="text-ink-muted hover:text-ink">
              Use a Different Email
            </button>
          </div>
        </form>
      )}

      {error && <p className="mt-3 text-sm text-danger">{error}</p>}

      <button onClick={onClose} className="mt-4 text-sm text-ink-muted hover:text-ink">
        Close
      </button>
    </Modal>
  );
}
