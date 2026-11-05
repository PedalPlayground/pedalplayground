import { useState } from "react";
import { useAuth } from "../store/auth";
import { Modal } from "./Modal";

export const MIN_PASSWORD = 8;

const field =
  "h-9 w-full rounded-control bg-surface-hover px-3 text-sm outline-none placeholder:text-ink-muted/70 focus:ring-2 focus:ring-brand";
const label = "mb-1 block text-xs text-ink-muted";

/** New password, typed twice. Used after a password reset and for Change Password. */
export function SetPasswordForm({ onDone, onCancel, cancelLabel = "Cancel" }: { onDone: () => void; onCancel: () => void; cancelLabel?: string }) {
  const { user, updatePassword } = useAuth();
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mismatch = again.length >= password.length && again !== password;

  const save = async () => {
    setBusy(true);
    setError(null);
    const err = await updatePassword(password);
    setBusy(false);
    if (err) setError(err);
    else onDone();
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      {/* Lets password managers save the new password against the right account. */}
      <input type="email" name="email" autoComplete="username" value={user?.email ?? ""} readOnly hidden />
      <label className={label} htmlFor="new-password">
        New Password
      </label>
      <input
        id="new-password"
        type="password"
        autoFocus
        name="new-password"
        autoComplete="new-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className={`${field} mb-1`}
      />
      <p className="mb-3 text-xs text-ink-muted">At least {MIN_PASSWORD} characters</p>
      <label className={label} htmlFor="new-password-again">
        Confirm New Password
      </label>
      <input
        id="new-password-again"
        type="password"
        name="new-password-again"
        autoComplete="new-password"
        value={again}
        onChange={(e) => setAgain(e.target.value)}
        className={`${field} mb-1`}
      />
      <p className={`mb-4 text-xs ${mismatch && again ? "text-danger" : "text-ink-muted"}`}>
        {mismatch && again ? "The passwords don't match." : "Type it again to be sure"}
      </p>
      <button type="submit" disabled={password.length < MIN_PASSWORD || again !== password || busy} className="h-9 w-full disabled:opacity-50 btn-primary">
        {busy ? "Saving…" : "Save Password"}
      </button>
      <button type="button" onClick={onCancel} className="mt-3 text-sm text-ink-muted hover:text-ink">
        {cancelLabel}
      </button>
      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
    </form>
  );
}

/**
 * Shown after someone signs in from a password reset link or code, until they set a new password or skip it.
 * Rendered by each page so it appears wherever the reset lands.
 */
export function SetPasswordDialog() {
  const recovering = useAuth((s) => s.recovering);
  const endRecovery = useAuth((s) => s.endRecovery);
  const [saved, setSaved] = useState(false);
  const close = () => {
    setSaved(false);
    endRecovery();
  };
  if (!recovering) return null;
  if (saved)
    return (
      <Modal title="Password Saved" onClose={close}>
        <p className="mb-4 text-sm text-ink-muted">You're signed in, and your new password is ready for next time.</p>
        <button onClick={close} className="h-9 w-full btn-primary">
          Done
        </button>
      </Modal>
    );
  return (
    <Modal title="Set a New Password" onClose={endRecovery}>
      <p className="mb-3 text-sm text-ink-muted">You're signed in. Choose a new password for next time.</p>
      <SetPasswordForm onDone={() => setSaved(true)} onCancel={endRecovery} cancelLabel="Skip for Now" />
    </Modal>
  );
}
