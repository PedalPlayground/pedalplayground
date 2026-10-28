import { AtSign } from "lucide-react";
import * as Dropdown from "@radix-ui/react-dropdown-menu";
import { menuItem } from "./SettingsMenu";
import { tip } from "./Tooltip";

const socialIcon =
  "grid size-7 cursor-pointer place-items-center rounded-control text-ink-muted outline-none hover:text-ink data-[highlighted]:bg-surface-hover data-[highlighted]:text-ink";

const LINKS = {
  x: "https://x.com/tehtrav",
  threads: "https://www.threads.net/@tehtrav",
  donate: "https://www.paypal.me/travlehman",
};

/** The X logo. */
function XLogo() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden>
      <path d="M18.24 2.25h3.31l-7.23 8.26 8.5 11.24h-6.66l-5.21-6.82-5.97 6.82H1.67l7.73-8.84L1.25 2.25h6.83l4.71 6.23 5.45-6.23Zm-1.16 17.52h1.83L7.08 4.13H5.12l11.96 15.64Z" />
    </svg>
  );
}


/** "Say hi" (X and Threads) and "Support Pedal Playground", as items for a Radix dropdown. Also in Settings on phones. */
export function CreditMenuItems() {
  return (
    <>
    {/* "Say hi" with the two social links as icons, then the donate link. */}
    <div className="flex items-center justify-between gap-6 px-3 py-1.5 text-sm">
      Say hi
      <span className="flex items-center gap-0.5">
        <Dropdown.Item asChild className={socialIcon}>
          <a href={LINKS.x} target="_blank" rel="noreferrer" aria-label="X" {...tip("X")}>
            <XLogo />
          </a>
        </Dropdown.Item>
        <Dropdown.Item asChild className={socialIcon}>
          <a href={LINKS.threads} target="_blank" rel="noreferrer" aria-label="Threads" {...tip("Threads")}>
            <AtSign size={15} strokeWidth={2.25} />
          </a>
        </Dropdown.Item>
      </span>
    </div>
    <Dropdown.Item asChild className={menuItem}>
      <a href={LINKS.donate} target="_blank" rel="noreferrer">
        Support Pedal Playground
      </a>
    </Dropdown.Item>
    </>
  );
}

/** "Made with love by @tehtrav" in the lower-left corner; @tehtrav opens links to X, Threads and a donate button. */
export function MadeBy({ className = "" }: { className?: string }) {
  return (
    <p className={`text-[11px] text-ink-muted opacity-70 transition-opacity hover:opacity-100 has-[[data-state=open]]:opacity-100 ${className}`}>
      Made with love by{" "}
      <Dropdown.Root>
        <Dropdown.Trigger className="rounded-[3px] font-medium outline-none hover:text-brand focus-visible:ring-2 focus-visible:ring-brand data-[state=open]:text-brand">
          @tehtrav
        </Dropdown.Trigger>
        <Dropdown.Portal>
          <Dropdown.Content side="top" align="start" sideOffset={8} className="animate-menu z-50 min-w-48 rounded-panel bg-surface p-1.5 shadow-panel">
            <CreditMenuItems />
          </Dropdown.Content>
        </Dropdown.Portal>
      </Dropdown.Root>
    </p>
  );
}
