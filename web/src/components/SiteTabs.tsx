import { LayoutGrid, type LucideProps } from "lucide-react";
import type { ReactNode } from "react";
import { Brand } from "./Logo";

/** Trav's My Playgrounds icon: a frame with three stacked bars (drawn at 17×12, shown a bit larger), in the icon color. */
export function PedalboardIcon({ className }: LucideProps) {
  return (
    <svg width={24} height={16} viewBox="0 0 17 11.333" fill="none" className={className} aria-hidden>
      <path
        d="M17 11.333H0V0H17V11.333ZM1.61914 8.0957V9.71387H15.3809V8.0957H1.61914ZM1.61914 6.47656H15.3809V4.85742H1.61914V6.47656ZM1.61914 3.23828H15.3809V1.61914H1.61914V3.23828Z"
        fillRule="evenodd"
        clipRule="evenodd"
        fill="currentColor"
      />
    </svg>
  );
}

/** One look for Explore, My Playgrounds and Updates: an icon and a label (icons only below laptop width). */
export function tabClass(here: boolean) {
  return `press relative flex h-9 shrink-0 items-center gap-2 rounded-[4px] p-2 text-sm/4 font-semibold tracking-[-0.01em] text-ink outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand ${
    here ? "bg-ink/[0.06]" : "hover:bg-ink/5 data-[state=open]:bg-ink/5"
  }`;
}
export const tabIcon = { size: 18, strokeWidth: 2 } as const;
export const tabLabel = "max-lg:sr-only";

/**
 * Explore, then My Playgrounds. `builds` is the playground's board menu; elsewhere it's a link to the playground.
 * Explore is marked on the gallery page.
 */
export function SiteTabs({ current, builds, after }: { current: "build" | "gallery" | null; builds?: ReactNode; after?: ReactNode }) {
  return (
    <nav aria-label="Pedal Playground" className="flex shrink-0 items-center gap-1 sm:gap-2">
      <a href="/gallery/" aria-current={current === "gallery" ? "page" : undefined} className={tabClass(false)}>
        <LayoutGrid {...tabIcon} fill="currentColor" className="text-ink-muted" />
        <span className={tabLabel}>Explore</span>
      </a>
      {builds ?? (
        <a href="/" className={tabClass(false)}>
          <PedalboardIcon {...tabIcon} className="text-ink-muted" />
          <span className={tabLabel}>My Playgrounds</span>
        </a>
      )}
      {after}
    </nav>
  );
}

const section = "flex shrink-0 items-center";


/**
 * The header on every page: the brand and `nav` (beta links) at the left; `navEnd` (save status) and the Explore, My Playgrounds
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
  current: "build" | "gallery" | null;
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
  "press flex h-[26px] items-center whitespace-nowrap rounded-[5px] px-3 text-[13px] font-semibold tracking-[-0.01em] outline-none focus-visible:ring-2 focus-visible:ring-brand";

/** Signed out: Register (phones skip it; the sign-in dialog has Create Account) and Sign in. */
export function GuestButtons({ onRegister, onSignIn }: { onRegister: () => void; onSignIn: () => void }) {
  // Extra room around the buttons (the section itself is tight for the avatar): 12px on phones, 16px from sm.
  return (
    <span className="flex items-center gap-[7px] px-1.5 sm:px-2.5">
      <button
        type="button"
        onClick={onRegister}
        className={`${guestButton} bg-[rgb(202_203_226/0.39)] text-ink hover:bg-[rgb(202_203_226/0.6)] active:bg-[rgb(202_203_226/0.8)] max-sm:hidden`}
      >
        Register
      </button>
      <button type="button" onClick={onSignIn} className={`${guestButton} btn-primary`}>
        Sign in
      </button>
    </span>
  );
}
