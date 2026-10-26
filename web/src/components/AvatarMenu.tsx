import * as Dropdown from "@radix-ui/react-dropdown-menu";
import { tip } from "./Tooltip";
import { ChevronDown } from "lucide-react";
import { openBillingPortal } from "../lib/billing";
import { requestNewPlayground } from "../lib/newPlayground";
import { useAuth } from "../store/auth";
import { useBilling } from "../store/billing";
import { useUi } from "../store/ui";
import { menuItem } from "./SettingsMenu";
import { PedalAvatar } from "./PedalAvatar";

/** Signed-in users only: avatar (a pedal of their choice, 24px) with a chevron; opens the account menu. */
export function AvatarMenu({
  onAccount,
  onPlaygrounds,
  onChangeAvatar,
}: {
  onAccount: () => void;
  onPlaygrounds: () => void;
  onChangeAvatar: () => void;
}) {
  const { user, signOut } = useAuth();
  const { entitlements, billingEnabled } = useBilling();
  const openUpgrade = useUi((u) => u.openUpgrade);
  const avatar = useUi((u) => u.avatar);

  return (
    <Dropdown.Root>
      <Dropdown.Trigger
        aria-label={`Account menu (${user?.email ?? ""})`}
        {...tip("Your Account")}
        className="press flex h-9 items-center gap-1 rounded-control px-1.5 text-ink-muted outline-none hover:bg-surface-hover active:bg-chrome-line focus-visible:ring-2 focus-visible:ring-brand data-[state=open]:bg-surface-hover"
      >
        <span className="grid size-6 place-items-center">
          <PedalAvatar pedalKey={avatar} size={24} />
        </span>
        <ChevronDown size={14} />
      </Dropdown.Trigger>
      <Dropdown.Portal>
        <Dropdown.Content align="end" sideOffset={10} className="animate-menu z-50 min-w-52 rounded-panel bg-surface p-1.5 shadow-panel">
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
          <Dropdown.Item className={menuItem} onSelect={onPlaygrounds}>
            Playgrounds
          </Dropdown.Item>
          <Dropdown.Item className={menuItem} onSelect={requestNewPlayground}>
            New Playground
          </Dropdown.Item>
          <Dropdown.Item className={menuItem} onSelect={onChangeAvatar}>
            Change Avatar…
          </Dropdown.Item>
          <Dropdown.Separator className="my-1 h-px bg-line" />
          <Dropdown.Item className={menuItem} onSelect={() => void signOut()}>
            Sign Out
          </Dropdown.Item>
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
  );
}
