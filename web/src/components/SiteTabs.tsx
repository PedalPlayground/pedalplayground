import type { ReactNode } from "react";
import { Brand } from "./Logo";

const TABS = [
  { id: "gallery", href: "/gallery/", label: "Explore" },
  { id: "build", href: "/", label: "Build" },
] as const;

/** "Explore · Build", so either page is one click away. */
/** `current` null: neither is marked (someone else's board, which is neither your build nor the gallery). */
export function SiteTabs({ current }: { current: "build" | "gallery" | null }) {
  return (
    <nav aria-label="Pedal Playground" className="flex shrink-0 items-center gap-2 max-[359px]:gap-0.5">
      {TABS.map((t) => {
        const here = t.id === current;
        return (
          <a
            key={t.id}
            href={t.href}
            aria-current={here ? "page" : undefined}
            className={`flex h-8 items-center rounded-[4px] px-2 text-sm/4 font-semibold tracking-[-0.01em] text-ink outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand ${
              here ? "bg-ink/[0.06]" : "hover:bg-ink/5"
            }`}
          >
            {t.label}
          </a>
        );
      })}
    </nav>
  );
}

const section = "flex shrink-0 items-center";

/**
 * The header on every page: the brand, then the tabs with `nav` after them and `navEnd` at the far right (save status,
 * What's New), then the account buttons. Thin lines divide the three parts.
 */
export function SiteHeader({
  current,
  brandExtra,
  nav,
  navEnd,
  account,
  className = "",
}: {
  current: "build" | "gallery" | null;
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
      <div className="flex min-w-0 flex-1 items-center gap-3 px-2 max-[359px]:gap-1 sm:px-4">
        <SiteTabs current={current} />
        {nav}
        {/* The icon buttons' padding is trimmed on the right so the megaphone sits 16px from the divider, as in the design. */}
        <div className="ml-auto flex items-center gap-3 sm:-mr-2">{navEnd}</div>
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
