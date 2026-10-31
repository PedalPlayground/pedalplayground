import { LogIn } from "lucide-react";
import { useEffect, useState } from "react";
import type { EmailOtpType } from "@supabase/supabase-js";
import { AccountDialog } from "./components/AccountDialog";
import { BoardInfoButton, BoardPanel, useBoardPanel } from "./components/BoardPanel";
import { Canvas } from "./components/Canvas";
import { BillingReturn } from "./components/BillingReturn";
import { ConfirmSignIn } from "./components/ConfirmSignIn";
import { EquipmentList } from "./components/EquipmentList";
import { SignalPath } from "./components/SignalPath";
import { startAvatarSync } from "./lib/avatar";
import { AvatarDialog } from "./components/AvatarDialog";
import { AvatarMenu } from "./components/AvatarMenu";
import { SettingsMenu } from "./components/SettingsMenu";
import { LogoMark } from "./components/Logo";
import { MadeBy } from "./components/MadeBy";
import { ModeRail } from "./components/ModeRail";
import { PlaygroundsDialog } from "./components/PlaygroundsDialog";
import { PlaygroundBreadcrumb } from "./components/PlaygroundSwitcher";
import { NewPlaygroundDialog } from "./components/NewPlaygroundDialog";
import type { PlaygroundSummary } from "./lib/cloud";
import { SaveStatus } from "./components/SaveStatus";
import { SelectionMiniMenu } from "./components/SelectionMiniMenu";
import { SearchPanel } from "./components/SearchPanel";
import { SHOW_MODES, tourSeen, useUi } from "./store/ui";
import { ObjectMenu } from "./components/ObjectMenu";
import { ContextMenu } from "./components/ContextMenu";
import { ActionToast } from "./components/ActionToast";
import { BackToCenter } from "./components/BackToCenter";
import { EmptyAddGear } from "./components/EmptyAddGear";
import { ScaleKey } from "./components/ScaleKey";
import { TooltipLayer } from "./components/Tooltip";
import { ConsentBanner } from "./components/ConsentBanner";
import { LegalDialog } from "./components/LegalDialog";
import { OnboardingTour } from "./components/OnboardingTour";
import { ShareDialog } from "./components/ShareDialog";
import { SpaceBetweenPanel } from "./components/SpaceBetweenPanel";
import { AddGearButton, CanvasStack, ObjectStack, WIDE_QUERY } from "./components/SideStacks";
import { Toolbar } from "./components/Toolbar";
import { PHONE_QUERY, useMediaQuery } from "./lib/viewport";
import { UpgradeDialog } from "./components/UpgradeDialog";
import { UsernamePrompt } from "./components/UsernamePrompt";
import { WhatsNew } from "./components/WhatsNew";
import { BETA, FEEDBACK_URL } from "./lib/beta";
import { useAuth } from "./store/auth";
import { useBilling } from "./store/billing";
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

type Dialog = "account" | "share" | "playgrounds" | "avatar" | null;

/** Opens `?p=<slug>` view-only. The param stays while viewing, so a reload shows it again. */
async function openSharedFromUrl() {
  const slug = new URLSearchParams(window.location.search).get("p");
  if (!slug || !useAuth.getState().cloudEnabled) return;
  try {
    if (!(await useCloud.getState().openShared(slug))) window.alert("That shared playground wasn't found or is no longer shared.");
  } catch {
    window.alert("Could not open that shared playground.");
  }
}

const headerButton =
  "btn-primary h-[26px] whitespace-nowrap rounded-[5px] px-3 text-[13px] tracking-[-0.01em] outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1";

/** A quieter header button (Sign In): shaded, with an icon. */
const headerSecondaryButton =
  "press flex h-[26px] items-center gap-1.5 whitespace-nowrap rounded-[5px] bg-[rgb(202_203_226/0.39)] px-2.5 text-[13px] font-semibold tracking-[-0.01em] text-ink outline-none hover:bg-[rgb(202_203_226/0.6)] active:bg-[rgb(202_203_226/0.8)] focus-visible:ring-2 focus-visible:ring-brand";

