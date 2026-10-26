import { useEffect, useState } from "react";
import { shareUrl } from "../lib/cloud";
import { useAuth } from "../store/auth";
import { useCloud } from "../store/cloud";
import { Modal } from "./Modal";

export function ShareDialog({ onClose, onSignIn }: { onClose: () => void; onSignIn: () => void }) {
  const user = useAuth((s) => s.user);
  const { slug, isPublic, share, stopSharing } = useCloud();
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  // Sharing publishes the current board, so make that the first thing that happens.
  useEffect(() => {
    if (!user) return;
    setBusy(true);
    share()
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Could not share."))
      .finally(() => setBusy(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  if (!user) {
    return (
      <Modal title="Share Playground" onClose={onClose}>
        <p className="mb-3 text-sm text-ink-muted">Sign in to get a link you can share. Your board is saved to your account first.</p>
        <button onClick={onSignIn} className="h-9 w-full btn-primary">
          Sign In
        </button>
      </Modal>
    );
  }

  const url = slug && isPublic ? shareUrl(slug) : "";

  return (
    <Modal title="Share Playground" onClose={onClose}>
      <p className="mb-3 text-sm text-ink-muted">
        Anyone with this link can open their own copy of your playground. Their edits never change yours.
      </p>
      {busy && !url && <p className="text-sm text-ink-muted">Preparing link…</p>}
      {error && <p className="mb-2 text-sm text-danger">{error}</p>}
      {url && (
        <div className="flex gap-2">
          <input readOnly value={url} onFocus={(e) => e.target.select()} className="h-9 min-w-0 flex-1 rounded-control border border-line px-3 text-sm" />
          <button
            onClick={() => {
              void navigator.clipboard?.writeText(url);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
            className="h-9 w-20 btn-primary"
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      )}
      <div className="mt-4 flex items-center justify-between">
        {isPublic ? (
          <button
            onClick={() => void stopSharing().then(onClose)}
            className="text-sm text-danger hover:underline"
          >
            Stop Sharing
          </button>
        ) : (
          <span />
        )}
        <button onClick={onClose} className="h-9 rounded-control px-3 text-sm text-ink-muted hover:bg-surface-hover">
          Close
        </button>
      </div>
    </Modal>
  );
}
