import { useState } from "react";
import { REASONS, reportContent, type Reason, type ReportKind } from "../lib/moderation";
import { fieldBox, fieldHelp, fieldLabel } from "./formText";
import { Modal } from "./Modal";

/** Report a comment, a board or a user to the editors: pick a reason, add details if you like. */
export function ReportDialog({ kind, target, what, onClose }: { kind: ReportKind; target: string; what: string; onClose: () => void }) {
  const [reason, setReason] = useState<Reason | null>(null);
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const needsDetails = reason === "other" && !details.trim();
  const title = kind === "comment" ? "Report Comment" : kind === "board" ? "Report Board" : "Report User";

  if (sent)
    return (
      <Modal title="Thanks for the Report" onClose={onClose} closeX>
        <p className="text-sm">An editor will take a look. We don't tell anyone who sent it.</p>
        <button type="button" onClick={onClose} className="mt-4 h-9 w-full btn-primary">
          Done
        </button>
      </Modal>
    );

  const send = async () => {
    if (!reason || needsDetails) return;
    setBusy(true);
    setError(null);
    const err = await reportContent(kind, target, reason, details);
    setBusy(false);
    if (err) setError(err);
    else setSent(true);
  };

  return (
    <Modal title={title} onClose={onClose} closeX>
      <p className="mb-3 truncate text-sm text-ink-muted" title={what}>
        {what}
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <span className={fieldLabel}>What's wrong?</span>
        <div role="radiogroup" aria-label="Reason" className="mb-3 grid gap-1">
          {REASONS.map((r) => (
            <label
              key={r.code}
              className={`flex cursor-pointer items-start gap-2.5 rounded-control px-2.5 py-2 ${reason === r.code ? "bg-brand/10" : "hover:bg-surface-hover"}`}
            >
              <input type="radio" name="report-reason" checked={reason === r.code} onChange={() => setReason(r.code)} className="mt-1 accent-[var(--color-brand)]" />
              <span>
                <span className="block text-sm font-medium">{r.label}</span>
                <span className="block text-xs text-ink-muted">{r.hint}</span>
              </span>
            </label>
          ))}
        </div>
        <div className="mb-4">
          <label className={fieldLabel} htmlFor="report-details">
            Details
          </label>
          <span id="report-details-help" className={fieldHelp}>
            {reason === "other" ? "Required for Something else" : "Optional"}
          </span>
          <textarea
            id="report-details"
            aria-describedby="report-details-help"
            value={details}
            maxLength={1000}
            rows={3}
            onChange={(e) => setDetails(e.target.value)}
            className={`${fieldBox} block resize-none py-2`}
          />
        </div>
        {error && <p className="mb-3 text-sm text-danger">{error}</p>}
        <button type="submit" disabled={!reason || needsDetails || busy} className="h-9 w-full btn-primary disabled:opacity-50">
          {busy ? "Sending…" : "Send Report"}
        </button>
      </form>
    </Modal>
  );
}