export function App() {
  const init = useAuth((s) => s.init);
  const user = useAuth((s) => s.user);
  const cloudEnabled = useAuth((s) => s.cloudEnabled);
  const plan = useBilling((b) => (b.billingEnabled ? b.entitlements?.plan : undefined));
  const pro = !!user && plan === "pro";
  /** Only once the plan is known to be free, so Pro members never see it flash in. */
  const canUpgrade = plan === "free";
  const openUpgrade = useUi((u) => u.openUpgrade);
  const searchOpen = useUi((u) => u.searchOpen);
  const spacingOpen = useUi((u) => u.spacingOpen);
  const replacing = useUi((u) => u.replacing);
  const editing = useUi((u) => u.editing);
  const setSearchOpen = useUi((u) => u.setSearchOpen);
  const hasSelection = usePlayground((s) => s.selected.length > 0);
  const viewing = useUi((u) => !!u.viewing);
  /** Larger screens get side stacks and a lone Add Gear button; smaller ones keep the bars. */
  const wide = useMediaQuery(WIDE_QUERY);
  const phoneSized = useMediaQuery(PHONE_QUERY);
  const mode = useUi((u) => (SHOW_MODES ? u.mode : "playground"));
  /** The Equipment List and Signal Path cover the canvas and hide its tools. */
  const covered = mode !== "playground";
  const [dialog, setDialog] = useState<Dialog>(null);
  const close = () => setDialog(null);
  /** Edit Playground (from the menu) opens the board panel's Details; another saved playground opens first. */
  const editPlayground = async (target?: PlaygroundSummary) => {
    if (target && target.id !== useCloud.getState().cloudId) await useCloud.getState().openPlayground(target.id);
    useBoardPanel.getState().openTo("details");
  };
  const [emailLink] = useState(readEmailLinkParams);
  const [confirming, setConfirming] = useState(!!emailLink);
  const [billingReturn, setBillingReturn] = useState(readBillingReturn);

  // First visit on this device: once nothing else is asking for attention, show the tour after the UI settles.
  const startTour = useUi((u) => u.startTour);
  const upgradeOpen = useUi((u) => u.upgrade !== null);
  const newPlaygroundOpen = useUi((u) => u.newPlaygroundOpen);
  // A shared playground opened from a link isn't the place for the tour (it would add a demo pedal to it).
  const busy = confirming || !!billingReturn || dialog !== null || upgradeOpen || newPlaygroundOpen || viewing;
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
      {/* Works around iOS 27 blurring the top edge of home-screen web apps; see .pwa-top-strip in index.css. */}
      <div aria-hidden className="pwa-top-strip" />
      {/* One header for every size. On phones the side columns shrink to fit and the breadcrumb takes the middle.
          Safe-area padding keeps it clear of notches and rounded corners. */}
      <header className="box-content grid h-10 shrink-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-b border-chrome-line bg-chrome pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] pt-[max(env(safe-area-inset-top),var(--pwa-strip))] sm:grid-cols-[1fr_auto_1fr] sm:gap-4 sm:pl-[max(1rem,env(safe-area-inset-left))] sm:pr-[max(1rem,env(safe-area-inset-right))]">
        <div className="flex min-w-0 items-center gap-2">
          <h1 className="group flex items-center gap-2 text-sm/4 font-semibold tracking-[-0.01em] text-ink">
            <LogoMark />
            <span className="whitespace-nowrap max-sm:hidden">
              Pedal Playground
              {/* A little hello on hover. */}
              <span aria-hidden className="hidden text-brand-top group-hover:inline"> appreciates you</span>
            </span>
            {pro && <span className="text-brand-top group-hover:hidden max-sm:hidden">Pro</span>}
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
        <div className="flex min-w-0 items-center gap-1 sm:justify-self-center">
          <PlaygroundBreadcrumb
            className="min-w-0"
            onEdit={(target) => void editPlayground(target)}
            onSignIn={() => setDialog("account")}
          />
          <BoardInfoButton />
        </div>
        <div className="flex items-center justify-end gap-2 sm:gap-3">
          <span className="max-sm:hidden">
            <SaveStatus />
          </span>
          <WhatsNew />
          <span data-tour="account" className="flex items-center gap-4 empty:hidden max-sm:gap-2">
          {user && canUpgrade && (
            <button onClick={() => openUpgrade("menu")} data-tour="pro" className={headerButton}>
              Get Pro
            </button>
          )}
          {user ? (
            <AvatarMenu
              onAccount={() => setDialog("account")}
              onPlaygrounds={() => setDialog("playgrounds")}
              onChangeAvatar={() => setDialog("avatar")}
            />
          ) : (
            cloudEnabled && (
              // Phones sign in from the playground menu ("Sign In to Save"), so the header leaves it out.
              <button onClick={() => setDialog("account")} className={`${headerSecondaryButton} max-sm:hidden`}>
                <LogIn size={14} strokeWidth={2.25} />
                Sign In
              </button>
            )
          )}
          </span>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col sm:flex-row">

        <main data-tour="canvas" className="relative flex-1 overflow-clip bg-canvas">
          <Canvas />
          {/* The other modes cover the canvas; the canvas stays mounted so the view is kept for coming back. */}
          {mode === "list" ? (
            <EquipmentList />
          ) : mode === "signal" ? (
            <SignalPath />
          ) : (
            <>
              <BackToCenter />
              <EmptyAddGear />
              {/* Phones keep it above the toolbar instead, since the toolbar spans the bottom edge there. */}
              <MadeBy className="absolute bottom-[calc(1rem+5px+env(safe-area-inset-bottom))] left-[max(1rem,env(safe-area-inset-left))] z-10 max-md:hidden" />
              {/* Paired with the Settings cog in the lower-right corner. */}
              <ScaleKey end className="absolute bottom-[calc(1rem+5px+env(safe-area-inset-bottom))] right-[calc(max(1rem,env(safe-area-inset-right))+40px)] z-10 max-md:hidden" />
              {wide ? (
                <>
                  <ObjectStack />
                  <CanvasStack viewOnly={viewing} onShare={() => setDialog("share")} />
                </>
              ) : (
                // Tablets keep the full bar; phones (and larger screens) use the little menu under the selection.
                !phoneSized && <ObjectMenu />
              )}
              <SelectionMiniMenu />
              <ContextMenu />
            </>
          )}
          {SHOW_MODES && <ModeRail />}

          {/* Phones have no room for the save status in the header, so it floats just below it. */}
          <div className="empty:hidden absolute right-3 top-3 z-20 rounded-control bg-surface/90 px-2 py-1 shadow-panel sm:hidden">
            <SaveStatus />
          </div>

          {/* Action confirmations pop up at the top center. On tablets they drop below the selection bar when it's showing. */}
          <ActionToast className={`absolute left-1/2 -translate-x-1/2 [--enter-y:-8px] ${hasSelection && !wide ? "top-3 sm:top-16" : "top-3"}`} />


          {!covered && (
          <div
            // Stays put when the gear panel opens; the panel sits above it where the two meet on narrower screens.
            className="absolute bottom-[calc(0.75rem+env(safe-area-inset-bottom))] left-1/2 z-30 flex max-w-[calc(100%-1rem)] -translate-x-1/2 flex-col items-center gap-2 max-sm:left-[max(0.75rem,env(safe-area-inset-left))] max-sm:right-[max(0.75rem,env(safe-area-inset-right))] max-sm:max-w-none max-sm:translate-x-0 sm:bottom-[calc(1rem+env(safe-area-inset-bottom))]">
            {!searchOpen && <ScaleKey className="self-start md:hidden" />}
            {wide ? (
              !viewing && <AddGearButton onClick={() => setSearchOpen(replacing || editing ? true : !searchOpen)} />
            ) : (
              <Toolbar viewOnly={viewing} onPlace={() => setSearchOpen(replacing || editing ? true : !searchOpen)} onShare={() => setDialog("share")} />
            )}
          </div>
          )}

          {/* Docked on the left on larger screens; phones open it as a bottom drawer (it portals itself there). */}
          {!covered && searchOpen && (
            <SearchPanel key={editing ? "edit" : replacing ? "replace" : "add"} replace={replacing} edit={editing} onClose={() => setSearchOpen(false)} />
          )}

          {wide && !covered && !viewing && spacingOpen && <SpaceBetweenPanel />}


          {/* Lower-right corner. Phones have it in the bottom bar instead. */}
          <SettingsMenu className={`absolute bottom-[calc(1rem+env(safe-area-inset-bottom))] right-[max(1rem,env(safe-area-inset-right))] z-10 max-sm:hidden`} />

        </main>

        {/* Its own column beside the canvas on larger screens (a sheet on phones), so it never covers the board. */}
        {!covered && <BoardPanel onSignIn={() => setDialog("account")} />}
      </div>

      <LegalDialog />
      <ConsentBanner />
      <OnboardingTour />
      <TooltipLayer />
      {billingReturn === "success" && <BillingReturn onDone={() => setBillingReturn(null)} />}
      <UpgradeDialog onSignIn={() => setDialog("account")} />
      {/* Not over other dialogs or the sign-in confirmation. */}
      {!busy && <UsernamePrompt />}
      {confirming && emailLink && <ConfirmSignIn tokenHash={emailLink.tokenHash} type={emailLink.type} onDone={() => setConfirming(false)} />}
      {dialog === "account" && <AccountDialog onClose={close} />}
      {dialog === "avatar" && <AvatarDialog onClose={close} />}
      {newPlaygroundOpen && <NewPlaygroundDialog />}
      {dialog === "share" && <ShareDialog onClose={close} onSignIn={() => setDialog("account")} />}
      {dialog === "playgrounds" && <PlaygroundsDialog onClose={close} onSignIn={() => setDialog("account")} />}
    </div>
  );
}
