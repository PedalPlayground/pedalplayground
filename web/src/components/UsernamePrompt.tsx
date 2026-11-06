import { useEffect, useState } from "react";
import { saveUsername, usernameAvailable, usernameFromEmail, usernameProblem } from "../lib/profiles";
import { useAuth } from "../store/auth";
import { useRestriction } from "../store/standing";
import { fieldError, fieldHelp, fieldInput, fieldLabel } from "./formText";
import { Modal } from "./Modal";


/**
 * Asks a signed-in account without a username (made before usernames, or by an email link that skipped it) to pick
 * one. "Later" hides it until the next visit.
 */
export function UsernamePrompt() {
  const user = useAuth((s) => s.user);
  const username = useAuth((s) => s.username);
  const setStoredUsername = useAuth((s) => s.setUsername);
  const [dismissed, setDismissed] = useState(false);
  // A timeout holds back username changes, so don't ask until it's over.
  const { restricted } = useRestriction();
  // Starts as the email's name part (like Create Account) until they type their own.
  const [typed, setName] = useState<string | null>(null);
  const name = typed ?? usernameFromEmail(user?.email ?? "");
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

  if (!user || username !== null || dismissed || restricted) return null;

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
      <p className="mb-3 text-sm text-ink-muted">Shown on playgrounds you share</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <div className="mb-4">
          <label className={fieldLabel} htmlFor="pick-username">
            Username
          </label>
          <span id="pick-username-help" className={fieldHelp}>
            Dashes and underscores allowed
          </span>
          <input
            id="pick-username"
            autoFocus
            aria-describedby={hint ? "pick-username-help pick-username-error" : "pick-username-help"}
            aria-invalid={!!hint}
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            maxLength={24}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="tonechaser"
            className={fieldInput}
          />
          {hint && (
            <span id="pick-username-error" className={fieldError}>
              {hint}
            </span>
          )}
        </div>
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
