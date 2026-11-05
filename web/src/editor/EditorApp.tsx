import { useEffect, useState } from "react";
import { fetchManifest, type Manifest } from "../lib/catalog";
import { isEditor, pendingBuilds, publish } from "../lib/editorApi";
import { PageHeader, type PageDialog } from "../components/PageHeader";
import { useAuth } from "../store/auth";
import { AddTab } from "./AddTab";
import { CatalogTab } from "./CatalogTab";
import { primaryButton, secondaryButton } from "./ItemEditor";
import { NewsTab } from "./NewsTab";
import { QueueTab } from "./QueueTab";

type Tab = "queue" | "add" | "catalog" | "news";
const TABS: Tab[] = ["queue", "add", "catalog", "news"];
/** The tab in the address (/editor/#news), so links can open a tab and reloads stay on it. */
const tabFromHash = (): Tab => TABS.find((t) => `#${t}` === window.location.hash) ?? "queue";

export interface Notice {
  text: string;
  error?: boolean;
}

export interface PublishState {
  /**
   * Starts a publish run and says how it went. Each change calls this; GitHub runs them one at a time and each
   * picks up everything pending.
   */
  run: () => Promise<Notice>;
}

/** "Approved X." plus how the publish went. */
export const withPublish = (done: string, p: Notice): Notice => ({ text: `${done} ${p.text}`, error: p.error });

/** The catalog editor at /editor/: only accounts in catalog_editors get past the gate. */
export function EditorApp() {
  const init = useAuth((s) => s.init);
  const ready = useAuth((s) => s.ready);
  const user = useAuth((s) => s.user);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [tab, setTabState] = useState<Tab>(tabFromHash);
  const setTab = (t: Tab) => {
    setTabState(t);
    history.replaceState(null, "", t === "queue" ? window.location.pathname : `#${t}`);
  };
  const [dialog, setDialog] = useState<PageDialog>(null);
  const header = <PageHeader current="editor" dialog={dialog} setDialog={setDialog} />;
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [waiting, setWaiting] = useState<number | null>(null);

  useEffect(init, [init]);
  useEffect(() => {
    const onHash = () => setTabState(tabFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  useEffect(() => {
    if (!user) return setAllowed(null);
    isEditor().then(setAllowed, () => setAllowed(false));
  }, [user]);
  useEffect(() => {
    if (!allowed) return;
    fetchManifest().then(setManifest, () => setManifest(null));
    const refresh = () => pendingBuilds().then(setWaiting, () => undefined);
    refresh();
    const t = setInterval(refresh, 30_000);
    return () => clearInterval(t);
  }, [allowed]);

  const runPublish = async (): Promise<Notice> => {
    const problem = await publish();
    pendingBuilds().then(setWaiting, () => undefined);
    return problem
      ? { text: `The publish didn't start (${problem}). Use Publish now to retry.`, error: true }
      : { text: "Publishing now: it's live on the site in a few minutes." };
  };
  const publisher: PublishState = { run: runPublish };

  if (!ready) return <Shell header={header} />;
  if (!user)
    return (
      <Shell header={header}>
        <p className="text-[15px]">Sign in with a catalog editor account to use this page.</p>
        <button type="button" onClick={() => setDialog("account")} className={`${primaryButton} mt-4 inline-flex items-center`}>
          Sign In
        </button>
      </Shell>
    );
  if (allowed === null) return <Shell header={header} />;
  if (!allowed)
    return (
      <Shell header={header}>
        <p className="text-[15px]">This page is for catalog editors. Your account isn't one.</p>
      </Shell>
    );

  const tabButton = (t: Tab, label: string) => (
    <button
      type="button"
      onClick={() => setTab(t)}
      aria-pressed={tab === t}
      className={`press h-8 rounded-[5px] px-3 text-[13px] font-semibold ${tab === t ? "bg-ink text-surface" : "text-ink-muted hover:bg-surface-hover hover:text-ink"}`}
    >
      {label}
    </button>
  );

  return (
    <Shell
      header={header}
      bar={
        <>
          <nav className="flex gap-1">
            {tabButton("queue", "Queue")}
            {tabButton("add", "Add")}
            {tabButton("catalog", "Catalog")}
            {tabButton("news", "News")}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            {waiting !== null && waiting > 0 && (
              <span className="text-xs text-ink-muted">
                {waiting} {waiting === 1 ? "image" : "images"} waiting to build
              </span>
            )}
            <button type="button" className={secondaryButton} onClick={() => runPublish().then(setNotice)}>
              Publish now
            </button>
          </div>
        </>
      }
    >
      {notice && (
        <div
          role="status"
          className={`mb-5 flex items-start justify-between gap-3 rounded-lg border px-3 py-2 text-[13px] ${notice.error ? "border-danger/40 text-danger" : "border-line text-ink"}`}
        >
          <span>{notice.text}</span>
          <button type="button" className="text-ink-muted hover:text-ink" onClick={() => setNotice(null)} aria-label="Dismiss">
            ×
          </button>
        </div>
      )}
      {tab === "queue" && <QueueTab manifest={manifest} publisher={publisher} setNotice={setNotice} />}
      {tab === "add" && <AddTab manifest={manifest} publisher={publisher} setNotice={setNotice} userId={user.id} />}
      {tab === "news" && <NewsTab setNotice={setNotice} />}
      {tab === "catalog" && <CatalogTab manifest={manifest} publisher={publisher} setNotice={setNotice} userId={user.id} />}
    </Shell>
  );
}

export type SetNotice = (n: Notice | null) => void;

/**
 * The site header, then the editor's own tab bar under it (once you're in). The page itself sits on a white panel, like
 * dialogs and side panels, so the gray form fields always stand out.
 */
function Shell({ header, children, bar }: { header: React.ReactNode; children?: React.ReactNode; bar?: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-chrome font-sans text-ink">
      {header}
      {bar && (
        <div className="sticky top-12 z-[9] border-b border-chrome-line bg-chrome/95 backdrop-blur">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-2">{bar}</div>
        </div>
      )}
      <main className="mx-auto max-w-5xl px-4 py-6">{children && <div className="rounded-panel bg-surface p-5 shadow-panel">{children}</div>}</main>
    </div>
  );
}
