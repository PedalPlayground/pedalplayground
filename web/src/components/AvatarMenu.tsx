import * as Dropdown from "@radix-ui/react-dropdown-menu";
import { tip } from "./Tooltip";
import { openBillingPortal } from "../lib/billing";
import { useAuth } from "../store/auth";
import { useBilling } from "../store/billing";
import { useUi } from "../store/ui";
import { menuItem, Segmented } from "./SettingsMenu";
import { PedalAvatar } from "./PedalAvatar";
import { useState, type ReactNode } from "react";
import { SuggestGearDialog, type SuggestTab } from "./SuggestGearDialog";

const menuContent =
  "animate-menu z-50 min-w-56 rounded-panel bg-surface p-1.5 shadow-float max-h-[var(--radix-dropdown-menu-content-available-height)] overflow-y-auto overscroll-contain";
const separator = <Dropdown.Separator className="my-1 h-px bg-line" />;
const row = "flex items-center justify-between gap-6 px-3 py-1.5 text-sm";

/** Units and appearance: the same on every page, so they live in the account menu (and the guest menu). */
function PrefRows() {
  const { units, setUnits, theme, setTheme, darkStyle, setDarkStyle } = useUi();
  return (
    <>
      <div className={row}>
        Units
        <Segmented label="Units" value={units} onChange={setUnits} options={[["in", "in"], ["mm", "mm"]]} />
      </div>
      <div className={row}>
        Appearance
        <Segmented label="Appearance" value={theme} onChange={setTheme} options={[["light", "Light"], ["dark", "Dark"], ["system", "Auto"]]} />
      </div>
      <div className={row}>
        Dark Mode
        <Segmented label="Dark Mode" value={darkStyle} onChange={setDarkStyle} options={[["dark", "Dark"], ["oled", "OLED"]]} />
      </div>
    </>
  );
}

/** Suggest Gear and Report a Bug, opening the suggestion form on that tab once the menu has closed. */
function useSuggest(onSignIn: () => void): [(tab: SuggestTab) => ReactNode, ReactNode] {
  const [open, setOpen] = useState<SuggestTab | null>(null);
  const items = () => (
    <>
      <Dropdown.Item className={menuItem} onSelect={() => setOpen("new")}>
        Suggest Gear…
      </Dropdown.Item>
      <Dropdown.Item className={menuItem} onSelect={() => setOpen("bug")}>
        Report a Bug…
      </Dropdown.Item>
    </>
  );
  const dialog = open && (
    <SuggestGearDialog
      initialTab={open}
      onClose={() => setOpen(null)}
      onSignIn={() => {
        setOpen(null);
        onSignIn();
      }}
    />
  );
  return [items, dialog];
}

const twoBars = (
  // Two bars: a menu sits behind it.
  <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden className="shrink-0">
    <path d="M2 4.5h10M2 9.5h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

/** Signed out: the two-bar menu beside Sign in, with units, appearance, Suggest Gear and Report a Bug. */
export function GuestMenu({ onSignIn }: { onSignIn: () => void }) {
  const [suggestItems, suggestDialog] = useSuggest(onSignIn);
  return (
    <>
      <Dropdown.Root>
        <Dropdown.Trigger
          aria-label="Menu"
          {...tip("Menu")}
          className="press grid size-8 place-items-center rounded-control text-ink-muted outline-none hover:bg-surface-hover hover:text-ink active:bg-chrome-line focus-visible:ring-2 focus-visible:ring-brand data-[state=open]:bg-surface-hover"
        >
          {twoBars}
        </Dropdown.Trigger>
        <Dropdown.Portal>
          <Dropdown.Content align="end" sideOffset={10} className={menuContent}>
            <PrefRows />
            {separator}
            {suggestItems("new")}
          </Dropdown.Content>
        </Dropdown.Portal>
      </Dropdown.Root>
      {suggestDialog}
    </>
  );
}

/**
 * Signed-in users only: the two-bar icon and their avatar (a pedal of their choice), opening the account menu: account
 * and billing, avatar, units and appearance, Suggest Gear and Report a Bug, Sign Out.
 */
export function AvatarMenu({
  onAccount,
  onChangeAvatar,
}: {
  onAccount: () => void;
  onChangeAvatar: () => void;
}) {
  const { user, signOut } = useAuth();
  const { entitlements, billingEnabled } = useBilling();
  const openUpgrade = useUi((u) => u.openUpgrade);
  const avatar = useUi((u) => u.avatar);
  const [suggestItems, suggestDialog] = useSuggest(onAccount);

  return (
    <>
    <Dropdown.Root>
      <Dropdown.Trigger
        aria-label={`Account menu (${user?.email ?? ""})`}
        {...tip("Your Account")}
        className="press flex h-10 items-center gap-1 rounded-control px-1 text-ink-muted outline-none hover:bg-surface-hover active:bg-chrome-line focus-visible:ring-2 focus-visible:ring-brand data-[state=open]:bg-surface-hover"
      >
        {twoBars}
        <PedalAvatar pedalKey={avatar} height={32} />
      </Dropdown.Trigger>
      <Dropdown.Portal>
        <Dropdown.Content align="end" sideOffset={10} className={menuContent}>
          <Dropdown.Label className="px-3 pb-1 pt-1.5">
            <span className="block text-xs text-ink-muted">Signed in as</span>
            <span className="block max-w-56 truncate text-sm font-medium">{user?.email}</span>
          </Dropdown.Label>
          <Dropdown.Separator className="my-1 h-px bg-line" />
          <Dropdown.Item className={menuItem} onSelect={onAccount}>
            Account
          </Dropdown.Item>
          {billingEnabled && entitlements && (
            entitlements.plan === "pro" ? (
              <Dropdown.Item className={menuItem} onSelect={() => void openBillingPortal().catch((e: Error) => window.alert(e.message))}>
                Manage Subscription
              </Dropdown.Item>
            ) : (
              <Dropdown.Item className={`${menuItem} text-brand`} onSelect={() => openUpgrade("menu")}>
                Upgrade to Pro
              </Dropdown.Item>
            )
          )}
          <Dropdown.Item className={menuItem} onSelect={onChangeAvatar}>
            Change Avatar…
          </Dropdown.Item>
          {separator}
          <PrefRows />
          {separator}
          {suggestItems("new")}
          {separator}
          <Dropdown.Item className={menuItem} onSelect={() => void signOut()}>
            Sign Out
          </Dropdown.Item>
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
    {suggestDialog}
    </>
  );
}
