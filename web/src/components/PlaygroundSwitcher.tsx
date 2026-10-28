import * as Dropdown from "@radix-ui/react-dropdown-menu";
import { useRef, useState } from "react";
import { tip } from "./Tooltip";
import { ArrowLeft, ChevronDown, Copy, Pencil, Plus, LogIn, RotateCcw } from "lucide-react";
import type { PlaygroundSummary } from "../lib/cloud";
import { requestNewPlayground } from "../lib/newPlayground";
import { useAuth } from "../store/auth";
import { useBilling } from "../store/billing";
import { useCloud } from "../store/cloud";
import { usePlayground } from "../store/playground";
import { useUi } from "../store/ui";

const item =
  "flex cursor-pointer select-none items-center gap-3 rounded-control px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-surface-hover";

type MenuProps = { onEdit: (target?: PlaygroundSummary) => void; onSignIn: () => void };

const cardAction =
  "grid size-7 shrink-0 place-items-center rounded-control text-ink-muted outline-none hover:bg-ink/10 hover:text-ink focus-visible:ring-2 focus-visible:ring-brand";

/** "Edited Oct 27", or with the year once it's not this year. */
function edited(iso: string) {
  const d = new Date(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return `Edited ${d.toLocaleDateString(undefined, { month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) })}`;
}

/** The playground menu: the user's playgrounds as cards (open, edit) and new; for guests, Start Fresh and Sign In to Save. */
function MenuContent({ onEdit, onSignIn, onCloseAutoFocus }: MenuProps & { onCloseAutoFocus: (e: Event) => void }) {
  const user = useAuth((s) => s.user);
  const cloudEnabled = useAuth((s) => s.cloudEnabled);
  const { list, cloudId, openPlayground } = useCloud();
  const cards = user ? list.slice(0, 6) : [];
  // The open playground has its own card when it's saved; otherwise edit it from the top item.
  const openHasCard = cards.some((p) => p.id === cloudId);
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
            <RotateCcw size={14} />
            Start Fresh
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
        {!openHasCard && (
          <>
            <Dropdown.Item className={item} onSelect={() => onEdit()}>
              Edit Playground…
            </Dropdown.Item>
            <Dropdown.Separator className="my-1 h-px bg-line" />
          </>
        )}
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
                      aria-label={`Edit ${p.name}`}
                      {...tip("Edit")}
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
            <Dropdown.Separator className="my-1 h-px bg-line" />
          </>
        )}
        <Dropdown.Item className={item} onSelect={requestNewPlayground}>
          <Plus size={14} />
          New Playground
        </Dropdown.Item>
      </Dropdown.Content>
    </Dropdown.Portal>
  );
}

/** Header center while a shared playground is viewed: "⌄ Name by owner", with Create a Copy and Back to My Playground. */
function SharedBreadcrumb({ className, onSignIn }: { className: string; onSignIn: () => void }) {
  const viewing = useUi((u) => u.viewing)!;
  const openUpgrade = useUi((u) => u.openUpgrade);
  const user = useAuth((s) => s.user);
  const { billingEnabled, entitlements } = useBilling();
  const { copyShared, leaveShared } = useCloud();
  // Copies are a Pro feature; without billing set up, nothing is gated.
  const canCopy = !!user && (!billingEnabled || entitlements?.plan === "pro");
  const owner = viewing.ownerName ?? "a Pedal Playground member";

  const createCopy = () => {
    if (!user) onSignIn();
    else if (!canCopy) openUpgrade("copy");
    else copyShared();
  };

  return (
    <div className={`flex min-w-0 items-center text-sm/4 tracking-[-0.01em] ${className}`}>
      <Dropdown.Root>
        <Dropdown.Trigger
          aria-label={`Shared playground: ${viewing.name} by ${owner}`}
          className="-mx-1.5 flex min-w-0 items-center gap-2 rounded-control px-1.5 py-1 outline-none transition-colors hover:bg-ink/5 active:bg-ink/10 focus-visible:ring-2 focus-visible:ring-brand data-[state=open]:bg-ink/5"
        >
          <ChevronDown size={12} strokeWidth={2.5} className="shrink-0" />
          <span className="truncate font-semibold">{viewing.name}</span>
          <span className="shrink-0 text-ink-muted max-sm:hidden">by {owner}</span>
        </Dropdown.Trigger>
        <Dropdown.Portal>
          <Dropdown.Content
            side="bottom"
            align="center"
            sideOffset={8}
            collisionPadding={12}
            className="animate-menu z-50 w-72 max-w-[calc(100vw-24px)] rounded-panel bg-surface p-1.5 shadow-panel"
          >
            <p className="px-2 pb-1.5 pt-1 text-xs text-ink-muted">
              You're viewing a shared playground. To edit it create a copy.
            </p>
            <Dropdown.Item className={item} onSelect={createCopy}>
              <Copy size={14} />
              <span className="flex-1">Create a Copy</span>
              {!canCopy && user && <span className="rounded-full bg-brand/10 px-1.5 text-[11px] font-semibold text-brand">Pro</span>}
            </Dropdown.Item>
            <Dropdown.Separator className="my-1 h-px bg-line" />
            <Dropdown.Item className={item} onSelect={leaveShared}>
              <ArrowLeft size={14} />
              Back to My Playground
            </Dropdown.Item>
          </Dropdown.Content>
        </Dropdown.Portal>
      </Dropdown.Root>
    </div>
  );
}

/** Header center: the open playground's menu, or the shared playground being viewed. */
export function PlaygroundBreadcrumb({ className = "", ...props }: MenuProps & { className?: string }) {
  const viewing = useUi((u) => !!u.viewing);
  return viewing ? <SharedBreadcrumb className={className} onSignIn={props.onSignIn} /> : <OwnBreadcrumb className={className} {...props} />;
}

function OwnBreadcrumb({ className, onEdit, onSignIn }: MenuProps & { className: string }) {
  const name = usePlayground((s) => s.name);
  const [open, setOpen] = useState(false);
  /**
   * The dialog to open once the menu has closed (Edit Playground or Sign In). It opens only then: opened sooner, the menu's focus trap and
   * focus return pull focus out of the dialog's name field. `null` means nothing to open.
   */
  const pending = useRef<{ open: () => void } | null>(null);
  return (
    <div className={`flex min-w-0 items-center text-sm/4 font-semibold tracking-[-0.01em] ${className}`}>
      <Dropdown.Root open={open} onOpenChange={setOpen}>
        <Dropdown.Trigger
          aria-label={`Playground: ${name}`}
          className="-mx-1.5 flex min-w-0 items-center gap-2 rounded-control px-1.5 py-1 outline-none transition-colors hover:bg-ink/5 active:bg-ink/10 focus-visible:ring-2 focus-visible:ring-brand data-[state=open]:bg-ink/5"
        >
          <ChevronDown size={12} strokeWidth={2.5} className="shrink-0" />
          <span className="truncate">{name}</span>
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
