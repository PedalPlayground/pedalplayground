import * as Dropdown from "@radix-ui/react-dropdown-menu";
import { useRef, useState, type ReactNode } from "react";
import { tip } from "./Tooltip";
import { ChevronDown, Copy, LayoutList, Pencil, Plus, LogIn, Settings, Settings2 } from "lucide-react";
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
          align="start"
          sideOffset={6}
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
        align="start"
        sideOffset={6}
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

const boxBase = "pointer-events-auto relative flex w-[277px] min-w-0 max-w-full items-center gap-2 rounded-[6px] border border-line bg-surface pl-2 text-[13px] text-ink";
/** In the header (larger screens), or over the canvas on phones, where the header has no room for it. */
const boxAt = {
  header: `${boxBase} h-8`,
  canvas: `${boxBase} h-10 max-w-[calc(100%-5.5rem)] shadow-[0_0_6px_rgb(0_0_0/0.05)]`,
};
type Placement = keyof typeof boxAt;
const plainTrigger =
  "flex min-w-0 items-center gap-2 rounded-control px-1.5 py-1 text-sm/4 font-semibold tracking-[-0.01em] text-ink outline-none transition-colors hover:bg-ink/5 active:bg-ink/10 focus-visible:ring-2 focus-visible:ring-brand";
const boxIcon =
  "relative z-10 grid size-7 shrink-0 place-items-center rounded-control text-ink-muted outline-none hover:bg-ink/5 hover:text-ink focus-visible:ring-2 focus-visible:ring-brand";
/** Where the box sits: the canvas's top-left corner. */
const corner = "pointer-events-none absolute left-[max(1rem,env(safe-area-inset-left))] right-4 top-4 z-20 flex max-sm:left-[max(0.75rem,env(safe-area-inset-left))] max-sm:top-3";

/**
 * The board selector: in the header beside the logo, or over the canvas's top-left corner on phones. Your own board: its name (opens the board menu), comments once
 * it's shared, Playground Settings, and the menu chevron. Someone else's board: its name and owner, Copy, and comments.
 */
export function BoardSelect({ comments, placement, ...props }: MenuProps & { comments?: ReactNode; placement: Placement }) {
  const viewing = useUi((u) => !!u.viewing);
  // A link is still loading: show nothing rather than your own board's name.
  const opening = useUi((u) => u.openingShared);
  if (opening) return null;
  const box = boxAt[placement];
  const plain = placement === "header";
  const inner = viewing ? (
    <SharedBox box={box} plain={plain} comments={comments} onSignIn={props.onSignIn} />
  ) : (
    <OwnBox box={box} plain={plain} comments={comments} {...props} />
  );
  return placement === "canvas" ? <div className={`${corner} sm:hidden`}>{inner}</div> : <div className="flex min-w-0 max-sm:hidden">{inner}</div>;
}

function SharedBox({ box, plain, comments, onSignIn }: { box: string; plain: boolean; comments?: ReactNode; onSignIn: () => void }) {
  const viewing = useUi((u) => u.viewing);
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
  // The header (larger screens, where the side panel has the name): Create a Copy as plain text.
  if (plain)
    return (
      <button type="button" onClick={createCopy} className={plainTrigger}>
        <Copy size={14} strokeWidth={2.25} className="shrink-0" />
        <span className="truncate">Create a Copy</span>
        {!canCopy && user && <span className="rounded-full bg-brand/10 px-1.5 text-[11px] font-semibold text-brand">Pro</span>}
      </button>
    );
  return (
    // Larger screens have the name in the pinned side panel, so the box is just Copy there.
    <div className={`${box} pr-1.5 sm:w-auto`}>
      <span className="min-w-0 flex-1 truncate sm:hidden">
        {viewing?.name}
        {viewing?.ownerName && <span className="text-ink-muted"> by {viewing.ownerName}</span>}
      </span>
      {comments}
      <button
        type="button"
        onClick={createCopy}
        aria-label="Create a Copy"
        {...tip("Create a Copy", { side: "bottom" })}
        className="press flex h-7 shrink-0 items-center gap-1.5 rounded-control px-1.5 font-semibold outline-none hover:bg-ink/5 focus-visible:ring-2 focus-visible:ring-brand"
      >
        <Copy size={14} strokeWidth={2.25} />
        <span className="max-sm:hidden">Copy</span>
        {!canCopy && user && <span className="rounded-full bg-brand/10 px-1.5 text-[11px] font-semibold text-brand">Pro</span>}
      </button>
    </div>
  );
}

function OwnBox({ box, plain, comments, onEdit, onSignIn, onPlaygrounds }: MenuProps & { box: string; plain: boolean; comments?: ReactNode }) {
  const name = usePlayground((s) => s.name);
  const user = useAuth((s) => s.user);
  const [open, setOpen] = useState(false);
  /**
   * The dialog to open once the menu has closed (Playground Settings, All Playgrounds or Sign In). It opens only then: opened sooner, the menu's focus trap and
   * focus return pull focus out of the dialog's name field. `null` means nothing to open.
   */
  const pending = useRef<{ open: () => void } | null>(null);
  return (
    <Dropdown.Root open={open} onOpenChange={setOpen}>
      {plain ? (
        // The header: the name and a caret, as plain text (Playground Settings is in the menu).
        <span className="flex min-w-0 items-center gap-1">
          <Dropdown.Trigger data-tour="playgrounds" aria-label={`Playground: ${name}`} className={`${plainTrigger} data-[state=open]:bg-ink/5`}>
            <span className="truncate">{name}</span>
            <ChevronDown size={12} strokeWidth={2.5} className="shrink-0" />
          </Dropdown.Trigger>
          {comments}
        </span>
      ) : (
        <div className={`${box} ${open ? "border-brand/40" : ""}`}>
          {/* The whole box opens the menu; the buttons inside sit above this. */}
          <Dropdown.Trigger
            data-tour="playgrounds"
            aria-label={`Playground: ${name}`}
            className="absolute inset-0 rounded-[5px] outline-none transition-colors hover:bg-ink/[0.03] focus-visible:ring-2 focus-visible:ring-brand"
          />
          <span className="pointer-events-none relative min-w-0 flex-1 truncate">{name}</span>
          {comments && <span className="relative z-10 flex">{comments}</span>}
          {user && (
            <button type="button" onClick={() => onEdit()} aria-label="Playground Settings" {...tip("Playground Settings", { side: "bottom" })} className={boxIcon}>
              <Settings size={16} strokeWidth={2} />
            </button>
          )}
          <span aria-hidden className="pointer-events-none relative grid h-full w-8 shrink-0 place-items-center border-l border-line text-ink-muted">
            <ChevronDown size={16} strokeWidth={2.25} />
          </span>
        </div>
      )}
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
  );
}
