import { useCallback, useEffect, useState } from "react";
import type { Manifest } from "../lib/catalog";
import { fieldProblems, type Fields } from "../lib/editorChecks";
import { approve, fieldsFrom, listQueue, review, sourceUrl, updateSubmission, uploadSource, type Submission } from "../lib/editorApi";
import { useAuth } from "../store/auth";
import { withPublish, type Notice, type PublishState, type SetNotice } from "./EditorApp";
import { inputClass, ItemEditor, labelClass, primaryButton, secondaryButton } from "./ItemEditor";

/** Pending submissions, oldest first. Pick one, fix it if needed, then approve, send back, or reject. */
export function QueueTab({ manifest, publisher, setNotice }: { manifest: Manifest | null; publisher: PublishState; setNotice: SetNotice }) {
  const [queue, setQueue] = useState<Submission[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    listQueue().then(
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
    <div className="grid gap-6 md:grid-cols-[220px_minmax(0,1fr)]">
      <ul className="grid content-start gap-1">
        {queue.map((s) => (
          <li key={s.id}>
            <button
              type="button"
              onClick={() => setOpenId(s.id)}
              className={`w-full rounded-[5px] px-2.5 py-2 text-left text-[13px] ${s.id === openId ? "bg-surface shadow-sm" : "hover:bg-surface-hover"}`}
            >
              <span className="block truncate font-semibold">
                {s.brand} {s.name}
              </span>
              <span className="block text-xs text-ink-muted">
                {s.target_key ? "Correction" : "New"} · {new Date(s.created_at).toLocaleDateString()}
                {s.status === "needs_changes" && " · sent back"}
              </span>
            </button>
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

function Review({
  submission,
  manifest,
  onDone,
  publisher,
}: {
  submission: Submission;
  manifest: Manifest | null;
  onDone: (n: Notice) => void;
  publisher: PublishState;
}) {
  const userId = useAuth((s) => s.user?.id);
  const [fields, setFields] = useState<Fields>(() => fieldsFrom(submission));
  const [image, setImage] = useState<string | null>(null);
  const [newFile, setNewFile] = useState<File | null>(null);
  const [note, setNote] = useState(submission.editor_note ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (submission.source_path) sourceUrl(submission.source_path).then(setImage, () => setImage(null));
  }, [submission.source_path]);
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
    <div className="grid gap-5">
      <div>
        <h2 className="text-lg font-bold tracking-[-0.01em]">
          {submission.target_key ? `Correction to ${submission.target_key}` : "New item"}
        </h2>
        {submission.note && (
          <p className="mt-1 text-[13px] text-ink-muted">
            <span className="font-semibold text-ink">Submitter's note:</span> {submission.note}
          </p>
        )}
        {submission.target_key && !submission.source_path && (
          <p className="mt-1 text-[13px] text-ink-muted">This correction keeps the current photo.</p>
        )}
      </div>
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
        <label className={labelClass}>Note to the submitter (for Needs changes or Reject)</label>
        <textarea className={`${inputClass} h-20 py-1.5`} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
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
