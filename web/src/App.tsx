import { useEffect, useState } from "react";
import type { EmailOtpType } from "@supabase/supabase-js";
import { AccountDialog } from "./components/AccountDialog";
import { Canvas } from "./components/Canvas";
import { BillingReturn } from "./components/BillingReturn";
import { ConfirmSignIn } from "./components/ConfirmSignIn";
import { EquipmentList } from "./components/EquipmentList";
import { startAvatarSync } from "./lib/avatar";
import { AvatarDialog } from "./components/AvatarDialog";
import { AvatarMenu } from "./components/AvatarMenu";
import { SettingsMenu } from "./components/SettingsMenu";
import { LogoMark } from "./components/Logo";
import { ModeRail } from "./components/ModeRail";
import { PlaygroundsDialog } from "./components/PlaygroundsDialog";
import { PlaygroundBreadcrumb } from "./components/PlaygroundSwitcher";
import { RenameDialog } from "./components/RenameDialog";
import { SaveStatus } from "./components/SaveStatus";
import { SearchPanel } from "./components/SearchPanel";
import { tourSeen, useUi } from "./store/ui";
import { ObjectMenu } from "./components/ObjectMenu";
import { ActionToast } from "./components/ActionToast";
import { BackToCenter } from "./components/BackToCenter";
import { TooltipLayer } from "./components/Tooltip";
import { OnboardingTour } from "./components/OnboardingTour";
import { ShareDialog } from "./components/ShareDialog";
import { Toolbar } from "./components/Toolbar";
import { UpgradeDialog } from "./components/UpgradeDialog";
import { BETA, FEEDBACK_URL } from "./lib/beta";
import { useAuth } from "./store/auth";
import { startCloudSync, useCloud } from "./store/cloud";
import { restorePlayground, startLocalAutosave, usePlayground } from "./store/playground";

const OTP_TYPES: EmailOtpType[] = ["email", "magiclink", "signup", "recovery", "invite", "email_change"];

/** Reads `?token_hash=&type=` from the URL after an emailed sign-in link. Pure, so StrictMode can call it twice. */
function readEmailLinkParams(): { tokenHash: string; type: EmailOtpType } | null {
  const params = new URLSearchParams(window.location.search);
  const tokenHash = params.get("token_hash");
  const type = params.get("type") as EmailOtpType | null;
  return tokenHash && type && OTP_TYPES.includes(type) ? { tokenHash, type } : null;
}

/** Stripe sends people back to `/?billing=success` (or `canceled`). */
function readBillingReturn(): "success" | "canceled" | null {
  const v = new URLSearchParams(window.location.search).get("billing");
  return v === "success" || v === "canceled" ? v : null;
}

/** Removes the sign-in params so a reload or shared URL doesn't carry the token. */
function stripEmailLinkParams() {
  const params = new URLSearchParams(window.location.search);
  params.delete("token_hash");
  params.delete("type");
  params.delete("billing");
  const qs = params.toString();
  window.history.replaceState(null, "", window.location.pathname + (qs ? `?${qs}` : ""));
}

type Dialog = "account" | "rename" | "share" | "playgrounds" | "avatar" | null;

/** Opens `?p=<slug>` as a fork, then strips the param so a reload keeps the viewer's edits. */
async function openSharedFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const slug = params.get("p");
  if (!slug || !useAuth.getState().cloudEnabled) return;

  const { items } = usePlayground.getState();
  const { cloudId } = useCloud.getState();
  const replaces = items.length > 0 && !cloudId;
  if (replaces && !window.confirm("Open this shared playground? It will replace the board on your canvas.")) return;

  params.delete("p");
  const qs = params.toString();
  window.history.replaceState(null, "", window.location.pathname + (qs ? `?${qs}` : ""));

  try {
    if (!(await useCloud.getState().openShared(slug))) window.alert("That shared playground wasn't found or is no longer shared.");
  } catch {
    window.alert("Could not open that shared playground.");
  }
}

