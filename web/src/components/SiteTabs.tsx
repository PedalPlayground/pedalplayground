import { LayoutGrid, LogIn, Wrench, type LucideProps } from "lucide-react";
import { useIsEditor } from "../lib/useIsEditor";
import { useId, type ReactNode } from "react";
import { useAuth } from "../store/auth";
import { phoneBar } from "./toolbarStyles";
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

/**
 * Build: a pedal in front of a board with a list on it, from Trav's tab bar frame (Figma, 2026-11-10), on Lucide's 24px
 * grid. Masks cut the gap around the pedal and its details, so it reads on any background.
 */
export function BuildIcon({ className, size = 24 }: LucideProps) {
  const id = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden>
      <mask id={`${id}b`}>
        <rect x="1" y="5" width="22" height="14" rx="3" fill="white" />
        <rect x="10.5" y="3.5" width="13" height="17" rx="3.5" fill="black" />
        <path d="M4.8 8.8h5.4M4.8 12h5.4M4.8 15.2h5.4" stroke="black" strokeWidth="1.6" strokeLinecap="round" />
      </mask>
      <mask id={`${id}p`}>
        <rect x="12" y="5" width="10" height="14" rx="2" fill="white" />
        <rect x="13" y="12" width="8" height="6" rx="1.4" fill="black" />
        <rect x="13" y="6" width="2" height="2" rx="1" fill="black" />
        <rect x="16" y="6" width="2" height="2" rx="1" fill="black" />
        <rect x="19" y="6" width="2" height="2" rx="1" fill="black" />
      </mask>
      <rect x="1" y="5" width="22" height="14" rx="3" fill="currentColor" mask={`url(#${id}b)`} />
      <rect x="12" y="5" width="10" height="14" rx="2" fill="currentColor" mask={`url(#${id}p)`} />
    </svg>
  );
}

/** Gear: a solid pedal (three knobs and a footswitch cut out), from the same frame. */
export function PedalIcon({ className, size = 24 }: LucideProps) {
  const id = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden>
      <mask id={id}>
        <rect x="4.6" y="2" width="14.8" height="20.6" rx="2.9" fill="white" />
        <rect x="6" y="13" width="12" height="8" rx="2" fill="black" />
        <circle cx="7.6" cy="5.4" r="1.5" fill="black" />
        <circle cx="12" cy="5.4" r="1.5" fill="black" />
        <circle cx="16.4" cy="5.4" r="1.5" fill="black" />
      </mask>
      <rect x="4.6" y="2" width="14.8" height="20.6" rx="2.9" fill="currentColor" mask={`url(#${id})`} />
    </svg>
  );
}

/** One look for Build, Gallery, Gear, My Boards, Admin and What's New: an icon and a label (icons only below laptop width). */
export function tabClass(here: boolean) {
  return `press relative flex h-9 shrink-0 items-center gap-2 rounded-inner p-2 text-sm/4 font-semibold tracking-[-0.01em] text-ink outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand ${
    here ? "bg-soft" : "hover:bg-soft data-[state=open]:bg-soft"
  }`;
}
/** Header icons are solid: Lucide outlines filled with the icon color (and the custom board icon), all at 18px. */
export const tabIcon = { size: 18, strokeWidth: 2 } as const;
export const tabLabel = "max-lg:sr-only";

export type SitePage = "build" | "gallery" | "gear" | "boards" | "editor" | null;

/** Admin (the editor page), for editors and admins: its own boxed section between the nav and the account. */
function AdminSection({ current }: { current: SitePage }) {
  const allowed = useIsEditor();
  if (!allowed) return null;
  return (
    <div className={`${section} border-l border-chrome-line px-2 sm:px-4`}>
      <a href="/editor/" aria-current={current === "editor" ? "page" : undefined} className={tabClass(false)}>
        <Wrench {...tabIcon} fill="currentColor" className="text-ink-muted" />
        <span className={tabLabel}>Admin</span>
      </a>
    </div>
  );
}

/**
 * Build, My Boards, Gallery and Gear. Build goes to the playground (your open board); `builds` is the playground's
 * board menu, elsewhere My Boards is the same menu or a link. The current page's tab is marked. On phones, pages with
 * the tab bar (`TabBar`) hide these and keep only `after` (What's New).
 */
