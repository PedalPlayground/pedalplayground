import * as Dropdown from "@radix-ui/react-dropdown-menu";
import { useRef, useState, type ReactNode } from "react";
import { tip } from "./Tooltip";
import { ChevronDown, Copy, LayoutList, Pencil, Plus, LogIn, Settings2 } from "lucide-react";
import { PedalboardIcon, tabClass, tabIcon, tabLabel } from "./SiteTabs";
import type { PlaygroundSummary } from "../lib/cloud";
import { handoffHref, type Handoff } from "../lib/handoff";
import { requestNewPlayground } from "../lib/newPlayground";
import { useAuth } from "../store/auth";
import { useBilling } from "../store/billing";
import { useCloud } from "../store/cloud";
import { usePlayground } from "../store/playground";
import { useUi } from "../store/ui";

const item =
  "flex cursor-pointer select-none items-center gap-3 rounded-control px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-surface-hover";

type MenuProps = { onEdit: (target?: PlaygroundSummary) => void; onSignIn: () => void; onPlaygrounds: () => void };
/** On other pages (the gallery), picks go to the playground instead; see lib/handoff. */
const go = (h: Handoff) => window.location.assign(handoffHref(h));

const cardAction =
  "grid size-7 shrink-0 place-items-center rounded-control text-ink-muted outline-none hover:bg-ink/10 hover:text-ink focus-visible:ring-2 focus-visible:ring-brand";

