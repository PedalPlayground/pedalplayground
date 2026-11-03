import { LayoutGrid, type LucideProps } from "lucide-react";
import type { ReactNode } from "react";
import { Brand } from "./Logo";

/** Two pedals (a knob up top, a footswitch low) on a board, drawn like the lucide icons beside it. */
function PedalboardIcon({ size = 24, strokeWidth = 2, className }: LucideProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <rect x="2" y="17" width="20" height="4.5" rx="1.5" />
      <rect x="4" y="2.5" width="7" height="14.5" rx="1.5" />
      <rect x="13" y="2.5" width="7" height="14.5" rx="1.5" />
      <circle cx="7.5" cy="6.5" r="0.5" />
      <circle cx="16.5" cy="6.5" r="0.5" />
      <circle cx="7.5" cy="13" r="1" />
      <circle cx="16.5" cy="13" r="1" />
    </svg>
  );
}

const TABS = [
  { id: "gallery", href: "/gallery/", label: "Explore", Icon: LayoutGrid },
  { id: "build", href: "/", label: "Build", Icon: PedalboardIcon },
] as const;

/** One look for Explore, Build and Updates: an icon and a label (icons only on phones, where all three can't fit). */
export function tabClass(here: boolean) {
  return `press relative flex h-8 shrink-0 items-center gap-1.5 rounded-[4px] px-2 text-sm/4 font-semibold tracking-[-0.01em] text-ink outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand ${
    here ? "bg-ink/[0.06]" : "hover:bg-ink/5 data-[state=open]:bg-ink/5"
  }`;
}
export const tabIcon = { size: 16, strokeWidth: 2 } as const;
export const tabLabel = "max-sm:sr-only";

/** "Explore · Build", then `after` (Updates) in the same group. `current` null: neither is marked (someone else's board). */
export function SiteTabs({ current, after }: { current: "build" | "gallery" | null; after?: ReactNode }) {
  return (
    <nav aria-label="Pedal Playground" className="flex shrink-0 items-center gap-1 sm:gap-2">
      {TABS.map(({ id, href, label, Icon }) => {
        const here = id === current;
        return (
          <a key={id} href={href} aria-current={here ? "page" : undefined} className={tabClass(here)}>
            <Icon {...tabIcon} className="text-ink-muted" />
            <span className={tabLabel}>{label}</span>
          </a>
        );
      })}
      {after}
    </nav>
  );
}

const section = "flex shrink-0 items-center";

/**
 * The header on every page: the brand, then `nav` (the board picker), then at the right `navEnd` (save status) and the
 * Explore, Build and Updates tabs, then the account buttons. Thin lines divide the three parts.
 */
export function SiteHeader({
  current,
  updates,
  brandExtra,
  nav,
  navEnd,
  account,
  className = "",
}: {
  current: "build" | "gallery" | null;
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
      <div className={`${section} gap-2 border-r border-chrome-line pl-[max(0.75rem,env(safe-area-inset-left))] pr-3 sm:pl-[max(1rem,env(safe-area-inset-left))] sm:pr-4`}>
        <h1 className="flex items-center">
          <a href="/" aria-label="Pedal Playground" className="rounded-control outline-none focus-visible:ring-2 focus-visible:ring-brand">
            <Brand />
          </a>
        </h1>
        {brandExtra}
      </div>
      <div className="flex min-w-0 flex-1 items-center gap-3 px-2 sm:px-4">
        {nav}
        <div className="ml-auto flex shrink-0 items-center gap-3">
          {navEnd}
          <SiteTabs current={current} after={updates} />
        </div>
      </div>
      {account && (
        <div
          data-tour="account"
          className={`${section} gap-[7px] border-l border-chrome-line pl-3 pr-[max(0.75rem,env(safe-area-inset-right))] sm:pl-4 sm:pr-[max(1rem,env(safe-area-inset-right))]`}
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
  return (
    <>
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
    </>
  );
}
