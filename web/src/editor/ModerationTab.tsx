import { useEffect, useState } from "react";
import { fetchShared, setGalleryThumbnail, uploadBoardThumbnail } from "../lib/cloud";
import { closeBugReport, listBugReports, listEditors, setEditor, type BugReport, type EditorAccount } from "../lib/editorApi";
import { fetchGalleryBoards, GALLERY_PAGE_SIZE } from "../lib/gallery";
import { renderThumbnailFile } from "../lib/thumbnail";
import { fieldBox, fieldError, fieldHelp, fieldInput, fieldLabel } from "../components/formText";
import {
  closeReport,
  fetchActivity,
  fetchHiddenBoards,
  fetchReports,
  flagUser,
  liftFlag,
  lookupUser,
  REASONS,
  reasonLabel,
  shortDate,
  suggestedAction,
  TIMEOUT_DAYS,
  type Flag,
  type Activity,
  type FlagAction,
  type HiddenBoard,
  type ModUser,
  type Reason,
  type Report,
} from "../lib/moderation";
import { boardUrl, setGalleryHidden } from "../lib/gallery";
import type { SetNotice } from "./EditorApp";
import { Linkified } from "../components/Linkified";
import { Meta } from "../components/Meta";
import { primaryButton, secondaryButton } from "./ItemEditor";

const ACTIONS: { action: FlagAction; label: string }[] = [
  { action: "warning", label: "Warning" },
  { action: "timeout", label: "Timeout" },
  { action: "ban", label: "Ban" },
];

