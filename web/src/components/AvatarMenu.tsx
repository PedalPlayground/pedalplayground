import * as Dropdown from "@radix-ui/react-dropdown-menu";
import { User } from "lucide-react";
import { openBillingPortal } from "../lib/billing";
import { useAuth } from "../store/auth";
import { useBilling } from "../store/billing";
import { useUi } from "../store/ui";
import { menuItem } from "./SettingsMenu";

/** 24px account avatar: the user's initial when signed in, a person icon when not. */
export function AvatarMenu({ onAccount, onPlaygrounds }: { onAccount: () => void; onPlaygrounds: () => void }) {
  const { user, cloudEnabled, signOut } = useAuth();
  const { entitlements, billingEnabled } = useBilling();
  const openUpgrade = useUi((u) => u.openUpgrade);
  const initial = user?.email?.trim()[0]?.toUpperCase();

  return (
    <Dropdown.Root>
      <Dropdown.Trigger
        aria-label={user ? `Account menu (${user.email})` : "Sign in"}
        className={`grid size-6 place-items-center rounded-full text-xs font-semibold outline-none ring-offset-1 ring-offset-surface focus-visible:ring-2 focus-visible:ring-brand data-[state=open]:ring-2 data-[state=open]:ring-brand ${
          user ? "bg-brand text-brand-ink" : "bg-surface-hover text-ink-muted hover:text-ink"
        }`}
      >
        {user && initial ? initial : <User size={14} />}
      </Dropdown.Trigger>
      <Dropdown.Portal>
        <Dropdown.Content align="end" sideOffset={10} className="z-50 min-w-52 rounded-panel bg-surface p-1.5 shadow-panel">
          {cloudEnabled && user ? (
            <>
              <Dropdown.Label className="px-3 pb-1 pt-1.5">
                <span className="block text-xs text-ink-muted">Signed in as</span>
                <span className="block max-w-56 truncate text-sm font-medium">{user.email}</span>
              </Dropdown.Label>
              <Dropdown.Separator className="my-1 h-px bg-line" />
              <Dropdown.Item className={menuItem} onSelect={onAccount}>
                Account
              </Dropdown.Item>
              {billingEnabled && entitlements && (
                entitlements.plan === "pro" ? (
                  <Dropdown.Item className={menuItem} onSelect={() => void openBillingPortal().catch((e: Error) => window.alert(e.message))}>
                    Manage subscription
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
              <Dropdown.Separator className="my-1 h-px bg-line" />
              <Dropdown.Item className={menuItem} onSelect={() => void signOut()}>
                Sign out
              </Dropdown.Item>
            </>
          ) : (
            <Dropdown.Item className={menuItem} onSelect={onAccount}>
              {cloudEnabled ? "Sign in" : "Account"}
            </Dropdown.Item>
          )}
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
  );
}
