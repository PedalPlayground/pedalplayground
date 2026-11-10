import { useEffect, useRef, useState } from "react";
import { fetchManifest, type Manifest } from "../lib/catalog";
import { isAdmin, isEditor, pendingBuilds, publish } from "../lib/editorApi";
import { PageHeader, type PageDialog } from "../components/PageHeader";
import { useAuth } from "../store/auth";
import { AddTab } from "./AddTab";
import { CatalogTab } from "./CatalogTab";
import { primaryButton, secondaryButton } from "./ItemEditor";
import { ModerationTab } from "./ModerationTab";
import { NewsTab } from "./NewsTab";
import { QueueTab } from "./QueueTab";

type Tab = "queue" | "add" | "catalog" | "news" | "moderation";
const TABS: Tab[] = ["queue", "add", "catalog", "news", "moderation"];
/** The tab in the address (/editor/#news, or #add?from=<key> for Duplicate), so links can open a tab and reloads stay on it. */
const tabFromHash = (): Tab => {
  const h = window.location.hash.split("?")[0];
  // The Types tab is part of Catalog now.
  if (h === "#types") return "catalog";
  return TABS.find((t) => `#${t}` === h) ?? "queue";
};

export interface Notice {
  text: string;
  error?: boolean;
  /** A link after the text, opened in a new tab (the publish run on GitHub). */
  link?: { href: string; label: string };
}

export interface PublishState {
  /**
   * Starts a publish run and says how it went. Each change calls this; GitHub runs them one at a time and each
   * picks up everything pending.
   */
  run: () => Promise<Notice>;
}

/** "Approved X." plus how the publish went. */
export const withPublish = (done: string, p: Notice): Notice => ({ ...p, text: `${done} ${p.text}` });

/** The catalog editor at /editor/: only accounts in catalog_editors get past the gate. */
export function EditorApp() {
  const init = useAuth((s) => s.init);
  const ready = useAuth((s) => s.ready);
  const user = useAuth((s) => s.user);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  /** Admins also get News and manage who's an editor. */
  const [admin, setAdmin] = useState(false);
  const [tab, setTabState] = useState<Tab>(tabFromHash);
  const setTab = (t: Tab) => {
    setTabState(t);
    // Each tab is a history step, so Back returns to the last one.
    if (t !== tabFromHash()) history.pushState(null, "", t === "queue" ? window.location.pathname : `#${t}`);
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
    window.addEventListener("popstate", onHash);
    return () => {
      window.removeEventListener("hashchange", onHash);
      window.removeEventListener("popstate", onHash);
    };
  }, []);
  useEffect(() => {
    if (!user) return setAllowed(null);
    Promise.all([isEditor().catch(() => false), isAdmin().catch(() => false)]).then(([editor, isAdminUser]) => {
      setAdmin(isAdminUser);
      setAllowed(editor || isAdminUser);
    });
  }, [user]);
  useEffect(() => {
    if (!allowed) return;
    fetchManifest().then(setManifest, () => setManifest(null));
    const refresh = () => pendingBuilds().then(setWaiting, () => undefined);
    refresh();
    const t = setInterval(refresh, 30_000);
    return () => clearInterval(t);
  }, [allowed]);

  const [publishing, setPublishing] = useState(false);
  const runPublish = async (): Promise<Notice> => {
    setPublishing(true);
    const result = await publish().finally(() => setPublishing(false));
    pendingBuilds().then(setWaiting, () => undefined);
    if ("error" in result) return { text: `The publish didn't start (${result.error}). Use Publish now to retry.`, error: true };
    return {
      text: "Publishing now: it's live on the site in a few minutes.",
      link: result.runUrl ? { href: result.runUrl, label: "Watch it on GitHub" } : undefined,
    };
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
        <p className="text-[15px]">This page is for editors and admins. Your account isn't one.</p>
      </Shell>
    );

  // News is for admins.
  const shown: Tab = tab === "news" && !admin ? "queue" : tab;
  const tabButton = (t: Tab, label: string) => (
    <button
      type="button"
      onClick={() => setTab(t)}
      aria-pressed={shown === t}
      className={`press h-8 rounded-control px-3 text-[13px] font-semibold ${shown === t ? "bg-ink text-surface" : "text-ink-muted hover:bg-surface-hover hover:text-ink"}`}
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
            {admin && tabButton("news", "News")}
            {tabButton("moderation", "Moderation")}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            {waiting !== null && waiting > 0 && (
              <span className="text-xs text-ink-muted">
                {waiting} {waiting === 1 ? "image" : "images"} waiting to build
              </span>
            )}
            <button type="button" className={secondaryButton} disabled={publishing} onClick={() => runPublish().then(setNotice)}>
              {publishing ? "Publishing…" : "Publish now"}
            </button>
          </div>
        </>
      }
    >
      {notice && (
        <div
          role="status"
          className={`mb-5 flex items-start justify-between gap-3 rounded-panel border px-3 py-2 text-[13px] ${notice.error ? "border-danger/40 text-danger" : "border-line text-ink"}`}
        >
          <span>
            {notice.text}
            {notice.link && (
              <>
                {" "}
                <a href={notice.link.href} target="_blank" rel="noreferrer noopener" className="font-semibold text-brand underline underline-offset-2 hover:no-underline">
                  {notice.link.label}
                </a>
              </>
            )}
          </span>
          <button type="button" className="text-ink-muted hover:text-ink" onClick={() => setNotice(null)} aria-label="Dismiss">
            ×
          </button>
        </div>
      )}
      {shown === "queue" && <QueueTab manifest={manifest} publisher={publisher} setNotice={setNotice} />}
      {shown === "add" && <AddTab manifest={manifest} publisher={publisher} setNotice={setNotice} userId={user.id} />}
      {shown === "news" && <NewsTab setNotice={setNotice} />}
      {shown === "moderation" && <ModerationTab setNotice={setNotice} isAdmin={admin} />}
      {shown === "catalog" && <CatalogTab manifest={manifest} publisher={publisher} setNotice={setNotice} userId={user.id} />}
    </Shell>
  );
}

export type SetNotice = (n: Notice | null) => void;

/** The site header, then the editor's own tab bar under it (once you're in). */
function Shell({ header, children, bar }: { header: React.ReactNode; children?: React.ReactNode; bar?: React.ReactNode }) {
  const page = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  // How far down the sticky header and tab bar reach (--editor-top, in screen pixels), so content can stick under them
  // (the Queue's open submission). The tab bar wraps on narrow screens, so it's measured.
  useEffect(() => {
    const el = barRef.current;
    if (!el) return;
    const update = () => page.current?.style.setProperty("--editor-top", `${48 + el.getBoundingClientRect().height}px`);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [bar]);
  return (
    // The page locks body scrolling (for the playground), so this page scrolls inside its own container, like the gallery.
    <div ref={page} className="h-dvh overflow-y-auto overscroll-contain bg-chrome font-sans text-ink">
      {header}
      {bar && (
        <div ref={barRef} className="sticky top-12 z-20 border-b border-chrome-line bg-chrome/95 backdrop-blur">
          <div className="page-main isolate mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-5 gap-y-2 px-4 py-2">{bar}</div>
        </div>
      )}
      <main id="content" className="page-main isolate mx-auto max-w-[1600px] px-4 py-6">{children}</main>
    </div>
  );
}
