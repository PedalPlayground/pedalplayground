import type { EmailOtpType } from "@supabase/supabase-js";
import { useState } from "react";
import { useAuth } from "../store/auth";
import { Modal } from "./Modal";

/**
 * Landing step for the emailed link (`?token_hash=…&type=email`). Verification waits for a click,
 * so email scanners and link previews that load the page can't use up the one-time token.
 */
export function ConfirmSignIn({ tokenHash, type, onDone }: { tokenHash: string; type: EmailOtpType; onDone: () => void }) {
  const confirm = useAuth((s) => s.confirmTokenHash);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const go = async () => {
    setBusy(true);
    const err = await confirm(tokenHash, type);
    setBusy(false);
    if (err) setError(`${err} If the link was already used, sign in with the code from the email instead.`);
    else onDone();
  };

  return (
    <Modal title="Finish Signing In" onClose={onDone}>
      <p className="mb-3 text-sm text-ink-muted">Confirm to sign in to Pedal Playground on this device.</p>
      {error && <p className="mb-3 text-sm text-danger">{error}</p>}
      <button
        onClick={() => void go()}
        disabled={busy}
        className="h-9 w-full disabled:opacity-50 btn-primary"
      >
        {busy ? "Signing in…" : "Sign In"}
      </button>
      <button onClick={onDone} className="mt-3 text-sm text-ink-muted hover:text-ink">
        Cancel
      </button>
    </Modal>
  );
}
