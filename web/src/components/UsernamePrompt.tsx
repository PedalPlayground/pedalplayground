import { useEffect, useState } from "react";
import { saveUsername, usernameAvailable, usernameProblem } from "../lib/profiles";
import { useAuth } from "../store/auth";
import { Modal } from "./Modal";

const field =
  "h-9 w-full rounded-control bg-surface-hover px-3 text-sm outline-none placeholder:text-ink-muted/70 focus:ring-2 focus:ring-brand";

/**
 * Asks a signed-in account without a username (made before usernames, or by an email link that skipped it) to pick
 * one. "Later" hides it until the next visit.
 */
export function UsernamePrompt() {
  const user = useAuth((s) => s.user);
  const username = useAuth((s) => s.username);
  const setStoredUsername = useAuth((s) => s.setUsername);
  const [dismissed, setDismissed] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [taken, setTaken] = useState<string | null>(null);

  const trimmed = name.trim();
  const problem = trimmed ? usernameProblem(trimmed) : null;
  useEffect(() => {
    if (!trimmed || problem) return;
    let cancelled = false;
    const t = setTimeout(() => {
      void usernameAvailable(trimmed).then((free) => !cancelled && setTaken(free ? null : trimmed));
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [trimmed, problem]);

  if (!user || username !== null || dismissed) return null;

  const hint = problem ?? (taken === trimmed ? "That username is taken." : null);
  const save = async () => {
    setBusy(true);
    setError(null);
    const err = await saveUsername(user.id, trimmed);
    setBusy(false);
    if (err) return setError(err);
    setStoredUsername(trimmed);
  };

  return (
    <Modal title="Pick a Username" onClose={() => setDismissed(true)}>
      <p className="mb-3 text-sm text-ink-muted">It's shown on playgrounds you share, like "Gig Board by you".</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <input
          autoFocus
          aria-label="Username"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          maxLength={24}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="tonechaser"
          className={`${field} mb-1`}
        />
        <p className={`mb-4 text-xs ${hint ? "text-danger" : "text-ink-muted"}`}>{hint ?? "Letters, numbers, - and _."}</p>
        {error && <p className="mb-3 text-sm text-danger">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => setDismissed(true)} className="h-9 rounded-control px-3 text-sm text-ink-muted hover:bg-surface-hover">
            Later
          </button>
          <button type="submit" disabled={!trimmed || !!hint || busy} className="h-9 px-3 btn-primary disabled:opacity-50">
            Save
          </button>
        </div>
      </form>
    </Modal>
  );
}
