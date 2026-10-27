import { useEffect, useState } from "react";
import { openBillingPortal } from "../lib/billing";
import { usernameAvailable, usernameProblem } from "../lib/profiles";
import { useAuth } from "../store/auth";
import { useBilling } from "../store/billing";
import { useUi } from "../store/ui";
import { Modal } from "./Modal";

/** Shaded, borderless fields, like the Edit Playground dialog. */
const field =
  "h-9 w-full rounded-control bg-surface-hover px-3 text-sm outline-none placeholder:text-ink-muted/70 focus:ring-2 focus:ring-brand";
const primary = "h-9 w-full disabled:opacity-50 btn-primary";
const secondary =
  "mt-2 h-9 w-full rounded-control bg-surface-hover text-sm font-medium outline-none hover:bg-ink/10 focus-visible:ring-2 focus-visible:ring-brand";
const label = "mb-1 block text-xs text-ink-muted";
const linkButton = "text-sm text-brand hover:underline disabled:opacity-50";

const MIN_PASSWORD = 8;

type Tab = "signin" | "create";
/** "form" is the Sign In or Create Account form; "code" waits for the emailed code; "confirm" waits for a sign-up confirmation email. */
type Step = "form" | "code" | "confirm";

/** Checks the username as it's typed: format first, then (after a pause) whether it's free. */
function useUsernameCheck(name: string) {
  const [taken, setTaken] = useState<{ name: string; taken: boolean } | null>(null);
  const problem = name ? usernameProblem(name) : null;
  useEffect(() => {
    if (!name || problem) return;
    let cancelled = false;
    const t = setTimeout(() => {
      void usernameAvailable(name).then((free) => {
        if (!cancelled) setTaken({ name, taken: !free });
      });
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [name, problem]);
  const checked = taken?.name === name;
  return {
    hint: problem ?? (checked && taken.taken ? "That username is taken." : null),
    ok: !!name && !problem && checked && !taken.taken,
  };
}

export function AccountDialog({ onClose }: { onClose: () => void }) {
  const { user, username: currentUsername, cloudEnabled, sendCode, verifyCode, signInWithPassword, signUp } = useAuth();
  const { entitlements, billingEnabled } = useBilling();
  const openUpgrade = useUi((u) => u.openUpgrade);

  const [tab, setTab] = useState<Tab>("signin");
  const [step, setStep] = useState<Step>("form");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const check = useUsernameCheck(username.trim());

  const switchTab = (t: Tab) => {
    setTab(t);
    setStep("form");
    setError(null);
    setMessage(null);
  };

  /** Emails a sign-in code and link (Forgot Password). */
  const send = async () => {
    setBusy(true);
    setError(null);
    const err = await sendCode(email.trim());
    setBusy(false);
    if (err) return setError(err);
    setStep("code");
    setCode("");
    setMessage(`We sent a link and a 6-digit code to ${email.trim()}. Click the link, or enter the code here.`);
  };

  const verify = async () => {
    setBusy(true);
    setError(null);
    const err = await verifyCode(email.trim(), code);
    setBusy(false);
    if (err) return setError(err);
    onClose();
  };

  const signIn = async () => {
    setBusy(true);
    setError(null);
    const err = await signInWithPassword(email.trim(), password);
    setBusy(false);
    if (err) return setError(err);
    onClose();
  };

  const create = async () => {
    const name = username.trim();
    setBusy(true);
    setError(null);
    const res = await signUp(email.trim(), password, name);
    setBusy(false);
    if (res.error) return setError(res.error);
    if (res.confirm) {
      setStep("confirm");
      setMessage(`Almost done. We sent a confirmation link to ${email.trim()}. Click it to finish creating your account.`);
    } else onClose();
  };

  const title = user ? "Account" : tab === "create" ? "Create Account" : "Sign In";
  const emailOk = /.+@.+\..+/.test(email.trim());

  return (
    <Modal title={title} onClose={onClose} closeX>
      {!cloudEnabled && <p className="text-sm text-ink-muted">Cloud sign-in is not configured on this build.</p>}

      {cloudEnabled && user && (
        <>
          {currentUsername && (
            <>
              <p className="text-xs text-ink-muted">Username</p>
              <p className="mb-2 text-sm font-medium">{currentUsername}</p>
            </>
          )}
          <p className="text-xs text-ink-muted">Email</p>
          <p className="text-sm font-medium">{user.email}</p>
          {billingEnabled && entitlements && (
            <div className="mt-4 rounded-control bg-surface-hover p-3">
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
                  <button onClick={() => void openBillingPortal().catch((e: Error) => setError(e.message))} className={`mt-2 ${linkButton}`}>
                    Manage Subscription
                  </button>
                )
              ) : (
                <button
                  onClick={() => {
                    onClose();
                    openUpgrade("menu");
                  }}
                  className={`mt-2 ${linkButton}`}
                >
                  Upgrade to Pro
                </button>
              )}
            </div>
          )}
        </>
      )}

      {cloudEnabled && !user && step === "form" && (
        <>
          {tab === "signin" ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void signIn();
              }}
            >
              <label className={label} htmlFor="acct-email">
                Email
              </label>
              <input
                id="acct-email"
                type="email"
                autoFocus
                name="email"
                autoComplete="email"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={`${field} mb-3`}
              />
              <div className="mb-1 flex items-baseline justify-between">
                <label className="text-xs text-ink-muted" htmlFor="acct-password">
                  Password
                </label>
                {/* Emails a sign-in code: for a forgotten password, or an account made with an email link. */}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => (emailOk ? void send() : setError("Enter your email first, and we'll send you a sign-in code."))}
                  className="text-xs text-brand hover:underline disabled:opacity-50"
                >
                  Forgot Password?
                </button>
              </div>
              <input
                id="acct-password"
                type="password"
                name="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`${field} mb-4`}
              />
              <button type="submit" disabled={!emailOk || !password || busy} className={primary}>
                {busy ? "Signing In…" : "Sign In"}
              </button>
              <button type="button" onClick={() => switchTab("create")} className={secondary}>
                Create an Account
              </button>
            </form>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void create();
              }}
            >
              <label className={label} htmlFor="acct-username">
                Username
              </label>
              <input
                id="acct-username"
                autoFocus
                name="username"
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                maxLength={24}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className={`${field} mb-1`}
              />
              <p className={`mb-3 text-xs ${check.hint ? "text-danger" : "text-ink-muted"}`}>
                {check.hint ?? "Shown on playgrounds you share. Letters, numbers, - and _."}
              </p>
              <label className={label} htmlFor="acct-new-email">
                Email
              </label>
              <input
                id="acct-new-email"
                type="email"
                name="email"
                autoComplete="email"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={`${field} mb-3`}
              />
              <label className={label} htmlFor="acct-new-password">
                Password
              </label>
              <input
                id="acct-new-password"
                type="password"
                name="new-password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`${field} mb-1`}
              />
              <p className="mb-4 text-xs text-ink-muted">At least {MIN_PASSWORD} characters.</p>
              <button
                type="submit"
                disabled={!check.ok || !emailOk || password.length < MIN_PASSWORD || busy}
                className={primary}
              >
                {busy ? "Creating…" : "Create Account"}
              </button>
              <p className="mt-3 text-center text-sm text-ink-muted">
                Already have an account?{" "}
                <button type="button" onClick={() => switchTab("signin")} className={linkButton}>
                  Sign In
                </button>
              </p>
            </form>
          )}
        </>
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
            name="code"
            autoComplete="one-time-code"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="done"
            pattern="[0-9 ]*"
            maxLength={9}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            aria-label="6-digit code"
            className={`${field} mb-3 text-center text-lg tracking-[0.4em]`}
          />
          <button type="submit" disabled={code.replace(/\s/g, "").length < 6 || busy} className={primary}>
            {busy ? "Checking…" : "Sign In"}
          </button>
          <div className="mt-3 flex justify-between text-sm">
            <button type="button" onClick={() => void send()} disabled={busy} className={linkButton}>
              Send a New Code
            </button>
            <button type="button" onClick={() => switchTab(tab)} className="text-ink-muted hover:text-ink">
              Back
            </button>
          </div>
        </form>
      )}

      {cloudEnabled && !user && step === "confirm" && (
        <>
          {message && <p className="mb-3 text-sm text-ink-muted">{message}</p>}
          <button type="button" onClick={() => switchTab("signin")} className={linkButton}>
            Back to Sign In
          </button>
        </>
      )}

      {error && <p className="mt-3 text-sm text-danger">{error}</p>}

    </Modal>
  );
}
