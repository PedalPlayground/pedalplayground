import { useState } from "react";
import { useAuth } from "../store/auth";

export function AccountDialog({ onClose }: { onClose: () => void }) {
  const { user, cloudEnabled, sendMagicLink } = useAuth();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  const submit = async () => {
    const error = await sendMagicLink(email.trim());
    setStatus(error ?? "Magic link sent. Check your email.");
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/30" onClick={onClose}>
      <div className="w-96 rounded-panel bg-surface p-5 shadow-panel" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-3 text-base font-semibold">Account</h2>
        {!cloudEnabled && <p className="text-sm text-ink-muted">Cloud sign-in is not configured on this build.</p>}
        {cloudEnabled && user && (
          <>
            <p className="text-xs text-ink-muted">Signed in as</p>
            <p className="text-sm font-medium">{user.email}</p>
          </>
        )}
        {cloudEnabled && !user && (
          <>
            <p className="mb-3 text-sm text-ink-muted">Sign in with a magic link. No password needed.</p>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="mb-3 h-9 w-full rounded-control border border-line px-3 text-sm outline-none focus:border-brand"
            />
            <button
              onClick={() => void submit()}
              disabled={!email.trim()}
              className="h-9 w-full rounded-control bg-brand text-sm font-medium text-brand-ink hover:bg-brand-hover disabled:opacity-50"
            >
              Send magic link
            </button>
            {status && <p className="mt-2 text-sm text-ink-muted">{status}</p>}
          </>
        )}
        <button onClick={onClose} className="mt-4 text-sm text-ink-muted hover:text-ink">
          Close
        </button>
      </div>
    </div>
  );
}
