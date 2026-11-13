import { ArrowLeft, Copy, ImageOff, Ratio, ScanSearch, Scissors, Search, type LucideIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { canvasImageUrl, type Manifest } from "../lib/catalog";
import { fieldProblems, runChecks, type Check, type CheckId, type Fields } from "../lib/editorChecks";
import {
  approve,
  fieldsFrom,
  getSubmission,
  listSubmissions,
  review,
  sourceUrls,
  submissionCounts,
  submitterHistory,
  updateSubmission,
  uploadSource,
  usernames,
  type QueueFilter,
  type QueueStatus,
  type Submission,
  type SubmitterHistory,
} from "../lib/editorApi";
import { userGalleryUrl } from "../lib/gallery";
import { useAuth } from "../store/auth";
import { withPublish, type Notice, type PublishState, type SetNotice } from "./EditorApp";
import { chip } from "../components/chip";
import { LabeledSelect } from "../components/LabeledSelect";
import { Linkified } from "../components/Linkified";
import { Meta } from "../components/Meta";
import { nameLink, RoleBadges } from "../components/RoleBadge";
import { tip } from "../components/Tooltip";
import { plainField } from "../lib/inputProps";
import { fieldBox, fieldHelp, inputClass, ItemEditor, labelClass, primaryButton, secondaryButton, usePhotoStats } from "./ItemEditor";

/** A submission with what the list shows: the submitter's username and a link to the uploaded photo. */
interface Queued extends Submission {
  username: string | null;
  photo: string | null;
}

/** Adds usernames and photo links. Both are extras: the list still shows if either fails. */
async function withExtras(list: Submission[]): Promise<Queued[]> {
  const [names, photos] = await Promise.all([
    usernames(list.map((s) => s.submitted_by)).catch(() => new Map<string, string>()),
    sourceUrls(list.flatMap((s) => (s.source_path ? [s.source_path] : []))).catch(() => new Map<string, string>()),
  ]);
  return list.map((s) => ({
    ...s,
    username: names.get(s.submitted_by) ?? null,
    photo: s.source_path ? (photos.get(s.source_path) ?? null) : null,
  }));
}

const PAGE = 100;
const isOpen = (s: Submission["status"]) => s === "pending" || s === "needs_changes";

/** The open submission from the address: /editor/#queue?id=<id>. */
const idFromHash = () => new URLSearchParams(window.location.hash.split("?")[1] ?? "").get("id");

const STATUSES: readonly (readonly [QueueStatus, string])[] = [
  ["open", "Open"],
  ["pending", "Waiting"],
  ["needs_changes", "Sent back"],
  ["approved", "Approved"],
  ["rejected", "Rejected"],
  ["resolved", "Resolved"],
  ["all", "All"],
];
const SORTS = [
  ["oldest", "Oldest"],
  ["newest", "Newest"],
  ["brand", "Brand"],
  ["name", "Name"],
] as const;

/**
 * Submissions from players: a full-width list with a search, status chips, filters and sort, and each submission on
 * its own page (#queue?id=…, a history step, so Back returns to the list as it was). Open ones are fixed if needed,
 * then approved, sent back, resolved or rejected; closed ones show how they ended.
 */
export function QueueTab({ manifest, publisher, setNotice }: { manifest: Manifest | null; publisher: PublishState; setNotice: SetNotice }) {
  const [filter, setFilter] = useState<QueueFilter>({
    status: "open",
    change: null,
    kind: null,
    text: "",
    sort: "oldest",
  });
  const [items, setItems] = useState<Queued[] | null>(null);
  const [more, setMore] = useState(false);
  const [counts, setCounts] = useState<Record<Submission["status"], number> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(idFromHash);
  const request = useRef(0);

  const load = async (page: number) => {
    const id = ++request.current;
    try {
      const rows = await withExtras(await listSubmissions(filter, page, PAGE));
      if (id !== request.current) return;
      setItems((list) => (page === 0 ? rows : [...(list ?? []), ...rows]));
      setMore(rows.length === PAGE);
      setError(null);
    } catch (e) {
      if (id === request.current) setError((e as Error).message);
    }
  };
  const refresh = () => {
    void load(0);
    submissionCounts().then(setCounts, () => setCounts(null));
  };
  useEffect(() => {
    setItems(null);
    // Typing waits a moment; the chips and menus load straight away.
    const t = setTimeout(() => void load(0), filter.text ? 250 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);
  useEffect(() => {
    submissionCounts().then(setCounts, () => setCounts(null));
  }, []);

  useEffect(() => {
    const onPop = () => setOpenId(idFromHash());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  const openSubmission = (id: string) => {
    history.pushState({ ppQueueItem: true }, "", `#queue?id=${id}`);
    setOpenId(id);
  };
  const closeSubmission = () => {
    if ((history.state as { ppQueueItem?: boolean } | null)?.ppQueueItem) history.back();
    else {
      history.replaceState(null, "", "#queue");
      setOpenId(null);
    }
  };

  if (openId)
    return (
      <SubmissionPage
        key={openId}
        id={openId}
        loaded={items?.find((s) => s.id === openId) ?? null}
        manifest={manifest}
        publisher={publisher}
        onBack={closeSubmission}
        onNotice={setNotice}
        onDone={(n) => {
          setNotice(n);
          closeSubmission();
          refresh();
        }}
      />
    );

  const set = (patch: Partial<QueueFilter>) => setFilter((f) => ({ ...f, ...patch }));
  const countFor = (st: QueueStatus) => {
    if (!counts) return null;
    if (st === "all") return Object.values(counts).reduce((a, b) => a + b, 0);
    if (st === "open") return counts.pending + counts.needs_changes;
    return counts[st];
  };
  const narrowed = filter.change || filter.kind || filter.text.trim();
  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-4">
      {/* Search, the status chips, then the filters and sort at the right, across the full width (like Gallery's bar). */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="relative w-full sm:w-80">
          <Search size={16} strokeWidth={2} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-icon" aria-hidden />
          <input
            type="search"
            {...plainField}
            aria-label="Search the queue"
            className={`${inputClass} pl-9`}
            placeholder="Search brand, name, note or user"
            value={filter.text}
            onChange={(e) => set({ text: e.target.value })}
          />
        </div>
        {/* Scrolls sideways on phones, with room around the chips for their hairlines (like Gallery's type chips). */}
        <div
          className="pointer-events-none -mx-4 -my-1 flex gap-2 overflow-x-auto px-4 py-1 max-sm:basis-[calc(100%+2rem)] sm:-mx-1 sm:px-1 [&>*]:pointer-events-auto"
          role="group"
          aria-label="Status"
        >
          {STATUSES.map(([st, label]) => {
            const n = countFor(st);
            const on = filter.status === st;
            return (
              <button
                key={st}
                type="button"
                className={chip(on)}
                aria-pressed={on}
                // Open ones read oldest first (first come, first served); finished ones newest first.
                onClick={() =>
                  set({
                    status: st,
                    sort:
                      filter.sort === "oldest" || filter.sort === "newest"
                        ? st === "open" || st === "pending" || st === "needs_changes"
                          ? "oldest"
                          : "newest"
                        : filter.sort,
                  })
                }
              >
                {label}
                {n !== null && <span className={`ml-1.5 tabular-nums ${on ? "opacity-70" : ""}`}>{n.toLocaleString("en-US")}</span>}
              </button>
            );
          })}
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-x-6 gap-y-2">
          <LabeledSelect
            label="Change"
            value={filter.change ?? "any"}
            options={[
              ["any", "Any"],
              ["new", "New items"],
              ["correction", "Corrections"],
            ]}
            onChange={(v) => set({ change: v === "any" ? null : v })}
          />
          <LabeledSelect
            label="Kind"
            value={filter.kind ?? "any"}
            options={[
              ["any", "Any"],
              ["pedal", "Pedals"],
              ["pedalboard", "Pedalboards"],
            ]}
            onChange={(v) => set({ kind: v === "any" ? null : v })}
          />
          <LabeledSelect label="Sort by" value={filter.sort} options={SORTS} onChange={(v) => set({ sort: v })} />
        </div>
      </div>

      {error && <p className="text-[13px] text-danger">Couldn't load the queue: {error}</p>}
      {!items && !error && <p className="text-[13px] text-ink-muted">Loading…</p>}
      {items && items.length === 0 && (
        <p className="text-[15px] text-ink-muted">
          {narrowed
            ? "Nothing matches."
            : filter.status === "open"
              ? "Nothing waiting. New submissions from players will appear here, oldest first."
              : "None yet."}
          {narrowed && (
            <button
              type="button"
              className="ml-3 text-[13px] font-semibold text-brand hover:underline"
              onClick={() => set({ change: null, kind: null, text: "" })}
            >
              Clear filters
            </button>
          )}
        </p>
      )}

      {items && items.length > 0 && (
        <div className="rounded-panel border border-line">
          {/* Column names on wider screens; phones stack each row instead. */}
          <div
            className={`${rowGrid} sticky top-[6.5rem] z-10 hidden h-10 items-center rounded-t-panel border-b border-line bg-card px-3 text-xs font-semibold text-ink-muted md:grid`}
          >
            <span className="pl-[4.25rem]">Item</span>
            <span>From</span>
            <span>Sent</span>
            <span>Checks</span>
            <span className="text-right">Status</span>
          </div>
          <ul className="grid divide-y divide-line">
            {items.map((s) => (
              <li key={s.id}>
                <QueueRow submission={s} manifest={manifest} onOpen={() => openSubmission(s.id)} />
              </li>
            ))}
          </ul>
        </div>
      )}
      {more && (
        <button type="button" className={`${secondaryButton} justify-self-center`} onClick={() => void load(Math.ceil((items?.length ?? 0) / PAGE))}>
          Show more
        </button>
      )}
    </div>
  );
}

/** The list's columns from md up: item, from, sent, checks, status. */
const rowGrid = "md:grid-cols-[minmax(0,1fr)_minmax(0,11rem)_6rem_5.5rem_6rem] md:gap-4";

/** One submission in the list: its photo, name, labels, who sent it and when, the photo checks as icons, and its status. */
function QueueRow({ submission: s, manifest, onOpen }: { submission: Queued; manifest: Manifest | null; onOpen: () => void }) {
  // A correction that keeps its photo shows the live one (faded), and has no photo to check.
  const current = !s.source_path && s.target_key ? canvasImageUrl(manifest, s.kind, s.target_key) : null;
  const open = isOpen(s.status);
  // Checks only matter while it's open (an approved item would match itself as a duplicate), so finished ones skip
  // loading the photo's stats.
  const { stats, broken } = usePhotoStats(open ? s.photo : null);
  const list = manifest ? (s.kind === "pedal" ? manifest.pedals : manifest.pedalboards) : null;
  const checks = useMemo(() => (open && list ? runChecks(fieldsFrom(s), stats, list, s.target_key ?? undefined) : []), [s, stats, list, open]);
  const photoPending = !!s.photo && !stats && !broken;
  const date = new Date(s.created_at).toLocaleDateString();
  return (
    // A real link, so it can open in a new tab; a plain click opens it here as a history step.
    <a
      href={`#queue?id=${s.id}`}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        e.preventDefault();
        onOpen();
      }}
      className={`${rowGrid} group grid grid-cols-[3.5rem_minmax(0,1fr)] items-center gap-x-3 gap-y-1 px-3 py-2.5 text-[13px] outline-none transition-colors hover:bg-card-hover focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand`}
    >
      <span className="flex min-w-0 items-center gap-3 max-md:contents">
        <span className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-inner bg-canvas max-md:row-span-3">
          {s.photo && !broken ? (
            <img src={s.photo} alt="" className="max-h-12 max-w-12 object-contain" loading="lazy" />
          ) : current ? (
            <img src={current} alt="" className="max-h-12 max-w-12 object-contain opacity-50" {...tip("Keeps the current photo")} />
          ) : (
            <ImageOff size={18} className="text-icon" aria-label="No photo" />
          )}
        </span>
        <span className="grid min-w-0 gap-1">
          <span className="truncate font-semibold group-hover:underline">
            {s.brand} {s.name}
          </span>
          <span className="flex flex-wrap items-center gap-1">
            <SubmissionLabels submission={s} />
          </span>
        </span>
      </span>
      {/* Phones: who and when on one line, with the checks and status after it. */}
      <span className="truncate text-ink-muted md:text-ink max-md:col-start-2 max-md:text-xs">
        <span className="md:hidden">
          <Meta parts={[s.username ?? "No username", date]} />
        </span>
        <span className="max-md:hidden">{s.username ?? <span className="text-ink-muted">No username</span>}</span>
      </span>
      <span className="tabular-nums text-ink-muted max-md:hidden">{date}</span>
      <span className="flex items-center justify-between gap-2 max-md:col-start-2 md:contents">
        <span>{open && <CheckIcons checks={checks} photo={!!s.photo} pending={photoPending} />}</span>
        <span className="flex justify-end">
          <StatusLabel status={s.status} />
        </span>
      </span>
    </a>
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

/** New or Correction, and Pedalboard for boards. (Where it stands is its StatusLabel.) */
function SubmissionLabels({ submission: s }: { submission: Pick<Submission, "target_key" | "kind"> }) {
  return (
    <>
      {s.target_key ? <Label tone="correction">Correction</Label> : <Label tone="new">New</Label>}
      {s.kind === "pedalboard" && <Label tone="board">Pedalboard</Label>}
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
          <span
            key={id}
            role="img"
            aria-label={text}
            className={`grid size-4 place-items-center ${tone} ${pending && needsPhoto ? "animate-pulse" : ""}`}
            {...tip(text)}
          >
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
                  {/* Each one opens its own page here (an approved one links on to the Catalog from there). */}
                  {h.id === submission.id ? (
                    <>
                      {h.brand} {h.name}
                    </>
                  ) : (
                    <a href={`#queue?id=${h.id}`} className={nameLink}>
                      {h.brand} {h.name}
                    </a>
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

/** One submission on its own page: the one already in the list, or fetched (opened from a link or after a reload). */
function SubmissionPage({
  id,
  loaded,
  manifest,
  publisher,
  onBack,
  onDone,
  onNotice,
}: {
  id: string;
  loaded: Queued | null;
  manifest: Manifest | null;
  publisher: PublishState;
  onBack: () => void;
  onDone: (n: Notice) => void;
  onNotice: (n: Notice) => void;
}) {
  const [submission, setSubmission] = useState<Queued | null>(loaded);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (loaded) return;
    getSubmission(id)
      .then(async (s) => (s ? (await withExtras([s]))[0] : null))
      .then(
        (s) => (s ? setSubmission(s) : setError("This submission doesn't exist (or was withdrawn).")),
        (e: Error) => setError(e.message),
      );
  }, [id, loaded]);

  const back = (
    <button type="button" className={`${secondaryButton} flex shrink-0 items-center gap-1`} onClick={onBack}>
      <ArrowLeft size={14} strokeWidth={2.5} />
      Back
    </button>
  );
  if (!submission)
    return (
      <div className="flex flex-wrap items-center gap-3">
        {back}
        {error ? <p className="text-[13px] text-danger">{error}</p> : <p className="text-[13px] text-ink-muted">Loading…</p>}
      </div>
    );
  return <Review submission={submission} manifest={manifest} onDone={onDone} onNotice={onNotice} publisher={publisher} back={back} />;
}

function Review({
  submission,
  manifest,
  onDone,
  publisher,
  back,
  onNotice,
}: {
  submission: Queued;
  manifest: Manifest | null;
  onDone: (n: Notice) => void;
  publisher: PublishState;
  back: ReactNode;
  onNotice: (n: Notice) => void;
}) {
  const userId = useAuth((s) => s.user?.id);
  const [fields, setFields] = useState<Fields>(() => fieldsFrom(submission));
  const [image, setImage] = useState<string | null>(submission.photo);
  const [newFile, setNewFile] = useState<File | null>(null);
  const [note, setNote] = useState(submission.editor_note ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Approved, rejected or resolved: shown as it ended, nothing to change. */
  const closed = !isOpen(submission.status);

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

  const outcome = closed && (
    <div className="grid gap-1 rounded-panel bg-card p-3 text-[13px]">
      <p className="flex flex-wrap items-center gap-2">
        <StatusLabel status={submission.status} />
        {submission.reviewed_at && <span className="text-xs text-ink-muted">{new Date(submission.reviewed_at).toLocaleDateString()}</span>}
        {submission.status === "approved" && submission.item_key && (
          <a
            href={`#catalog?kind=${submission.kind}&key=${encodeURIComponent(submission.item_key)}`}
            className="text-xs font-semibold text-brand hover:underline"
          >
            Open in Catalog
          </a>
        )}
      </p>
      {submission.editor_note && (
        <p className="text-ink-muted">
          <span className="font-semibold text-ink">Note to the submitter:</span> {submission.editor_note}
        </p>
      )}
    </div>
  );

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-5">
      <div className="grid gap-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          {back}
          <h2 className="text-lg font-bold tracking-[-0.01em]">
            {submission.brand} {submission.name}
          </h2>
          <span className="flex items-center gap-1">
            <SubmissionLabels submission={submission} />
            <StatusLabel status={submission.status} />
          </span>
          <span className="text-xs text-ink-muted">
            <Meta parts={[submission.target_key && `Correction to ${submission.target_key}`, `Sent ${new Date(submission.created_at).toLocaleDateString()}`]} />
          </span>
        </div>
        {submission.note && (
          <p className="mt-1 text-[13px] text-ink-muted">
            <span className="font-semibold text-ink">Submitter's note:</span> <Linkified text={submission.note} />
          </p>
        )}
        {submission.target_key && !submission.source_path && <p className="mt-1 text-[13px] text-ink-muted">This correction keeps the current photo.</p>}
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
          skipImage={submission.item_key ?? submission.target_key ?? undefined}
          lockKind={!!submission.target_key}
          formEnd={
            closed ? (
              outcome
            ) : (
              <>
                <div>
                  <label className={labelClass} htmlFor="queue-note">
                    Note to the Submitter
                  </label>
                  <span id="queue-note-help" className={fieldHelp}>
                    Needed for Needs changes or Reject, optional for Resolved
                  </span>
                  <textarea
                    id="queue-note"
                    aria-describedby="queue-note-help"
                    className={`${fieldBox} h-20 py-2`}
                    maxLength={1000}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
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
                      void (async () => {
                        // Saving keeps the page open; the decisions go back to the list.
                        setBusy(true);
                        setError(null);
                        try {
                          await save();
                          onNotice({ text: "Changes saved." });
                        } catch (e) {
                          setError((e as Error).message);
                        }
                        setBusy(false);
                      })()
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
                        return {
                          text: "Sent back to the submitter with your note.",
                        };
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
                        return {
                          text: `Marked ${submission.brand} ${submission.name} resolved.`,
                        };
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
              </>
            )
          }
          asideEnd={<Submitter submission={submission} />}
          // A finished one can't be changed: its fields show as they were, switched off.
          readOnly={closed}
        />
    </div>
  );
}