const ago = (iso: string) => {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return `${Math.max(1, mins)}m ago`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)}h ago`;
  return shortDate(iso);
};

const flagResult = (f: Flag) =>
  f.action === "ban" ? "Ban" : f.action === "timeout" && f.ends_at ? `Timeout until ${shortDate(f.ends_at)}` : "Warning";

/** The username in the address (#moderation?user=name), from a comment's Flag User link. */
const userFromHash = () => new URLSearchParams(window.location.hash.split("?")[1] ?? "").get("user") ?? "";

/**
 * The feed: reports from players (oldest first), then boards hidden from the gallery (newest first). And accounts by
 * username: their flags, and a form to flag them (warning,
 * timeout or ban, with the next step suggested from their history).
 */
export function ModerationTab({ setNotice, isAdmin = false }: { setNotice: SetNotice; /** Admins manage who's an editor. */ isAdmin?: boolean }) {
  /** Admins: who can edit (null while loading). */
  const [editors, setEditors] = useState<EditorAccount[] | null>(null);
  const loadEditors = () => {
    if (isAdmin) void listEditors().then(setEditors, () => setEditors([]));
  };
  useEffect(loadEditors, [isAdmin]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggleEditor = async (userId: string, username: string, make: boolean) => {
    if (!make && !window.confirm(`Stop ${username} being an editor?`)) return;
    try {
      await setEditor(userId, make);
      setNotice({ text: make ? `${username} is now an editor. They'll see Admin in the header next time they load a page.` : `${username} is no longer an editor.` });
      loadEditors();
    } catch (e) {
      setNotice({ text: (e as Error).message, error: true });
    }
  };
  const [reports, setReports] = useState<Report[] | null>(null);
  const [hidden, setHidden] = useState<HiddenBoard[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(userFromHash);
  const [user, setUser] = useState<ModUser | null | undefined>(undefined);
  /** The report being acted on, so flagging resolves it. */
  const [fromReport, setFromReport] = useState<Report | null>(null);

  const loadReports = () =>
    Promise.all([fetchReports(), fetchHiddenBoards()]).then(
      ([r, h]) => {
        setReports(r);
        setHidden(h);
      },
      (e: Error) => setError(e.message),
    );
  /** Looks up an account. A new lookup is a history step (#moderation?user=name), so Back returns to the last view. */
  const look = async (username: string, report: Report | null = null, push = true) => {
    if (!username.trim()) return;
    if (push && userFromHash() !== username) history.pushState(null, "", `#moderation?user=${encodeURIComponent(username)}`);
    setName(username);
    setFromReport(report);
    try {
      setUser(await lookupUser(username));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  useEffect(() => {
    void loadReports();
    const first = userFromHash();
    if (first) void look(first, null, false);
    const onHash = () => {
      if (!window.location.hash.startsWith("#moderation")) return;
      const u = userFromHash();
      if (u) void look(u, null, false);
      else {
        setUser(undefined);
        setName("");
      }
    };
    window.addEventListener("hashchange", onHash);
    window.addEventListener("popstate", onHash);
    return () => {
      window.removeEventListener("hashchange", onHash);
      window.removeEventListener("popstate", onHash);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const unhide = async (b: HiddenBoard) => {
    if (b.by_ban && !window.confirm(`A ban on ${b.owner_username ?? "this account"} hid "${b.name}". Show it in the gallery anyway?`)) return;
    try {
      await setGalleryHidden(b.playground_id, false);
      setNotice({ text: `"${b.name}" is back in the gallery.` });
      void loadReports();
    } catch (e) {
      setNotice({ text: (e as Error).message, error: true });
    }
  };

  const dismiss = async (r: Report) => {
    try {
      await closeReport(r.id, "dismissed");
      setNotice({ text: "Report dismissed." });
      void loadReports();
    } catch (e) {
      setNotice({ text: (e as Error).message, error: true });
    }
  };

  return (
    <div className="grid gap-8 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <section className="grid content-start gap-3">
        <h2 className="text-lg font-bold tracking-[-0.01em]">Reports {reports && reports.length > 0 && <span className="font-normal text-ink-muted">{reports.length}</span>}</h2>
        {error && <p className="text-[13px] text-danger">{error}</p>}
        {!reports && !error && <p className="text-[13px] text-ink-muted">Loading…</p>}
        {reports?.length === 0 && <p className="text-[13px] text-ink-muted">No open reports.</p>}
        <ul className="grid gap-2">
          {reports?.map((r) => (
            <li key={r.id} className="rounded-panel border border-line px-3 py-2.5 text-[13px]">
              <div className="flex flex-wrap items-center gap-x-2.5 text-xs text-ink-muted">
                <span className="font-semibold text-ink">{reasonLabel(r.reason)}</span>
                <span>
                  {r.target_kind === "comment" ? "Comment" : r.target_kind === "board" ? "Board" : "User"} by {r.target_username ?? "unknown"}
                </span>
                <span>{ago(r.created_at)}</span>
              </div>
              {r.target_text && <p className="mt-1 line-clamp-3 whitespace-pre-line break-words">“{r.target_text}”</p>}
              {r.details && (
                <p className="mt-1 text-ink-muted">
                  Reporter: <Linkified text={r.details} />
                </p>
              )}
              <p className="mt-1 text-xs text-ink-muted">
                <Meta
                  parts={[
                    `From ${r.reporter_username ?? "unknown"}`,
                    `${r.open_against} open ${r.open_against === 1 ? "report" : "reports"} and ${r.flags_against} ${r.flags_against === 1 ? "flag" : "flags"} on this account`,
                  ]}
                />
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {r.target_username && (
                  <button type="button" className={primaryButton} onClick={() => void look(r.target_username!, r)}>
                    Review User
                  </button>
                )}
                {r.board_slug && (
                  <a href={boardUrl(r.board_slug)} target="_blank" rel="noreferrer" className={`${secondaryButton} inline-flex items-center`}>
                    Open Board
                  </a>
                )}
                <button type="button" className={secondaryButton} onClick={() => void dismiss(r)}>
                  Dismiss
                </button>
              </div>
            </li>
          ))}
        </ul>

        <h3 className="mt-3 text-sm font-semibold">
          Hidden from the Gallery {hidden && hidden.length > 0 && <span className="font-normal text-ink-muted">{hidden.length}</span>}
        </h3>
        {hidden?.length === 0 && <p className="text-[13px] text-ink-muted">No hidden boards.</p>}
        <ul className="grid gap-2">
          {hidden?.map((b) => (
            <li key={b.playground_id} className="rounded-panel border border-line px-3 py-2.5 text-[13px]">
              <div className="flex flex-wrap items-center gap-x-2.5 text-xs text-ink-muted">
                <span className="font-semibold text-ink">{b.by_ban ? "Hidden by a ban" : "Hidden"}</span>
                <span>Board by {b.owner_username ?? "unknown"}</span>
                <span>
                  {ago(b.hidden_at)}
                  {b.hidden_by_username && ` by ${b.hidden_by_username}`}
                </span>
              </div>
              <p className="mt-1 break-words">“{b.name}”</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {b.owner_username && (
                  <button type="button" className={secondaryButton} onClick={() => void look(b.owner_username!)}>
                    Review User
                  </button>
                )}
                {b.slug && (
                  <a href={boardUrl(b.slug)} target="_blank" rel="noreferrer" className={`${secondaryButton} inline-flex items-center`}>
                    Open Board
                  </a>
                )}
                <button type="button" className={secondaryButton} onClick={() => void unhide(b)}>
                  Unhide
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="grid content-start gap-3">
        <h2 className="text-lg font-bold tracking-[-0.01em]">Look Up User</h2>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void look(name);
          }}
        >
          <input aria-label="Username" placeholder="Username" value={name} onChange={(e) => setName(e.target.value.replace(/^@/, ""))} className={fieldInput} />
          <button type="submit" className={`${secondaryButton} shrink-0`} disabled={!name.trim()}>
            Look Up
          </button>
        </form>
        {user === null && <p className="text-[13px] text-ink-muted">No account has that username.</p>}
        {user && (
          <UserPanel
            key={`${user.user_id}-${fromReport?.id ?? ""}`}
            user={user}
            report={fromReport}
            onChanged={async (text) => {
              setNotice({ text });
              setFromReport(null);
              await look(user.username);
              void loadReports();
            }}
            setNotice={setNotice}
          />
        )}
        {/* Admins: make this person an editor, or stop them being one. */}
        {user && isAdmin && editors && (() => {
          const role = editors.find((e) => e.user_id === user.user_id);
          return (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-panel bg-card px-3 py-2.5">
              <span className="text-[13px]">
                {role?.admin ? (
                  <>
                    <span className="font-semibold">{user.username}</span> is an admin.
                  </>
                ) : role ? (
                  <>
                    <span className="font-semibold">{user.username}</span> is an editor.
                  </>
                ) : (
                  <>Editors can update the catalog, approve the queue and moderate. Only admins change permissions or post What's New.</>
                )}
              </span>
              {!role?.admin &&
                (role ? (
                  <button type="button" className={`${secondaryButton} text-danger`} onClick={() => void toggleEditor(user.user_id, user.username, false)}>
                    Remove Editor
                  </button>
                ) : (
                  <button type="button" className={primaryButton} onClick={() => void toggleEditor(user.user_id, user.username, true)}>
                    Make Editor
                  </button>
                ))}
            </div>
          );
        })()}
      </section>

      {isAdmin && (
        <section className="grid content-start gap-3">
          <h2 className="text-lg font-bold tracking-[-0.01em]">Editors</h2>
          {editors === null ? (
            <p className="text-[13px] text-ink-muted">Loading…</p>
          ) : editors.length === 0 ? (
            <p className="text-[13px] text-ink-muted">Roles aren't set up yet. Run the admins migration.</p>
          ) : (
            <ul className="grid gap-1">
              {editors.map((m) => (
                <li key={m.user_id} className="flex items-center justify-between gap-3 rounded-panel bg-card px-3 py-2">
                  <button type="button" className="text-[13px] font-semibold hover:underline" onClick={() => m.username && void look(m.username)}>
                    {m.username ?? "No username"}
                  </button>
                  <span className="flex items-center gap-3">
                    <span className="text-xs text-ink-muted">{m.admin ? "Admin" : `Editor since ${shortDate(m.added_at)}`}</span>
                    {!m.admin && (
                      <button type="button" className="text-xs font-semibold text-danger hover:underline" onClick={() => void toggleEditor(m.user_id, m.username ?? "this user", false)}>
                        Remove
                      </button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <BugReports setNotice={setNotice} />
      <RedrawThumbnails />
    </div>
  );
}

/** Bug reports from players (Suggest Gear's Report a Bug tab), newest first, each with the page and browser. */
function BugReports({ setNotice }: { setNotice: SetNotice }) {
  const [reports, setReports] = useState<BugReport[] | null>(null);
  const load = () =>
    listBugReports().then(setReports, (e: Error) => {
      setReports([]);
      setNotice({ text: e.message, error: true });
    });
  useEffect(() => void load(), []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <section className="grid content-start gap-3">
      <h2 className="text-lg font-bold tracking-[-0.01em]">
        Bug Reports {reports && reports.length > 0 && <span className="font-normal text-ink-muted">{reports.length}</span>}
      </h2>
      {reports === null ? (
        <p className="text-[13px] text-ink-muted">Loading…</p>
      ) : reports.length === 0 ? (
        <p className="text-[13px] text-ink-muted">No open bug reports.</p>
      ) : (
        <ul className="grid gap-2">
          {reports.map((r) => (
            <li key={r.id} className="grid gap-1.5 rounded-panel bg-card p-3">
              <p className="whitespace-pre-wrap text-[13px]">
                <Linkified text={r.details} />
              </p>
              <p className="text-xs text-ink-muted">
                {shortDate(r.created_at)}
                {r.page && (
                  <>
                    {" · "}
                    <a href={r.page} target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">
                      {r.page.replace(/^https?:\/\//, "")}
                    </a>
                  </>
                )}
              </p>
              {r.user_agent && <p className="truncate text-[11px] text-ink-muted" title={r.user_agent}>{r.user_agent}</p>}
              <div>
                <button
                  type="button"
                  className={secondaryButton}
                  onClick={() =>
                    void closeBugReport(r.id).then(
                      () => setReports((list) => list?.filter((x) => x.id !== r.id) ?? list),
                      (e: Error) => setNotice({ text: e.message, error: true }),
                    )
                  }
                >
                  Close
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * Redraws every gallery board's thumbnail as a sharp 2× file (boards saved before the board_thumbnails migration keep
 * a small inline picture until their owner saves again). Skips boards that already have a file. Safe to run again.
 */
function RedrawThumbnails() {
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    let done = 0;
    let skipped = 0;
    let failed = 0;
    try {
      for (let offset = 0; ; offset += GALLERY_PAGE_SIZE) {
        const page = await fetchGalleryBoards({ type: null, search: "", sort: "new", offset, limit: GALLERY_PAGE_SIZE });
        for (const b of page) {
          setStatus(`Redrawing ${b.name}… (${done} done, ${skipped} already sharp, ${failed} failed)`);
          if (b.thumbnail?.includes("/board-thumbnails/")) {
            skipped++;
            continue;
          }
          try {
            const pg = await fetchShared(b.slug);
            const file = pg && (await renderThumbnailFile(pg.doc.items));
            if (!file) throw new Error("nothing to draw");
            await setGalleryThumbnail(b.id, await uploadBoardThumbnail(b.id, file));
            done++;
          } catch (e) {
            failed++;
            console.warn(`Could not redraw the thumbnail for ${b.name}.`, e);
          }
        }
        if (page.length < GALLERY_PAGE_SIZE) break;
      }
      setStatus(`Finished: ${done} redrawn, ${skipped} already sharp, ${failed} failed${failed ? " (details in the console)" : ""}.`);
    } catch (e) {
      setStatus(`Stopped: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="grid content-start gap-3">
      <h2 className="text-lg font-bold tracking-[-0.01em]">Gallery Thumbnails</h2>
      <p className="text-[13px] text-ink-muted">
        Redraw every Gallery board's picture at retina sharpness. Boards that already have a sharp picture are skipped, so it's safe to run again.
      </p>
      <div>
        <button type="button" className={secondaryButton} disabled={busy} onClick={() => void run()}>
          {busy ? "Redrawing…" : "Redraw All"}
        </button>
      </div>
      {status && <p className="text-[13px] text-ink-muted" role="status">{status}</p>}
    </section>
  );
}

function UserPanel({ user, report, onChanged, setNotice }: { user: ModUser; report: Report | null; onChanged: (text: string) => Promise<void>; setNotice: SetNotice }) {
  const suggestion = suggestedAction(user.flags);
  const [reason, setReason] = useState<Reason>(report?.reason ?? "other");
  const [note, setNote] = useState("");
  const [action, setAction] = useState<FlagAction>(suggestion.action);
  const [days, setDays] = useState<number>(suggestion.days ?? 7);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const status = user.banned ? "Banned" : user.restricted_until ? `In a timeout until ${shortDate(user.restricted_until)}` : "In good standing";

  const flag = async () => {
    if (action === "ban" && !window.confirm(`Ban ${user.username}? They won't be able to sign in, and their gallery boards and comments will be hidden.`)) return;
    setBusy(true);
    setError(null);
    try {
      await flagUser({ userId: user.user_id, reason, note, action, days, reportId: report?.id });
      await onChanged(`Flagged ${user.username}: ${action === "timeout" ? `${days}-day timeout` : action}.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const lift = async (f: Flag) => {
    if (!window.confirm(`Lift this ${f.action} on ${user.username}?`)) return;
    try {
      await liftFlag(f.id);
      await onChanged(`Lifted the ${f.action} on ${user.username}.`);
    } catch (e) {
      setNotice({ text: (e as Error).message, error: true });
    }
  };

  return (
    <div className="grid gap-4">
      <div>
        <p className="text-[15px] font-semibold">{user.username}</p>
        <p className="text-xs text-ink-muted">
          <Meta parts={[status, `Joined ${shortDate(user.joined)}`, `${user.open_reports} open ${user.open_reports === 1 ? "report" : "reports"}`]} />
        </p>
      </div>

      <ActivityList userId={user.user_id} />

      {user.flags.length > 0 && (
        <ul className="grid gap-1.5">
          {user.flags.map((f) => (
            <li key={f.id} className={`rounded-panel border border-line px-3 py-2 text-[13px] ${f.lifted_at ? "opacity-60" : ""}`}>
              <div className="flex flex-wrap items-center gap-x-2.5 text-xs text-ink-muted">
                <span className="font-semibold text-ink">{flagResult(f)}</span>
                <span>{reasonLabel(f.reason)}</span>
                <span>
                  {shortDate(f.created_at)}
                  {f.issued_by && ` by ${f.issued_by}`}
                </span>
                <span>{f.lifted_at ? `Lifted ${shortDate(f.lifted_at)}` : f.seen_at ? "Seen" : "Not seen yet"}</span>
                {!f.lifted_at && (
                  <button type="button" onClick={() => void lift(f)} className="ml-auto font-semibold text-brand hover:underline">
                    Lift
                  </button>
                )}
              </div>
              {f.note && <p className="mt-1 whitespace-pre-line">{f.note}</p>}
            </li>
          ))}
        </ul>
      )}

      <form
        className="grid gap-3 rounded-panel border border-line p-3"
        onSubmit={(e) => {
          e.preventDefault();
          void flag();
        }}
      >
        <h3 className="text-sm font-semibold">Flag {user.username}</h3>
        {report && <p className="text-xs text-ink-muted">Flagging resolves the report: “{reasonLabel(report.reason)}”.</p>}
        <div>
          <label className={fieldLabel} htmlFor="flag-reason">
            Reason
          </label>
          <select id="flag-reason" value={reason} onChange={(e) => setReason(e.target.value as Reason)} className={fieldInput}>
            {REASONS.map((r) => (
              <option key={r.code} value={r.code}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={fieldLabel} htmlFor="flag-note">
            Note to {user.username}
          </label>
          <span id="flag-note-help" className={fieldHelp}>
            Shown in the popup they see on their next visit
          </span>
          <textarea id="flag-note" aria-describedby="flag-note-help" value={note} maxLength={1000} rows={3} onChange={(e) => setNote(e.target.value)} className={`${fieldBox} block resize-none py-2`} />
        </div>
        <div>
          <span className={fieldLabel}>Action</span>
          <span className={fieldHelp}>Suggested from their history: {suggestion.action === "timeout" ? `a ${suggestion.days}-day timeout` : `a ${suggestion.action}`}</span>
          <div role="radiogroup" aria-label="Action" className="flex gap-1.5">
            {ACTIONS.map((a) => (
              <button
                key={a.action}
                type="button"
                role="radio"
                aria-checked={action === a.action}
                onClick={() => setAction(a.action)}
                className={`press h-9 flex-1 rounded-control text-sm font-medium ${action === a.action ? (a.action === "ban" ? "bg-danger/15 text-danger" : "bg-brand/10 text-brand") : "bg-surface-hover text-ink hover:bg-soft-hover"}`}
              >
                {a.label}
                {suggestion.action === a.action && <span className="ml-1 text-[11px] font-normal opacity-70">(suggested)</span>}
              </button>
            ))}
          </div>
        </div>
        {action === "timeout" && (
          <div>
            <label className={fieldLabel} htmlFor="flag-days">
              Timeout Length
            </label>
            <select id="flag-days" value={days} onChange={(e) => setDays(Number(e.target.value))} className={fieldInput}>
              {TIMEOUT_DAYS.map((d) => (
                <option key={d} value={d}>
                  {d === 1 ? "1 day" : `${d} days`}
                </option>
              ))}
            </select>
          </div>
        )}
        {error && <span className={fieldError}>{error}</span>}
        <button type="submit" disabled={busy} className={`${primaryButton} justify-self-start`}>
          {busy ? "Flagging…" : action === "ban" ? `Ban ${user.username}` : `Flag ${user.username}`}
        </button>
      </form>
    </div>
  );
}

const ACTIVITY: Record<Activity["kind"], string> = {
  joined: "Joined",
  signed_in: "Signed in",
  board_created: "New board",
  board_updated: "Changed a board",
  comment: "Commented",
  like: "Liked",
  report_sent: "Reported",
  reported: "Was reported",
  suggestion: "Suggested gear",
};

/** What the account has done, newest first: boards, comments, likes, reports both ways and suggestions. */
function ActivityList({ userId }: { userId: string }) {
  const [items, setItems] = useState<Activity[] | null | undefined>(undefined);
  const [all, setAll] = useState(false);
  useEffect(() => {
    setItems(undefined);
    fetchActivity(userId).then(setItems, () => setItems(null));
  }, [userId]);
  if (items === undefined) return <p className="text-[13px] text-ink-muted">Loading activity…</p>;
  if (items === null) return <p className="text-[13px] text-ink-muted">Activity history isn't set up on the database yet.</p>;
  const shown = all ? items : items.slice(0, 12);
  return (
    <div>
      <h3 className="mb-1.5 text-sm font-semibold">
        Activity <span className="font-normal text-ink-muted">{items.length}</span>
      </h3>
      <ul className="grid gap-px overflow-hidden rounded-panel border border-line">
        {shown.map((a, i) => (
          <li key={`${a.kind}-${a.happened_at}-${i}`} className="flex items-start gap-3 bg-surface px-3 py-2 text-[13px]">
            <span className="w-28 shrink-0 text-xs text-ink-muted">{ago(a.happened_at)}</span>
            <span className="min-w-0 flex-1">
              <span className={`font-semibold ${a.kind === "reported" ? "text-danger" : ""}`}>{ACTIVITY[a.kind]}</span>{" "}
              {a.board_slug ? (
                <a href={boardUrl(a.board_slug)} target="_blank" rel="noreferrer" className="text-brand hover:underline">
                  {a.title}
                </a>
              ) : (
                a.kind !== "joined" && a.kind !== "signed_in" && <span className="text-ink-muted">{a.title}</span>
              )}
              {a.detail && <span className="mt-0.5 block line-clamp-2 whitespace-pre-line break-words text-ink-muted">{a.kind === "comment" ? `“${a.detail}”` : a.detail}</span>}
            </span>
          </li>
        ))}
      </ul>
      {items.length > 12 && (
        <button type="button" onClick={() => setAll(!all)} className="mt-1.5 text-xs font-semibold text-brand hover:underline">
          {all ? "Show less" : `Show all ${items.length}`}
        </button>
      )}
    </div>
  );
}
