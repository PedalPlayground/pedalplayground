import { Copy, ImageOff, Ratio, ScanSearch, Scissors, type LucideIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { canvasImageUrl, type Manifest } from "../lib/catalog";
import { fieldProblems, runChecks, type Check, type CheckId, type Fields } from "../lib/editorChecks";
import {
  approve,
  fieldsFrom,
  listQueue,
  review,
  sourceUrls,
  submitterHistory,
  updateSubmission,
  uploadSource,
  usernames,
  type Submission,
  type SubmitterHistory,
} from "../lib/editorApi";
import { userGalleryUrl } from "../lib/gallery";
import { useAuth } from "../store/auth";
import { withPublish, type Notice, type PublishState, type SetNotice } from "./EditorApp";
import { Linkified } from "../components/Linkified";
import { Meta } from "../components/Meta";
import { nameLink, RoleBadges } from "../components/RoleBadge";
import { tip } from "../components/Tooltip";
import { fieldBox, fieldHelp, ItemEditor, labelClass, primaryButton, secondaryButton, usePhotoStats } from "./ItemEditor";

/** A queued submission with what the list shows: the submitter's username and a link to the uploaded photo. */
interface Queued extends Submission {
  username: string | null;
  photo: string | null;
}

/** Pending submissions, oldest first. Pick one, fix it if needed, then approve, send back, or reject. */
export function QueueTab({ manifest, publisher, setNotice }: { manifest: Manifest | null; publisher: PublishState; setNotice: SetNotice }) {
  const [queue, setQueue] = useState<Queued[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    listQueue()
      .then(async (q) => {
        // Names and photo links are extras: the queue still shows if either fails.
        const [names, photos] = await Promise.all([
          usernames(q.map((s) => s.submitted_by)).catch(() => new Map<string, string>()),
          sourceUrls(q.flatMap((s) => (s.source_path ? [s.source_path] : []))).catch(() => new Map<string, string>()),
        ]);
        return q.map((s) => ({ ...s, username: names.get(s.submitted_by) ?? null, photo: s.source_path ? (photos.get(s.source_path) ?? null) : null }));
      })
      .then(
        (q) => {
          setQueue(q);
          setOpenId((id) => (id && q.some((s) => s.id === id) ? id : (q[0]?.id ?? null)));
        },
        (e: Error) => setError(e.message),
      );
  }, []);
  useEffect(load, [load]);

  if (error) return <p className="text-[13px] text-danger">Couldn't load the queue: {error}</p>;
  if (!queue) return <p className="text-[13px] text-ink-muted">Loading…</p>;
  if (!queue.length)
    return (
      <p className="text-[15px] text-ink-muted">
        Nothing waiting. New submissions from players will appear here, oldest first.
      </p>
    );

  const open = queue.find((s) => s.id === openId) ?? null;
  return (
    // items-start: the list and the form each keep their own height (a long list doesn't stretch the form's rows).
    <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 md:grid-cols-[300px_minmax(0,1fr)]">
      {/* One column that never grows past 300px: long names truncate instead of running under the form. */}
      <ul className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-1">
        {queue.map((s) => (
          <li key={s.id}>
            <QueueRow submission={s} manifest={manifest} selected={s.id === openId} onOpen={() => setOpenId(s.id)} />
          </li>
        ))}
      </ul>
      {open && (
        <Review
          key={open.id}
          submission={open}
          manifest={manifest}
          onDone={(n) => {
            setNotice(n);
            load();
          }}
          publisher={publisher}
        />
      )}
    </div>
  );
}

