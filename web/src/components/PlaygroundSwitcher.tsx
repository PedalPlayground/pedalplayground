import * as Dropdown from "@radix-ui/react-dropdown-menu";
import { useRef, useState } from "react";
import { tip } from "./Tooltip";
import { ChevronDown, Pencil, Plus } from "lucide-react";
import type { PlaygroundSummary } from "../lib/cloud";
import { requestNewPlayground } from "../lib/newPlayground";
import { useAuth } from "../store/auth";
import { useCloud } from "../store/cloud";
import { usePlayground } from "../store/playground";

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

/** The playground menu: the user's playgrounds as cards (open, edit), new, and (signed out) sign in. */
function MenuContent({ onEdit, onSignIn, onCloseAutoFocus }: MenuProps & { onCloseAutoFocus: (e: Event) => void }) {
  const user = useAuth((s) => s.user);
  const cloudEnabled = useAuth((s) => s.cloudEnabled);
  const { list, cloudId, openPlayground } = useCloud();
  const cards = user ? list.slice(0, 6) : [];
  // The open playground has its own card when it's saved; otherwise edit it from the top item.
  const openHasCard = cards.some((p) => p.id === cloudId);

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
                        {p.is_public && " · Public"}
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
        {cloudEnabled && !user && (
          <>
            <Dropdown.Separator className="my-1 h-px bg-line" />
            <Dropdown.Item className={`${item} text-brand`} onSelect={onSignIn}>
              Sign In to Save Across Devices
            </Dropdown.Item>
          </>
        )}
      </Dropdown.Content>
    </Dropdown.Portal>
  );
}

/** Header center: "⌄ Playground name", which opens the playground menu (from Figma). */
export function PlaygroundBreadcrumb({ className = "", onEdit, onSignIn }: MenuProps & { className?: string }) {
  const name = usePlayground((s) => s.name);
  const [open, setOpen] = useState(false);
  /**
   * What to edit once the menu has closed. The dialog opens only then: opened sooner, the menu's focus trap and
   * focus return pull focus out of the dialog's name field. `null` means nothing to open.
   */
  const pending = useRef<{ target?: PlaygroundSummary } | null>(null);
  return (
    <div className={`flex min-w-0 items-center text-sm/4 font-semibold tracking-[-0.01em] ${className}`}>
      <Dropdown.Root open={open} onOpenChange={setOpen}>
        <Dropdown.Trigger
          aria-label={`Playground: ${name}`}
          {...tip("Switch Playgrounds")}
          className="-mx-1.5 flex min-w-0 items-center gap-2 rounded-control px-1.5 py-1 outline-none transition-colors hover:bg-ink/5 active:bg-ink/10 focus-visible:ring-2 focus-visible:ring-brand data-[state=open]:bg-ink/5"
        >
          <ChevronDown size={12} strokeWidth={2.5} className="shrink-0" />
          <span className="truncate">{name}</span>
        </Dropdown.Trigger>
        <MenuContent
          onEdit={(target) => {
            pending.current = { target };
            setOpen(false);
          }}
          onCloseAutoFocus={(e) => {
            if (!pending.current) return;
            e.preventDefault();
            const { target } = pending.current;
            pending.current = null;
            onEdit(target);
          }}
          onSignIn={onSignIn}
        />
      </Dropdown.Root>
    </div>
  );
}
