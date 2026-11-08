import { Guitar, LayoutGrid, Wrench, type LucideProps } from "lucide-react";
import { useId, type ReactNode } from "react";
import { useIsEditor } from "../lib/useIsEditor";
import { Brand } from "./Logo";

/**
 * My Playgrounds: a solid rounded board with two rails cut out (a mask, so the header shows through), drawn on Lucide's
 * 24px grid to sit with the other solid header icons.
 */
export function PedalboardIcon({ className, size = 24 }: LucideProps) {
  const id = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden>
      <mask id={id}>
        <rect x="1" y="4" width="22" height="16" rx="3" fill="white" />
        <path d="M6 9.5h12M6 14.5h12" stroke="black" strokeWidth="2" strokeLinecap="round" />
      </mask>
      <rect x="1" y="4" width="22" height="16" rx="3" fill="currentColor" mask={`url(#${id})`} />
    </svg>
  );
}

/** One look for Gallery, Gear, My Boards, Admin and What's New: an icon and a label (icons only below laptop width). */
export function tabClass(here: boolean) {
  return `press relative flex h-9 shrink-0 items-center gap-2 rounded-inner p-2 text-sm/4 font-semibold tracking-[-0.01em] text-ink outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand ${
    here ? "bg-soft" : "hover:bg-soft data-[state=open]:bg-soft"
  }`;
}
/** Header icons are solid: Lucide outlines filled with the icon color (and the custom board icon), all at 18px. */
export const tabIcon = { size: 18, strokeWidth: 2 } as const;
export const tabLabel = "max-lg:sr-only";

export type SitePage = "build" | "gallery" | "gear" | "editor" | null;

/**
 * Explore, Gear, My Playgrounds, then Admin (the editor page) for catalog editors. `builds` is the playground's board menu; elsewhere it's a
 * link to the playground. The current page's tab is marked.
 */
export function SiteTabs({ current, builds, after }: { current: SitePage; builds?: ReactNode; after?: ReactNode }) {
  const editor = useIsEditor();
  return (
    <nav aria-label="Pedal Playground" className="flex shrink-0 items-center gap-1 sm:gap-2">
      <a href="/gallery/" aria-current={current === "gallery" ? "page" : undefined} className={tabClass(false)}>
        <LayoutGrid {...tabIcon} fill="currentColor" className="text-ink-muted" />
        <span className={tabLabel}>Gallery</span>
      </a>
      <a href="/gear/" aria-current={current === "gear" ? "page" : undefined} className={tabClass(false)}>
        <Guitar {...tabIcon} fill="currentColor" className="text-ink-muted" />
        <span className={tabLabel}>Gear</span>
      </a>
      {builds ?? (
        <a href="/" className={tabClass(false)}>
          <PedalboardIcon {...tabIcon} className="text-ink-muted" />
          <span className={tabLabel}>My Boards</span>
        </a>
      )}
      {editor && (
        <a href="/editor/" aria-current={current === "editor" ? "page" : undefined} className={tabClass(false)}>
          <Wrench {...tabIcon} fill="currentColor" className="text-ink-muted" />
          <span className={tabLabel}>Admin</span>
        </a>
      )}
      {after}
    </nav>
  );
}

const section = "flex shrink-0 items-center";


/**
 * The header on every page: the brand and `nav` (beta links) at the left; `navEnd` (save status) and the Explore, Gear, My Playgrounds
 * and Updates tabs at the right; then the account section behind a thin divider.
 */
export function SiteHeader({
  current,
  builds,
  updates,
  brandExtra,
  nav,
  navEnd,
  account,
  className = "",
}: {
  current: SitePage;
  builds?: ReactNode;
  updates?: ReactNode;
  brandExtra?: ReactNode;
  nav?: ReactNode;
  navEnd?: ReactNode;
  account?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={`box-content flex h-12 shrink-0 items-stretch border-b border-chrome-line bg-chrome pt-[max(env(safe-area-inset-top),var(--pwa-strip,0px))] ${className}`}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3 pl-[max(0.75rem,env(safe-area-inset-left))] pr-2 sm:pl-[max(1rem,env(safe-area-inset-left))] sm:pr-4">
        <h1 className="flex items-center">
          <a href="/" aria-label="Pedal Playground" className="rounded-control outline-none focus-visible:ring-2 focus-visible:ring-brand">
            <Brand />
          </a>
        </h1>
        {brandExtra}
        {nav}
        <div className="ml-auto flex shrink-0 items-center gap-3">
          {navEnd}
          <SiteTabs current={current} builds={builds} />
        </div>
      </div>
      {/* Updates gets its own section, like the account menu. */}
      {updates && <div className={`${section} border-l border-chrome-line px-1.5`}>{updates}</div>}
      {account && (
        <div
          data-tour="account"
          className={`${section} gap-[7px] border-l border-chrome-line pl-1.5 pr-[max(0.375rem,env(safe-area-inset-right))]`}
        >
          {account}
        </div>
      )}
    </header>
  );
}

const guestButton =
  "press flex h-[26px] items-center whitespace-nowrap rounded-control px-3 text-[13px] font-semibold tracking-[-0.01em] outline-none focus-visible:ring-2 focus-visible:ring-brand";

/** Signed out: Register (phones skip it; the sign-in dialog has Create Account) and Sign in. */
export function GuestButtons({ onRegister, onSignIn }: { onRegister: () => void; onSignIn: () => void }) {
  // Extra room around the buttons (the section itself is tight for the avatar): 12px on phones, 16px from sm.
  return (
    <span className="flex items-center gap-[7px] px-1.5 sm:px-2.5">
      <button
        type="button"
        onClick={onRegister}
        className={`${guestButton} bg-soft text-ink hover:bg-soft-hover active:bg-soft-active max-sm:hidden`}
      >
        Register
      </button>
      <button type="button" onClick={onSignIn} className={`${guestButton} btn-primary`}>
        Sign in
      </button>
    </span>
  );
}
