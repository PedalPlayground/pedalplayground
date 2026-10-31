import { useEffect, useState } from "react";
import { clearPostCache, type Post } from "../lib/announcements";
import { deletePost, listPosts, savePost, type PostDraft } from "../lib/editorApi";
import type { SetNotice } from "./EditorApp";
import { inputClass, labelClass, primaryButton, secondaryButton } from "./ItemEditor";

const empty: PostDraft = { title: "", body: "", link_url: "", link_label: "", published_at: "" };

/** "YYYY-MM-DDTHH:mm" in local time, for a datetime-local input. */
const toLocalInput = (iso: string) => {
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};

const draftFrom = (p: Post): PostDraft => ({
  title: p.title,
  body: p.body,
  link_url: p.link_url ?? "",
  link_label: p.link_label ?? "",
  published_at: toLocalInput(p.published_at),
});

/**
 * Posts for the What's New bell in the app. New pedals get their own weekly posts automatically, so this is for
 * features, fixes and other news.
 */
export function NewsTab({ setNotice }: { setNotice: SetNotice }) {
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<PostDraft>(empty);
  const [busy, setBusy] = useState(false);

  const refresh = () => listPosts().then(setPosts, (e: Error) => setNotice({ text: e.message, error: true }));
  // eslint-disable-next-line react-hooks/exhaustive-deps -- load once
  useEffect(() => void refresh(), []);

  const set = (k: keyof PostDraft) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setDraft((d) => ({ ...d, [k]: e.target.value }));

  const linkProblem =
    draft.link_url.trim() && !/^(https:\/\/|\/)/.test(draft.link_url.trim()) ? "Links start with https:// or / (a page on this site)." : null;

  const save = async () => {
    setBusy(true);
    try {
      await savePost(editing, draft);
      clearPostCache();
      setNotice({ text: editing ? "Post updated." : "Posted. It shows in the app within a few minutes." });
      setEditing(null);
      setDraft(empty);
      await refresh();
    } catch (e) {
      setNotice({ text: e instanceof Error ? e.message : "Could not save the post.", error: true });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (p: Post) => {
    if (!window.confirm(`Delete "${p.title}"?`)) return;
    try {
      await deletePost(p.id);
      clearPostCache();
      setNotice({ text: "Post deleted." });
      if (editing === p.id) (setEditing(null), setDraft(empty));
      await refresh();
    } catch (e) {
      setNotice({ text: e instanceof Error ? e.message : "Could not delete the post.", error: true });
    }
  };

  const now = Date.now();

  return (
    <div className="grid gap-8 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <h2 className="text-[15px] font-semibold">{editing ? "Edit post" : "New post"}</h2>
        <p className="text-[13px] text-ink-muted">
          Posts show in the What's New bell for everyone, signed in or not. New pedals already get a weekly post on their own.
        </p>
        <label>
          <span className={labelClass}>Title</span>
          <input className={inputClass} value={draft.title} onChange={set("title")} maxLength={120} required />
        </label>
        <label>
          <span className={labelClass}>Text (optional)</span>
          <textarea
            className={`${inputClass} h-28 resize-y py-1.5`}
            value={draft.body}
            onChange={set("body")}
            maxLength={2000}
          />
        </label>
        <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-3">
          <label>
            <span className={labelClass}>Link (optional)</span>
            <input className={inputClass} value={draft.link_url} onChange={set("link_url")} placeholder="https://… or /gallery/" />
          </label>
          <label>
            <span className={labelClass}>Link text</span>
            <input className={inputClass} value={draft.link_label} onChange={set("link_label")} maxLength={40} placeholder="Learn more" />
          </label>
        </div>
        {linkProblem && <p className="text-xs text-danger">{linkProblem}</p>}
        <label>
          <span className={labelClass}>Publish at (leave empty for now; a later time schedules it)</span>
          <input type="datetime-local" className={inputClass} value={draft.published_at} onChange={set("published_at")} />
        </label>
        <div className="flex gap-2">
          <button type="submit" className={primaryButton} disabled={busy || !draft.title.trim() || !!linkProblem}>
            {editing ? "Save changes" : "Post"}
          </button>
          {editing && (
            <button
              type="button"
              className={secondaryButton}
              onClick={() => {
                setEditing(null);
                setDraft(empty);
              }}
            >
              Cancel
            </button>
          )}
        </div>
      </form>

      <section>
        <h2 className="mb-3 text-[15px] font-semibold">Posts</h2>
        {posts === null ? (
          <p className="text-[13px] text-ink-muted">Loading…</p>
        ) : posts.length === 0 ? (
          <p className="text-[13px] text-ink-muted">No posts yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {posts.map((p) => {
              const scheduled = new Date(p.published_at).getTime() > now;
              return (
                <li key={p.id} className="rounded-lg border border-line px-3 py-2.5">
                  <div className="flex items-center gap-2 text-xs text-ink-muted">
                    {new Date(p.published_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                    {scheduled && <span className="rounded-full bg-brand/10 px-1.5 text-[11px] font-semibold text-brand">Scheduled</span>}
                  </div>
                  <p className="mt-0.5 text-sm font-semibold">{p.title}</p>
                  {p.body && <p className="mt-0.5 line-clamp-3 whitespace-pre-line text-[13px] text-ink-muted">{p.body}</p>}
                  <div className="mt-2 flex gap-3 text-[13px]">
                    <button
                      type="button"
                      className="font-medium text-brand hover:underline"
                      onClick={() => {
                        setEditing(p.id);
                        setDraft(draftFrom(p));
                      }}
                    >
                      Edit
                    </button>
                    <button type="button" className="font-medium text-danger hover:underline" onClick={() => void remove(p)}>
                      Delete
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
