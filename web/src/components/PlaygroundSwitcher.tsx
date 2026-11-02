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

/** Header center while someone else's board is viewed: just its name and owner. Its actions live in the side panel. */
function SharedBreadcrumb({ className }: { className: string }) {
  const viewing = useUi((u) => u.viewing)!;
  const owner = viewing.ownerName;
  return (
    <div className={`flex min-w-0 items-center gap-2 text-sm/4 tracking-[-0.01em] ${className}`}>
      <span className="truncate font-semibold">{viewing.name}</span>
      {owner && <span className="shrink-0 text-ink-muted max-sm:hidden">by {owner}</span>}
    </div>
  );
}

/** Header center: the open playground's menu, or the shared playground being viewed. */
export function PlaygroundBreadcrumb({ className = "", ...props }: MenuProps & { className?: string }) {
  const viewing = useUi((u) => !!u.viewing);
  return viewing ? <SharedBreadcrumb className={className} /> : <OwnBreadcrumb className={className} {...props} />;
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
          className="-mx-1.5 flex min-w-0 items-center gap-2 rounded-control px-1.5 py-1 outline-none transition-colors hover:bg-ink/5 active:bg-ink/10 focus-visible:ring-2 focus-visible:ring-brand data-[state=open]:bg-ink/5"
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

/**
 * Top center of the canvas while someone else's board is viewed: Create a Copy, the one thing to do with it.
 * Phones also get whose board it is and the way back to the gallery (larger screens have those in the side panel).
 */
export function ViewingBar({ onSignIn }: { onSignIn: () => void }) {
  const viewing = useUi((u) => u.viewing);
  const openUpgrade = useUi((u) => u.openUpgrade);
  const user = useAuth((s) => s.user);
  const { billingEnabled, entitlements } = useBilling();
  const copyShared = useCloud((c) => c.copyShared);
  if (!viewing) return null;
  const canCopy = !!user && (!billingEnabled || entitlements?.plan === "pro");
  const createCopy = () => {
    if (!user) onSignIn();
    else if (!canCopy) openUpgrade("copy");
    else copyShared();
  };
  const button = "press flex shrink-0 items-center gap-1.5 rounded-full font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand";
  return (
    <div className="pointer-events-none absolute inset-x-0 top-3 z-10 flex justify-center px-3 sm:top-4">
      <div className="pointer-events-auto flex max-w-full items-center gap-1 rounded-full max-sm:bg-surface max-sm:py-1 max-sm:pl-3.5 max-sm:pr-1 max-sm:shadow-panel">
        <span className="min-w-0 truncate text-[13px] text-ink-muted sm:hidden">
          {viewing.ownerName ? `${viewing.ownerName}'s board` : "A shared board"}
        </span>
        <button
          type="button"
          onClick={createCopy}
          className={`${button} btn-primary h-7 px-2.5 text-[13px] sm:h-9 sm:px-4 sm:text-sm sm:shadow-panel`}
        >
          <Copy size={14} strokeWidth={2.25} />
          <span className="max-sm:hidden">Create a Copy</span>
          <span className="sm:hidden">Copy</span>
          {!canCopy && user && <span className="rounded-full bg-white/20 px-1.5 text-[11px] font-semibold">Pro</span>}
        </button>
        <a href="/gallery/" className={`${button} h-7 px-2.5 text-[13px] text-ink hover:bg-surface-hover sm:hidden`}>
          <LayoutGrid size={13} strokeWidth={2.25} />
          Gallery
        </a>
      </div>
    </div>
  );
}