/** "Edited Oct 27", or with the year once it's not this year. */
function edited(iso: string) {
  const d = new Date(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return `Edited ${d.toLocaleDateString(undefined, { month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) })}`;
}

/**
 * The board hub: New Playground, the user's playgrounds as cards (open, settings), All Playgrounds and Playground Settings.
 * Guests have New Playground and Sign In to Save.
 */
function MenuContent({ onEdit, onSignIn, onPlaygrounds, onCloseAutoFocus, remote }: MenuProps & { onCloseAutoFocus: (e: Event) => void; remote: boolean }) {
  const user = useAuth((s) => s.user);
  const cloudEnabled = useAuth((s) => s.cloudEnabled);
  const { list, cloudId, openPlayground } = useCloud();
  const cards = user ? list.slice(0, 6) : [];
  // The gallery doesn't load your board, so New Playground is always offered there.
  const empty = usePlayground((s) => s.items.length === 0) && !remote;
  const newPlayground = remote ? () => go({ kind: "new" }) : requestNewPlayground;

  // Guests have one board on this device: they can start it over, or sign in to save it.
  if (!user) {
    return (
      <Dropdown.Portal>
        <Dropdown.Content
          side="bottom"
          align="start"
          sideOffset={6}
          collisionPadding={12}
          onCloseAutoFocus={onCloseAutoFocus}
          className="animate-menu z-50 w-60 max-w-[calc(100vw-24px)] rounded-panel bg-surface p-1.5 shadow-panel max-h-[var(--radix-dropdown-menu-content-available-height)] overflow-y-auto overscroll-contain"
        >
          <Dropdown.Item disabled={empty} className={`${item} data-[disabled]:cursor-default data-[disabled]:opacity-40`} onSelect={newPlayground}>
            <Plus size={14} />
            New Playground
          </Dropdown.Item>
          {cloudEnabled && (
            <>
              <Dropdown.Separator className="my-1 h-px bg-line" />
              <Dropdown.Item className={`${item} text-brand`} onSelect={onSignIn}>
                <LogIn size={14} />
                Sign In to Save
              </Dropdown.Item>
            </>
          )}
        </Dropdown.Content>
      </Dropdown.Portal>
    );
  }

  return (
    <Dropdown.Portal>
      <Dropdown.Content
        side="bottom"
        align="start"
        sideOffset={6}
        collisionPadding={12}
        onCloseAutoFocus={onCloseAutoFocus}
        className="animate-menu z-50 w-80 max-w-[calc(100vw-24px)] rounded-panel bg-surface p-1.5 shadow-panel max-h-[var(--radix-dropdown-menu-content-available-height)] overflow-y-auto overscroll-contain"
      >
        <Dropdown.Item className={item} onSelect={newPlayground}>
          <Plus size={14} />
          New Playground
        </Dropdown.Item>
        <Dropdown.Separator className="my-1 h-px bg-line" />
        {cards.length > 0 && (
          <>
            <Dropdown.Label className="px-2 pb-1.5 pt-1 text-xs text-ink-muted">Your Playgrounds</Dropdown.Label>
            <div className="flex flex-col gap-1">
              {cards.map((p) => {
                const current = p.id === cloudId;
                return (
                  <Dropdown.Item
                    key={p.id}
                    aria-current={current || undefined}
                    onSelect={() => (remote ? go({ kind: "open", id: p.id }) : void openPlayground(p.id))}
                    className={`flex cursor-pointer select-none items-center gap-2.5 rounded-control p-1.5 outline-none ${
                      current ? "bg-surface-hover data-[highlighted]:bg-ink/10" : "data-[highlighted]:bg-surface-hover"
                    }`}
                  >
                    {p.thumbnail ? (
                      <img src={p.thumbnail} alt="" className="aspect-[8/5] w-14 shrink-0 rounded-[3px] bg-canvas object-contain" />
                    ) : (
                      <span className="aspect-[8/5] w-14 shrink-0 rounded-[3px] bg-canvas" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{p.name}</span>
                      <span className="block truncate text-xs text-ink-muted">
                        {current ? "Open now" : edited(p.updated_at)}
                        {p.is_public && " · Shared"}
                      </span>
                    </span>
                    {/* Its own click: don't also open the playground. */}
                    <button
                      aria-label={`Settings for ${p.name}`}
                      {...tip("Playground Settings")}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (remote) go({ kind: "edit", id: p.id });
                        else onEdit(p);
                      }}
                      className={cardAction}
                    >
                      <Pencil size={14} />
                    </button>
                  </Dropdown.Item>
                );
              })}
            </div>
          </>
        )}
        <Dropdown.Item className={item} onSelect={remote ? () => go({ kind: "playgrounds" }) : onPlaygrounds}>
          <LayoutList size={14} />
          All Playgrounds…
        </Dropdown.Item>
        {/* "The open board" only means something on the playground. */}
        {!remote && (
          <>
            <Dropdown.Separator className="my-1 h-px bg-line" />
            <Dropdown.Item className={item} onSelect={() => onEdit()}>
              <Settings2 size={14} />
              Playground Settings…
            </Dropdown.Item>
          </>
        )}
      </Dropdown.Content>
    </Dropdown.Portal>
  );
}

/**
 * The My Playgrounds tab: your playgrounds' menu (New Playground, your boards, All Playgrounds, Playground Settings), styled like
 * the Explore and Updates tabs beside it.
 */
export function BuildsMenu({ onEdit, onSignIn, onPlaygrounds, remote = false }: MenuProps & { remote?: boolean }) {
  const [open, setOpen] = useState(false);
  /**
   * The dialog to open once the menu has closed (Playground Settings, All Playgrounds or Sign In). It opens only then: opened sooner, the menu's focus trap and
   * focus return pull focus out of the dialog's name field. `null` means nothing to open.
   */
  const pending = useRef<{ open: () => void } | null>(null);
  return (
    <Dropdown.Root open={open} onOpenChange={setOpen}>
      <Dropdown.Trigger data-tour="playgrounds" aria-label="My Playgrounds" className={tabClass(false)}>
        <PedalboardIcon {...tabIcon} className="text-ink-muted" />
        <span className={tabLabel}>My Playgrounds</span>
        <ChevronDown size={12} strokeWidth={2.5} className="-ml-0.5 shrink-0 text-ink-muted" />
      </Dropdown.Trigger>
      <MenuContent
        remote={remote}
        onEdit={(target) => {
          pending.current = { open: () => onEdit(target) };
          setOpen(false);
        }}
        onSignIn={() => {
          pending.current = { open: onSignIn };
          setOpen(false);
        }}
        onPlaygrounds={() => {
          pending.current = { open: onPlaygrounds };
          setOpen(false);
        }}
        onCloseAutoFocus={(e) => {
          if (!pending.current) return;
          e.preventDefault();
          const { open } = pending.current;
          pending.current = null;
          open();
        }}
      />
    </Dropdown.Root>
  );
}

const labelButton =
  "press grid size-7 shrink-0 place-items-center rounded-control text-ink-muted outline-none hover:bg-ink/5 hover:text-ink focus-visible:ring-2 focus-visible:ring-brand";

/**
 * Over the canvas's top-left corner: the open board's name, with comments once it's shared and a pencil for Playground
 * Settings. Someone else's board: Create a Copy (and on phones, where the side panel is a sheet, its name and comments).
 */
export function BoardLabel({ comments, onEdit, onSignIn }: { comments?: ReactNode; onEdit: () => void; onSignIn: () => void }) {
  const viewing = useUi((u) => u.viewing);
  // A link is still loading: show nothing rather than your own board's name.
  const opening = useUi((u) => u.openingShared);
  const name = usePlayground((s) => s.name);
  const user = useAuth((s) => s.user);
  if (opening) return null;
  return (
    <div className="pointer-events-none absolute left-[max(1.1875rem,env(safe-area-inset-left))] right-[max(1rem,env(safe-area-inset-right))] top-[22px] z-20 flex max-sm:left-[max(0.75rem,env(safe-area-inset-left))] max-sm:top-3">
      <div className="pointer-events-auto flex min-w-0 items-center gap-1 text-sm/4 font-semibold tracking-[-0.01em] text-ink">
        {viewing ? (
          <>
            <span className="min-w-0 truncate sm:hidden">
              {viewing.name}
              {viewing.ownerName && <span className="font-normal text-ink-muted"> by {viewing.ownerName}</span>}
            </span>
            <CopyButton onSignIn={onSignIn} />
            {comments}
          </>
        ) : (
          <>
            <span className="min-w-0 truncate">{name}</span>
            {user && (
              <button type="button" onClick={onEdit} aria-label="Playground Settings" {...tip("Playground Settings", { side: "bottom" })} className={labelButton}>
                <Pencil size={14} strokeWidth={2} />
              </button>
            )}
            {comments}
          </>
        )}
      </div>
    </div>
  );
}

function CopyButton({ onSignIn }: { onSignIn: () => void }) {
  const openUpgrade = useUi((u) => u.openUpgrade);
  const user = useAuth((s) => s.user);
  const { billingEnabled, entitlements } = useBilling();
  const copyShared = useCloud((c) => c.copyShared);
  // Copies are a Pro feature; without billing set up, nothing is gated.
  const canCopy = !!user && (!billingEnabled || entitlements?.plan === "pro");
  const createCopy = () => {
    if (!user) onSignIn();
    else if (!canCopy) openUpgrade("copy");
    else copyShared();
  };
  return (
    <button
      type="button"
      onClick={createCopy}
      aria-label="Create a Copy"
      className="press flex h-7 shrink-0 items-center gap-1.5 rounded-control px-1.5 outline-none hover:bg-ink/5 focus-visible:ring-2 focus-visible:ring-brand sm:-ml-1.5"
    >
      <Copy size={14} strokeWidth={2.25} />
      <span className="max-sm:hidden">Create a Copy</span>
      {!canCopy && user && <span className="rounded-full bg-brand/10 px-1.5 text-[11px] font-semibold text-brand">Pro</span>}
    </button>
  );
}
