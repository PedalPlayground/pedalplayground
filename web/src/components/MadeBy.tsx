import * as Dropdown from "@radix-ui/react-dropdown-menu";
import { menuItem } from "./SettingsMenu";

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

/** The Threads logo. */
function ThreadsLogo() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden>
      <path d="M17.7 11.1c-.1 0-.2-.1-.3-.1-.2-3-1.8-4.7-4.6-4.7h-.1c-1.6 0-3 .7-3.9 2l1.5 1c.6-.9 1.6-1.1 2.4-1.1 1 0 1.7.3 2.2.8.3.4.6 1 .7 1.7-.8-.1-1.6-.2-2.5-.1-2.5.1-4.1 1.6-4 3.6.1 1 .6 1.9 1.4 2.5.7.5 1.6.7 2.6.6 1.3-.1 2.3-.6 3-1.5.5-.7.9-1.6 1-2.7.6.4 1.1.8 1.3 1.4.4 1 .4 2.6-.9 3.9-1.2 1.2-2.6 1.7-4.7 1.7-2.4 0-4.1-.8-5.3-2.2-1.1-1.3-1.6-3.3-1.7-5.7.1-2.5.6-4.4 1.7-5.7 1.1-1.4 2.9-2.1 5.3-2.2 2.4 0 4.2.8 5.4 2.2.6.7 1 1.6 1.3 2.6l1.8-.5c-.4-1.3-.9-2.4-1.7-3.3C17.8 2 15.6 1 12.7 1c-2.9 0-5.1 1-6.6 2.8C4.8 5.4 4.1 7.7 4 10.5v.1c.1 2.8.8 5.1 2.1 6.7C7.6 19.1 9.8 20 12.7 20c2.5 0 4.3-.7 5.8-2.2 2-2 1.9-4.4 1.3-5.9-.5-1.1-1.4-2-2.6-2.6Zm-4.3 4.1c-1.1.1-2.2-.4-2.2-1.4 0-.7.5-1.6 2.3-1.7h.6c.6 0 1.2.1 1.8.2-.2 2.5-1.4 2.9-2.5 2.9Z" />
    </svg>
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
            <Dropdown.Item asChild className={menuItem}>
              <a href={LINKS.x} target="_blank" rel="noreferrer">
                <span className="flex items-center gap-2">
                  <XLogo />Find me on X
                </span>
              </a>
            </Dropdown.Item>
            <Dropdown.Item asChild className={menuItem}>
              <a href={LINKS.threads} target="_blank" rel="noreferrer">
                <span className="flex items-center gap-2">
                  <ThreadsLogo />
                  Find me on Threads
                </span>
              </a>
            </Dropdown.Item>
            <Dropdown.Separator className="my-1 h-px bg-line" />
            <Dropdown.Item asChild className="flex h-9 cursor-pointer items-center justify-center rounded-control text-sm outline-none btn-primary">
              <a href={LINKS.donate} target="_blank" rel="noreferrer">
                Donate
              </a>
            </Dropdown.Item>
          </Dropdown.Content>
        </Dropdown.Portal>
      </Dropdown.Root>
    </p>
  );
}
