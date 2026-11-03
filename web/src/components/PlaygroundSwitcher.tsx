import * as Dropdown from "@radix-ui/react-dropdown-menu";
import { useRef, useState } from "react";
import { tip } from "./Tooltip";
import { ChevronDown, Copy, LayoutGrid, LayoutList, Pencil, Plus, LogIn, Settings2 } from "lucide-react";
import type { PlaygroundSummary } from "../lib/cloud";
import { requestNewPlayground } from "../lib/newPlayground";
import { useAuth } from "../store/auth";
import { useBilling } from "../store/billing";
import { useCloud } from "../store/cloud";
import { usePlayground } from "../store/playground";
import { useUi } from "../store/ui";

const item =
  "flex cursor-pointer select-none items-center gap-3 rounded-control px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-surface-hover";

type MenuProps = { onEdit: (target?: PlaygroundSummary) => void; onSignIn: () => void; onPlaygrounds: () => void };

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
function MenuContent({ onEdit, onSignIn, onPlaygrounds, onCloseAutoFocus }: MenuProps & { onCloseAutoFocus: (e: Event) => void }) {
  const user = useAuth((s) => s.user);
  const cloudEnabled = useAuth((s) => s.cloudEnabled);
  const { list, cloudId, openPlayground } = useCloud();
  const cards = user ? list.slice(0, 6) : [];
  const empty = usePlayground((s) => s.items.length === 0);

  // Guests have one board on this device: they can start it over, or sign in to save it.
  if (!user) {
    return (
      <Dropdown.Portal>
        <Dropdown.Content
          side="bottom"
          align="center"
          sideOffset={8}
          collisionPadding={12}
          onCloseAutoFocus={onCloseAutoFocus}
          className="animate-menu z-50 w-60 max-w-[calc(100vw-24px)] rounded-panel bg-surface p-1.5 shadow-panel"
        >
          <Dropdown.Item disabled={empty} className={`${item} data-[disabled]:cursor-default data-[disabled]:opacity-40`} onSelect={requestNewPlayground}>
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
        align="center"
        sideOffset={8}
        collisionPadding={12}
        onCloseAutoFocus={onCloseAutoFocus}
        className="animate-menu z-50 w-80 max-w-[calc(100vw-24px)] rounded-panel bg-surface p-1.5 shadow-panel"
      >
        <Dropdown.Item className={item} onSelect={requestNewPlayground}>
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
                    onSelect={() => void openPlayground(p.id)}
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
                        onEdit(p);
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
        <Dropdown.Item className={item} onSelect={onPlaygrounds}>
          <LayoutList size={14} />
          All Playgrounds…
        </Dropdown.Item>
        <Dropdown.Separator className="my-1 h-px bg-line" />
        <Dropdown.Item className={item} onSelect={() => onEdit()}>
          <Settings2 size={14} />
          Playground Settings…
        </Dropdown.Item>
      </Dropdown.Content>
    </Dropdown.Portal>
  );
}

/**
 * Header center while someone else's board is viewed: Create a Copy, as a plain text control like your own board's menu.
 * The board's name and owner are in the side panel.
 */
function SharedBreadcrumb({ className, onSignIn }: { className: string; onSignIn: () => void }) {
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
    <div className={`flex min-w-0 items-center text-sm/4 font-semibold tracking-[-0.01em] ${className}`}>
      <button
        type="button"
        onClick={createCopy}
        className="flex min-w-0 items-center gap-2 rounded-control px-1.5 sm:-mx-1.5 py-1 outline-none transition-colors hover:bg-ink/5 active:bg-ink/10 focus-visible:ring-2 focus-visible:ring-brand"
      >
        <Copy size={14} strokeWidth={2.25} className="shrink-0" />
        <span className="truncate">
          {/* Phones: just "Copy", so it fits between the tabs and the comments button. */}
          <span className="max-sm:hidden">Create a </span>
          <span className="sm:hidden">Copy</span>
          <span className="max-sm:hidden">Copy</span>
        </span>
        {!canCopy && user && <span className="rounded-full bg-brand/10 px-1.5 text-[11px] font-semibold text-brand">Pro</span>}
      </button>
    </div>
  );
}

/** Header center: the open playground's menu, or the shared playground being viewed. */
export function PlaygroundBreadcrumb({ className = "", ...props }: MenuProps & { className?: string }) {
  const viewing = useUi((u) => !!u.viewing);
  // A link is still loading: show nothing rather than your own board's name.
  const opening = useUi((u) => u.openingShared);
  if (opening) return null;
  return viewing ? <SharedBreadcrumb className={className} onSignIn={props.onSignIn} /> : <OwnBreadcrumb className={className} {...props} />;
}

function OwnBreadcrumb({ className, onEdit, onSignIn, onPlaygrounds }: MenuProps & { className: string }) {
  const name = usePlayground((s) => s.name);
  const [open, setOpen] = useState(false);
  /**
   * The dialog to open once the menu has closed (Playground Settings, All Playgrounds or Sign In). It opens only then: opened sooner, the menu's focus trap and
   * focus return pull focus out of the dialog's name field. `null` means nothing to open.
   */
  const pending = useRef<{ open: () => void } | null>(null);
  return (
    <div className={`flex min-w-0 items-center text-sm/4 font-semibold tracking-[-0.01em] ${className}`}>
      <Dropdown.Root open={open} onOpenChange={setOpen}>
        <Dropdown.Trigger
          data-tour="playgrounds"
          aria-label={`Playground: ${name}`}
          className="flex min-w-0 items-center gap-2 rounded-control px-1.5 sm:-mx-1.5 py-1 outline-none transition-colors hover:bg-ink/5 active:bg-ink/10 focus-visible:ring-2 focus-visible:ring-brand data-[state=open]:bg-ink/5"
        >
          <span className="truncate">{name}</span>
          <ChevronDown size={12} strokeWidth={2.5} className="shrink-0" />
        </Dropdown.Trigger>
        <MenuContent
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
    </div>
  );
}

/** Phones only, over the canvas while someone else's board is viewed: its name and owner, and the way back to the gallery. */
export function ViewingBar() {
  const viewing = useUi((u) => u.viewing);
  if (!viewing) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 top-3 z-10 flex justify-center px-3 sm:hidden">
      <div className="pointer-events-auto flex max-w-full items-center gap-1 rounded-full bg-surface py-1 pl-3.5 pr-1 shadow-panel">
        {/* The header has Create a Copy in place of the name, so phones see the name here. */}
        <span className="min-w-0 truncate text-[13px]">
          <span className="font-semibold text-ink">{viewing.name}</span>
          {viewing.ownerName && <span className="text-ink-muted"> by {viewing.ownerName}</span>}
        </span>
        <a
          href="/gallery/"
          className="press flex h-7 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[13px] font-semibold text-ink outline-none hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-brand"
        >
          <LayoutGrid size={13} strokeWidth={2.25} />
          Gallery
        </a>
      </div>
    </div>
  );
}