export function App() {
  const init = useAuth((s) => s.init);
  const user = useAuth((s) => s.user);
  const cloudEnabled = useAuth((s) => s.cloudEnabled);
  const searchOpen = useUi((u) => u.searchOpen);
  const replacing = useUi((u) => u.replacing);
  const editing = useUi((u) => u.editing);
  const setSearchOpen = useUi((u) => u.setSearchOpen);
  const listMode = useUi((u) => u.mode === "list");
  const [dialog, setDialog] = useState<Dialog>(null);
  const close = () => setDialog(null);
  const [emailLink] = useState(readEmailLinkParams);
  const [confirming, setConfirming] = useState(!!emailLink);
  const [billingReturn, setBillingReturn] = useState(readBillingReturn);

  // First visit on this device: once nothing else is asking for attention, show the tour after the UI settles.
  const startTour = useUi((u) => u.startTour);
  const upgradeOpen = useUi((u) => u.upgrade !== null);
  const busy = confirming || !!billingReturn || dialog !== null || upgradeOpen;
  useEffect(() => {
    if (busy || tourSeen()) return;
    const t = setTimeout(startTour, 800);
    return () => clearTimeout(t);
  }, [busy, startTour]);

  useEffect(init, [init]);
  useEffect(stripEmailLinkParams, []);
  useEffect(() => {
    restorePlayground();
    const stopLocal = startLocalAutosave();
    const stopCloud = startCloudSync();
    const stopAvatar = startAvatarSync();
    void openSharedFromUrl();
    return () => {
      stopLocal();
      stopCloud();
      stopAvatar();
    };
  }, []);

  return (
    <div className="flex h-full flex-col">
      {/* One header for every size. On phones the side columns shrink to fit and the breadcrumb takes the middle.
          Safe-area padding keeps it clear of notches and rounded corners. */}
      <header className="box-content grid h-10 shrink-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-b border-chrome-line bg-chrome pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] pt-[env(safe-area-inset-top)] sm:grid-cols-[1fr_auto_1fr] sm:gap-4 sm:pl-[max(1rem,env(safe-area-inset-left))] sm:pr-[max(1rem,env(safe-area-inset-right))]">
        <div className="flex min-w-0 items-center gap-2">
          <h1 className="flex">
            <LogoMark />
          </h1>
          {BETA && (
            <>
              <span className="rounded-full bg-brand/10 px-2 py-0.5 text-xs font-medium text-brand max-sm:hidden">Beta</span>
              {FEEDBACK_URL && (
                <a href={FEEDBACK_URL} target="_blank" rel="noreferrer" className="truncate text-xs text-ink-muted hover:text-ink hover:underline max-sm:hidden">
                  Send Feedback
                </a>
              )}
            </>
          )}
        </div>
        <PlaygroundBreadcrumb
          className="sm:justify-self-center"
          onRename={() => setDialog("rename")}
          onAll={() => setDialog("playgrounds")}
          onSignIn={() => setDialog("account")}
        />
        <div className="flex items-center justify-end gap-2 sm:gap-3">
          <span className="max-sm:hidden">
            <SaveStatus />
          </span>
          <span data-tour="account" className="flex empty:hidden">
          {user ? (
            <AvatarMenu
              onAccount={() => setDialog("account")}
              onPlaygrounds={() => setDialog("playgrounds")}
              onChangeAvatar={() => setDialog("avatar")}
            />
          ) : (
            cloudEnabled && (
              <button
                onClick={() => setDialog("account")}
                className="btn-primary h-[26px] whitespace-nowrap rounded-[5px] px-3 text-[13px] tracking-[-0.01em] outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1"
              >
                Sign In<span className="max-sm:hidden"> to Save</span>
              </button>
            )
          )}
          </span>
          <SettingsMenu />
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col sm:flex-row">

        <main data-tour="canvas" className="relative flex-1 overflow-hidden bg-canvas">
          <Canvas />
          {/* The Equipment List covers the canvas; the canvas stays mounted so the view is kept for coming back. */}
          {listMode ? (
            <EquipmentList />
          ) : (
            <>
              <BackToCenter />
              <ObjectMenu />
            </>
          )}
          <ModeRail />

          {/* Phones have no room for the save status in the header, so it floats just below it. */}
          <div className="empty:hidden absolute right-3 top-3 z-20 rounded-control bg-surface/90 px-2 py-1 shadow-panel sm:hidden">
            <SaveStatus />
          </div>

          {/* Phones show action confirmations up top, clear of the thumb; larger screens show them above the toolbar. */}
          <ActionToast className="absolute left-1/2 top-3 -translate-x-1/2 [--enter-y:-8px] sm:hidden" />

          {!listMode && (
          <div className="absolute bottom-[calc(0.75rem+env(safe-area-inset-bottom))] left-1/2 flex max-w-[calc(100%-1rem)] -translate-x-1/2 flex-col items-center gap-2 max-sm:left-[max(0.75rem,env(safe-area-inset-left))] max-sm:right-[max(0.75rem,env(safe-area-inset-right))] max-sm:max-w-none max-sm:translate-x-0 sm:bottom-[calc(1rem+env(safe-area-inset-bottom))]">
            <ActionToast className="max-sm:hidden" />
            {searchOpen && <SearchPanel key={editing ? "edit" : replacing ? "replace" : "add"} replace={replacing} edit={editing} onClose={() => setSearchOpen(false)} />}
            <Toolbar onPlace={() => setSearchOpen(replacing || editing ? true : !searchOpen)} onShare={() => setDialog("share")} />
          </div>
          )}

        </main>
      </div>

      <OnboardingTour />
      <TooltipLayer />
      {billingReturn === "success" && <BillingReturn onDone={() => setBillingReturn(null)} />}
      <UpgradeDialog onSignIn={() => setDialog("account")} />
      {confirming && emailLink && <ConfirmSignIn tokenHash={emailLink.tokenHash} type={emailLink.type} onDone={() => setConfirming(false)} />}
      {dialog === "account" && <AccountDialog onClose={close} />}
      {dialog === "avatar" && <AvatarDialog onClose={close} />}
      {dialog === "rename" && <RenameDialog onClose={close} />}
      {dialog === "share" && <ShareDialog onClose={close} onSignIn={() => setDialog("account")} />}
      {dialog === "playgrounds" && <PlaygroundsDialog onClose={close} onSignIn={() => setDialog("account")} />}
    </div>
  );
}