export function SiteTabs({ current, builds, after, tabBar }: { current: SitePage; builds?: ReactNode; after?: ReactNode; tabBar?: boolean }) {
  const phoneHidden = tabBar ? "max-sm:hidden" : "";
  return (
    <nav aria-label="Pedal Playground" className="flex shrink-0 items-center gap-1 sm:gap-2">
      <a href="/" aria-current={current === "build" ? "page" : undefined} className={`${tabClass(false)} ${phoneHidden}`}>
        <BuildIcon {...tabIcon} className="text-ink-muted" />
        <span className={tabLabel}>Build</span>
      </a>
      <span className={`contents ${tabBar ? "max-sm:[&>*]:hidden" : ""}`}>
        {builds ?? (
          <a href="/boards/" aria-current={current === "boards" ? "page" : undefined} className={tabClass(false)}>
            <PedalboardIcon {...tabIcon} className="text-ink-muted" />
            <span className={tabLabel}>My Boards</span>
          </a>
        )}
      </span>
      <a href="/gallery/" data-tour="gallery" aria-current={current === "gallery" ? "page" : undefined} className={`${tabClass(false)} ${phoneHidden}`}>
        <LayoutGrid {...tabIcon} fill="currentColor" className="text-ink-muted" />
        <span className={tabLabel}>Gallery</span>
      </a>
      <a href="/gear/" aria-current={current === "gear" ? "page" : undefined} className={`${tabClass(false)} ${phoneHidden}`}>
        <PedalIcon {...tabIcon} className="text-ink-muted" />
        <span className={tabLabel}>Gear</span>
      </a>
      {after}
    </nav>
  );
}

/** Phones (below 640px) on Gallery, Gear, My Boards and Admin: a floating dark bar along the bottom, from Trav's frame. */
const barItem =
  "press flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-full text-[11px] font-medium leading-none text-tip-ink outline-none focus-visible:ring-2 focus-visible:ring-brand";

export function TabBar({ current, onSignIn }: { current: SitePage; onSignIn: () => void }) {
  const user = useAuth((s) => s.user);
  const cloudEnabled = useAuth((s) => s.cloudEnabled);
  // Opacity, not a see-through color, so filled icons with an outline (the grid) stay solid.
  const icon = (here: boolean) => (here ? "text-tip-ink" : "text-tip-ink opacity-60");
  return (
    <nav
      aria-label="Pedal Playground"
      className={`tab-bar fixed inset-x-3 bottom-[var(--phone-bar-bottom)] z-40 w-auto sm:hidden ${phoneBar}`}
    >
      <a href="/" aria-current={current === "build" ? "page" : undefined} className={barItem}>
        <BuildIcon size={22} className={icon(current === "build")} />
        Build
      </a>
      {/* Signed out, My Boards would only ask you to sign in, so the bar asks directly. */}
      {user || !cloudEnabled ? (
        <a href="/boards/" aria-current={current === "boards" ? "page" : undefined} className={barItem}>
          <PedalboardIcon size={22} className={icon(current === "boards")} />
          My Boards
        </a>
      ) : (
        <button type="button" onClick={onSignIn} className={barItem}>
          <LogIn size={20} strokeWidth={2.25} className={icon(false)} />
          Sign In
        </button>
      )}
      <a href="/gallery/" aria-current={current === "gallery" ? "page" : undefined} className={barItem}>
        <LayoutGrid size={20} strokeWidth={2} fill="currentColor" className={icon(current === "gallery")} />
        Gallery
      </a>
      <a href="/gear/" aria-current={current === "gear" ? "page" : undefined} className={barItem}>
        <PedalIcon size={22} className={icon(current === "gear")} />
        Gear
      </a>
    </nav>
  );
}

const section = "flex shrink-0 items-center";


/**
 * The header on every page: the brand and `nav` (beta links) at the left; `navEnd` (save status) and Build, My Boards, Gallery, Gear,
 * What's New at the right; then Admin (catalog editors) and the account, each in a section behind a thin divider.
 */
export function SiteHeader({
  current,
  builds,
  updates,
  brandExtra,
  nav,
  navEnd,
  account,
  tabBar,
  className = "",
}: {
  tabBar?: boolean;
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
          {/* Build, My Boards, Gallery, Gear and What's New: one row. */}
          <SiteTabs current={current} builds={builds} after={updates} tabBar={tabBar} />
        </div>
      </div>
      <AdminSection current={current} />
      {account && (
        <div
          data-tour="account"
          // The same 8px (phones) / 16px gap on both sides of the divider as the nav row has before it.
          className={`${section} gap-[7px] border-l border-chrome-line pl-2 pr-[max(0.5rem,env(safe-area-inset-right))] sm:pl-4 sm:pr-[max(1rem,env(safe-area-inset-right))]`}
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
  // The account section supplies the padding around them.
  return (
    <span className="flex items-center gap-[7px]">
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