/** One submission in the list: its photo, name, labels, who sent it and when, and the photo checks as icons. */
function QueueRow({ submission: s, manifest, selected, onOpen }: { submission: Queued; manifest: Manifest | null; selected: boolean; onOpen: () => void }) {
  // A correction that keeps its photo shows the live one (faded), and has no photo to check.
  const current = !s.source_path && s.target_key ? canvasImageUrl(manifest, s.kind, s.target_key) : null;
  const { stats, broken } = usePhotoStats(s.photo);
  const list = manifest ? (s.kind === "pedal" ? manifest.pedals : manifest.pedalboards) : null;
  const checks = useMemo(
    () => (list ? runChecks(fieldsFrom(s), stats, list, s.target_key ?? undefined) : []),
    [s, stats, list],
  );
  const photoPending = !!s.photo && !stats && !broken;
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-current={selected || undefined}
      className={`flex w-full items-center gap-3 rounded-control p-2 text-left text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-brand ${selected ? "bg-soft" : "hover:bg-surface-hover"}`}
    >
      <span className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-inner bg-canvas">
        {s.photo && !broken ? (
          <img src={s.photo} alt="" className="max-h-12 max-w-12 object-contain" />
        ) : current ? (
          <img src={current} alt="" className="max-h-12 max-w-12 object-contain opacity-50" {...tip("Keeps the current photo")} />
        ) : (
          <ImageOff size={18} className="text-icon" aria-label="No photo" />
        )}
      </span>
      <span className="grid min-w-0 flex-1 gap-1">
        <span className={`truncate ${selected ? "font-semibold" : "font-medium"}`}>
          {s.brand} {s.name}
        </span>
        <span className="flex flex-wrap items-center gap-1">
          <SubmissionLabels submission={s} />
        </span>
        <span className="flex items-center justify-between gap-2 text-xs text-ink-muted">
          <span className="truncate">
            <Meta parts={[s.username ?? "No username", new Date(s.created_at).toLocaleDateString()]} />
          </span>
          <CheckIcons checks={checks} photo={!!s.photo} pending={photoPending} />
        </span>
      </span>
    </button>
  );
}

/** Label colors: each kind of submission and each outcome has its own, tinted from the theme's accent and status colors. */
const label = "inline-flex h-[18px] shrink-0 items-center rounded-full px-1.5 text-[11px] font-semibold leading-none";
const tones = {
  new: "bg-brand/10 text-brand",
  correction: "bg-tangerine/12 text-tangerine",
  board: "bg-group/12 text-group",
  waiting: "bg-soft text-ink-muted",
  sentBack: "bg-warning/15 text-warning",
  approved: "bg-positive/12 text-positive",
  rejected: "bg-danger/12 text-danger",
  resolved: "bg-neutral/12 text-neutral",
} as const;

function Label({ tone, children }: { tone: keyof typeof tones; children: string }) {
  return <span className={`${label} ${tones[tone]}`}>{children}</span>;
}

/** New or Correction, Pedalboard for boards, and Sent back once an editor has asked for changes. */
function SubmissionLabels({ submission: s }: { submission: Pick<Submission, "target_key" | "kind" | "status"> }) {
  return (
    <>
      {s.target_key ? <Label tone="correction">Correction</Label> : <Label tone="new">New</Label>}
      {s.kind === "pedalboard" && <Label tone="board">Pedalboard</Label>}
      {s.status === "needs_changes" && <Label tone="sentBack">Sent back</Label>}
    </>
  );
}

/** Where a past submission ended up. */
function StatusLabel({ status }: { status: Submission["status"] }) {
  if (status === "approved") return <Label tone="approved">Approved</Label>;
  if (status === "rejected") return <Label tone="rejected">Rejected</Label>;
  if (status === "resolved") return <Label tone="resolved">Resolved</Label>;
  if (status === "needs_changes") return <Label tone="sentBack">Sent back</Label>;
  return <Label tone="waiting">Waiting</Label>;
}

const CHECK_ICONS: { id: CheckId; icon: LucideIcon; name: string; photo: boolean }[] = [
  { id: "resolution", icon: ScanSearch, name: "Resolution", photo: true },
  { id: "shape", icon: Ratio, name: "Photo shape", photo: true },
  { id: "cutout", icon: Scissors, name: "Background cutout", photo: true },
  { id: "duplicate", icon: Copy, name: "Duplicates", photo: false },
];

/**
 * The automatic checks as a row of icons: green when it passed, amber when it needs a look, faint when it hasn't run
 * (no photo, or still loading). Hover one for the details, which the item's own checks list spells out too.
 */
