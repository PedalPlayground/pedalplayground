import { useEffect } from "react";
import { startAvatarSync } from "../lib/avatar";
import { useAuth } from "../store/auth";
import { useBilling } from "../store/billing";
import { useCatalog } from "../store/catalog";
import { useCloud } from "../store/cloud";
import { useUi } from "../store/ui";
import { AccountDialog } from "./AccountDialog";
import { AvatarDialog } from "./AvatarDialog";
import { AvatarMenu, GuestMenu } from "./AvatarMenu";
import { BuildsMenu } from "./PlaygroundSwitcher";
import { LegalDialog } from "./LegalDialog";
import { SetPasswordDialog } from "./SetPasswordForm";
import { StandingNotice } from "./StandingNotice";
import { TooltipLayer } from "./Tooltip";
import { GuestButtons, SiteHeader, type SitePage } from "./SiteTabs";
import { UpgradeDialog } from "./UpgradeDialog";
import { UsernamePrompt } from "./UsernamePrompt";
import { WhatsNew } from "./WhatsNew";

export type PageDialog = "account" | "register" | "avatar" | null;

/**
 * The site header for pages other than the playground (the gallery and the editor), with everything it opens: the
 * account, register and avatar dialogs, Upgrade, the new-password step after a reset, Pick a Username, Terms &
 * Privacy, the flagged-account notice, and tooltips. The page
 * owns `dialog` so its own buttons can open sign-in too. The playground wires up the same pieces itself in App.tsx.
 */
export function PageHeader({ current, dialog, setDialog }: { current: SitePage; dialog: PageDialog; setDialog: (d: PageDialog) => void }) {
  const user = useAuth((s) => s.user);
  const cloudEnabled = useAuth((s) => s.cloudEnabled);
  const recovering = useAuth((s) => s.recovering);
  const upgradeOpen = useUi((u) => u.upgrade !== null);

  useEffect(startAvatarSync, []);
  useEffect(() => void useBilling.getState().refresh(), [user?.id]);
  // Your boards, for the My Playgrounds menu.
  useEffect(() => void useCloud.getState().refreshList(), [user?.id]);
  // Avatar pedals and the What's New feed.
  useEffect(() => void useCatalog.getState().load(), []);

  const close = () => setDialog(null);
  return (
    <>
      {/* First stop for keyboards: jump past the header to the page's main content (id="content"). */}
      <a
        href="#content"
        className="sr-only z-50 rounded-control bg-brand px-3 py-2 text-sm font-semibold text-brand-ink focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
      >
        Skip to content
      </a>
      <SiteHeader
        current={current}
        className="sticky top-0 z-30"
        builds={<BuildsMenu remote onEdit={() => undefined} onPlaygrounds={() => undefined} onSignIn={() => setDialog("account")} />}
        updates={<WhatsNew onNewGear={() => window.location.assign("/#new-gear")} />}
        account={
          user ? (
            <AvatarMenu onAccount={() => setDialog("account")} onChangeAvatar={() => setDialog("avatar")} />
          ) : (
            <>
              {cloudEnabled && <GuestButtons onRegister={() => setDialog("register")} onSignIn={() => setDialog("account")} />}
              <GuestMenu onSignIn={() => setDialog("account")} />
            </>
          )
        }
      />
      {dialog === "account" && <AccountDialog onClose={close} />}
      {dialog === "register" && <AccountDialog onClose={close} initialTab="create" />}
      {dialog === "avatar" && <AvatarDialog onClose={close} />}
      {!dialog && <SetPasswordDialog />}
      <UpgradeDialog onSignIn={() => setDialog("account")} />
      {/* Same as the playground page: waits until nothing else is open. */}
      {!dialog && !recovering && !upgradeOpen && <UsernamePrompt />}
      <LegalDialog />
      {/* A flag an editor put on this account, shown once (also on the playground). */}
      <StandingNotice />
      {/* Tooltips from tip(), like the playground's. */}
      <TooltipLayer />
    </>
  );
}
