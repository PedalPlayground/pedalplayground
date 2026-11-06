import { useEffect } from "react";
import { reasonLabel, shortDate, type Flag } from "../lib/moderation";
import { useAuth } from "../store/auth";
import { useStanding } from "../store/standing";
import { useUi } from "../store/ui";
import { Modal } from "./Modal";

const result = (f: Flag) =>
  f.action === "ban"
    ? "This account is banned."
    : f.action === "timeout" && f.ends_at
      ? `You can't comment, like, share to the gallery or change your username until ${shortDate(f.ends_at)}.`
      : "This is a warning. Another flag can lead to a timeout or a ban.";

/**
 * Shown once per flag, on the next visit after an editor flags the account (playground, gallery and editor alike).
 * A banned account is signed out after "I Understand".
 */
export function StandingNotice() {
  const userId = useAuth((s) => s.user?.id ?? null);
  const signOut = useAuth((s) => s.signOut);
  const { unseen, banned, load, acknowledge } = useStanding();

  useEffect(() => void load(!!userId), [userId, load]);

  if (!userId || (!unseen.length && !banned)) return null;
  const done = async () => {
    await acknowledge();
    if (banned) await signOut();
  };
  const latest = unseen[0];

  return (
    <Modal title="Your Account Has Been Flagged" onClose={() => void done()}>
      {latest ? (
        <div className="grid gap-3 text-sm">
          <p>An editor flagged your account for breaking the site's rules.</p>
          <div className="rounded-control bg-surface-hover p-3">
            <p className="font-semibold">{reasonLabel(latest.reason)}</p>
            {latest.note && <p className="mt-1 whitespace-pre-line text-ink-muted">{latest.note}</p>}
          </div>
          <p>{result(latest)}</p>
          {unseen.length > 1 && <p className="text-xs text-ink-muted">This account has {unseen.length} new flags.</p>}
        </div>
      ) : (
        <p className="text-sm">This account is banned for breaking the site's rules.</p>
      )}
      <p className="mt-3 text-xs text-ink-muted">
        Flags can lead to timeouts and bans. See the{" "}
        <button type="button" onClick={() => useUi.getState().openLegal()} className="underline hover:text-ink">
          Terms &amp; Privacy
        </button>
      </p>
      <button type="button" onClick={() => void done()} className="mt-4 h-9 w-full btn-primary">
        I Understand
      </button>
    </Modal>
  );
}