function CheckIcons({ checks, photo, pending }: { checks: Check[]; photo: boolean; pending: boolean }) {
  return (
    <span className="flex shrink-0 items-center gap-1">
      {CHECK_ICONS.map(({ id, icon: Icon, name, photo: needsPhoto }) => {
        const c = checks.find((x) => x.id === id);
        const text = c ? c.text : needsPhoto && !photo ? `${name}: no new photo to check` : `${name}: checking…`;
        const tone = c ? (c.ok ? "text-positive" : "text-warning") : "text-icon opacity-40";
        return (
          <span key={id} role="img" aria-label={text} className={`grid size-4 place-items-center ${tone} ${pending && needsPhoto ? "animate-pulse" : ""}`} {...tip(text)}>
            <Icon size={14} strokeWidth={2.25} aria-hidden />
          </span>
        );
      })}
    </span>
  );
}

/**
 * Who sent it and what else they've sent: totals by outcome, and their latest submissions (the open one marked), so
 * a regular with a good record stands out from a first-timer.
 */
function Submitter({ submission }: { submission: Queued }) {
  const [history, setHistory] = useState<SubmitterHistory | null>(null);
  const [error, setError] = useState(false);
  const [all, setAll] = useState(false);
  useEffect(() => {
    submitterHistory(submission.submitted_by).then(setHistory, () => setError(true));
  }, [submission.submitted_by]);

  const c = history?.counts;
  const shown = history ? (all ? history.recent : history.recent.slice(0, 5)) : [];
  return (
    <section className="grid grid-cols-[minmax(0,1fr)] gap-2 rounded-panel bg-card p-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
        <span className="flex items-center gap-1.5">
          <span className="text-ink-muted">From</span>
          {submission.username ? (
            <a href={userGalleryUrl(submission.username)} target="_blank" rel="noreferrer" className={`font-semibold ${nameLink}`}>
              {submission.username}
            </a>
          ) : (
            <span className="font-semibold">No username</span>
          )}
          <RoleBadges username={submission.username} />
        </span>
        {c && history && (
          <span className="text-xs text-ink-muted">
            <Meta
              parts={[
                history.total === 1 ? "First submission" : `${history.total} submitted`,
                c.approved > 0 && `${c.approved} approved`,
                c.rejected > 0 && `${c.rejected} rejected`,
                c.resolved > 0 && `${c.resolved} resolved`,
                c.needs_changes > 0 && `${c.needs_changes} sent back`,
                c.pending > 0 && `${c.pending} waiting`,
              ].map((p) => p && <span className="whitespace-nowrap">{p}</span>)}
            />
          </span>
        )}
        {error && <span className="text-xs text-danger">Couldn't load their history.</span>}
      </div>
      {history && history.total > 1 && (
        <>
          <ul className="grid grid-cols-[minmax(0,1fr)] gap-0.5">
            {shown.map((h) => (
              <li key={h.id} className="flex items-center gap-2 text-xs">
                <span className={`min-w-0 flex-1 truncate ${h.id === submission.id ? "font-semibold" : ""}`}>
                  {h.status === "approved" && h.item_key ? (
                    <a href={`#catalog?kind=${h.kind}&key=${encodeURIComponent(h.item_key)}`} className={nameLink}>
                      {h.brand} {h.name}
                    </a>
                  ) : (
                    <>
                      {h.brand} {h.name}
                    </>
                  )}
                  {h.id === submission.id && <span className="ml-1.5 font-normal text-ink-muted">This one</span>}
                </span>
                {h.target_key && <Label tone="correction">Correction</Label>}
                <StatusLabel status={h.status} />
                <span className="w-[72px] shrink-0 text-right tabular-nums text-ink-muted">{new Date(h.created_at).toLocaleDateString()}</span>
              </li>
            ))}
          </ul>
          {history.recent.length > 5 && (
            <button type="button" className="justify-self-start text-xs font-semibold text-brand hover:underline" onClick={() => setAll((a) => !a)}>
              {all ? "Show fewer" : `Show all ${history.recent.length}${history.total > history.recent.length ? ` of the latest` : ""}`}
            </button>
          )}
        </>
      )}
    </section>
  );
}

function Review({
  submission,
  manifest,
  onDone,
  publisher,
}: {
  submission: Queued;
  manifest: Manifest | null;
  onDone: (n: Notice) => void;
  publisher: PublishState;
}) {
  const userId = useAuth((s) => s.user?.id);
  const [fields, setFields] = useState<Fields>(() => fieldsFrom(submission));
  const [image, setImage] = useState<string | null>(submission.photo);
  const [newFile, setNewFile] = useState<File | null>(null);
  const [note, setNote] = useState(submission.editor_note ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => () => void (newFile && image?.startsWith("blob:") && URL.revokeObjectURL(image)), [newFile, image]);

  const problems = fieldProblems(fields);
  const act = async (fn: () => Promise<Notice>) => {
    setBusy(true);
    setError(null);
    try {
      onDone(await fn());
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };
  /** Saves the editor's fixes (and a replaced photo) before a decision. */
  const save = async () => {
    const path = newFile && userId ? await uploadSource(newFile, userId) : undefined;
    await updateSubmission(submission.id, fields, path);
  };

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-5">
      <div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <h2 className="text-lg font-bold tracking-[-0.01em]">
            {submission.target_key ? `Correction to ${submission.target_key}` : "New item"}
          </h2>
          <span className="flex items-center gap-1">
            <SubmissionLabels submission={submission} />
          </span>
          <span className="text-xs text-ink-muted">{new Date(submission.created_at).toLocaleDateString()}</span>
        </div>
        {submission.note && (
          <p className="mt-1 text-[13px] text-ink-muted">
            <span className="font-semibold text-ink">Submitter's note:</span> <Linkified text={submission.note} />
          </p>
        )}
        {submission.target_key && !submission.source_path && (
          <p className="mt-1 text-[13px] text-ink-muted">This correction keeps the current photo.</p>
        )}
      </div>
      <Submitter submission={submission} />
      <ItemEditor
        fields={fields}
        onChange={setFields}
        image={image}
        onPickFile={(f) => {
          setNewFile(f);
          setImage(URL.createObjectURL(f));
        }}
        manifest={manifest}
        skipImage={submission.target_key ?? undefined}
        lockKind={!!submission.target_key}
      />
      <div>
        <label className={labelClass} htmlFor="queue-note">
          Note to the Submitter
        </label>
        <span id="queue-note-help" className={fieldHelp}>
          Needed for Needs changes or Reject, optional for Resolved
        </span>
        <textarea id="queue-note" aria-describedby="queue-note-help" className={`${fieldBox} h-20 py-2`} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      {problems.length > 0 && <p className="text-[13px] text-danger">{problems.join(" ")}</p>}
      {error && <p className="text-[13px] text-danger">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={primaryButton}
          disabled={busy || problems.length > 0}
          onClick={() =>
            act(async () => {
              await save();
              const key = await approve(submission.id);
              return withPublish(`Approved ${fields.brand} ${fields.name} (${key}).`, await publisher.run());
            })
          }
        >
          Approve
        </button>
        <button
          type="button"
          className={secondaryButton}
          disabled={busy || problems.length > 0}
          onClick={() =>
            act(async () => {
              await save();
              return { text: "Changes saved." };
            })
          }
        >
          Save changes
        </button>
        <button
          type="button"
          className={secondaryButton}
          disabled={busy || !note.trim()}
          title={note.trim() ? undefined : "Write a note first"}
          onClick={() =>
            act(async () => {
              await review(submission.id, "needs_changes", note.trim());
              return { text: "Sent back to the submitter with your note." };
            })
          }
        >
          Needs changes
        </button>
        <button
          type="button"
          className={secondaryButton}
          disabled={busy}
          {...tip("Dealt with another way (fixed by hand, already listed). Takes it off the queue without approving or rejecting")}
          onClick={() =>
            act(async () => {
              await review(submission.id, "resolved", note.trim());
              return { text: `Marked ${submission.brand} ${submission.name} resolved.` };
            })
          }
        >
          Resolved
        </button>
        <button
          type="button"
          className={`${secondaryButton} text-danger`}
          disabled={busy || !note.trim()}
          title={note.trim() ? undefined : "Write a reason first"}
          onClick={() =>
            act(async () => {
              await review(submission.id, "rejected", note.trim());
              return { text: "Rejected." };
            })
          }
        >
          Reject
        </button>
      </div>
    </div>
  );
}
