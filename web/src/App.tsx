import { withTool } from "./lib/analytics";
import { useEffect, useState } from "react";
import { trackPage } from "./lib/analytics";
import type { EmailOtpType } from "@supabase/supabase-js";
import { AccountDialog } from "./components/AccountDialog";
import { SetPasswordDialog } from "./components/SetPasswordForm";
import { BoardInfoButton, BoardPanel, useBoardPanel } from "./components/BoardPanel";
import { Canvas } from "./components/Canvas";
import { BillingReturn } from "./components/BillingReturn";
import { ConfirmSignIn } from "./components/ConfirmSignIn";
import { EquipmentList } from "./components/EquipmentList";
import { SignalPath } from "./components/SignalPath";
import { startAvatarSync } from "./lib/avatar";
import { AvatarDialog } from "./components/AvatarDialog";
import { AvatarMenu, GuestMenu } from "./components/AvatarMenu";
import { SettingsMenu } from "./components/SettingsMenu";
import { GuestButtons, SiteHeader } from "./components/SiteTabs";
import { MadeBy } from "./components/MadeBy";
import { ModeRail } from "./components/ModeRail";
import { PlaygroundsDialog } from "./components/PlaygroundsDialog";
import { BoardLabel, BuildsMenu } from "./components/PlaygroundSwitcher";
import { takeHandoff } from "./lib/handoff";
import type { Kind } from "./lib/catalog";
import { recordGearAdd } from "./lib/trending";
import { useCatalog } from "./store/catalog";
import { toast } from "./store/toast";
import { requestNewPlayground } from "./lib/newPlayground";
import { NewPlaygroundDialog } from "./components/NewPlaygroundDialog";
import { EditPlaygroundDialog } from "./components/EditPlaygroundDialog";
import type { PlaygroundSummary } from "./lib/cloud";
import { SaveStatus } from "./components/SaveStatus";
import { SelectionMiniMenu } from "./components/SelectionMiniMenu";
import { SearchPanel, showNewGear } from "./components/SearchPanel";
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
import { StandingNotice } from "./components/StandingNotice";
import { OnboardingTour } from "./components/OnboardingTour";
import { ShareDialog } from "./components/ShareDialog";
import { SpaceBetweenPanel } from "./components/SpaceBetweenPanel";
import { PlugPanel } from "./components/PlugEditor";
import { AddGearButton, CanvasStack, ObjectStack, WIDE_QUERY } from "./components/SideStacks";
import { Toolbar } from "./components/Toolbar";
import { PHONE_QUERY, useMediaQuery } from "./lib/viewport";
import { UpgradeDialog } from "./components/UpgradeDialog";
import { UsernamePrompt } from "./components/UsernamePrompt";
import { WhatsNew } from "./components/WhatsNew";
import { BETA, FEEDBACK_URL } from "./lib/beta";
import { useAuth } from "./store/auth";
import { useBilling } from "./store/billing";
import { openAfterSignIn, startCloudSync, useCloud } from "./store/cloud";
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

type Dialog = "account" | "register" | "share" | "playgrounds" | "avatar" | "edit" | null;

/** Opens `?p=<slug>` view-only. The param stays while viewing, so a reload shows it again. */
async function openSharedFromUrl() {
  const slug = new URLSearchParams(window.location.search).get("p");
  try {
    if (!slug || !useAuth.getState().cloudEnabled) return;
    if (!(await useCloud.getState().openShared(slug))) window.alert("That shared playground wasn't found or is no longer shared.");
    // An Explore card's Comments button: open the board panel at its comments.
    else if (window.location.hash === "#comments") useBoardPanel.getState().setOpen(true);
  } catch {
    window.alert("Could not open that shared playground.");
  } finally {
    useUi.setState({ openingShared: false });
  }
}

const headerButton =
  "btn-primary h-[26px] whitespace-nowrap rounded-control px-3 text-[13px] tracking-[-0.01em] outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1";

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
  const plugEditing = useUi((u) => u.plugEditing);
  const replacing = useUi((u) => u.replacing);
  const editing = useUi((u) => u.editing);
  const setSearchOpen = useUi((u) => u.setSearchOpen);
  const hasSelection = usePlayground((s) => s.selected.length > 0);
  const openingShared = useUi((u) => u.openingShared);
  /** Someone else's board, or one loading from a link: your own board's tools stay hidden. */
  const viewing = useUi((u) => !!u.viewing) || openingShared;
  /** Larger screens get side stacks and a lone Add Gear button; smaller ones keep the bars. */
  const wide = useMediaQuery(WIDE_QUERY);
  const phoneSized = useMediaQuery(PHONE_QUERY);
  const mode = useUi((u) => (SHOW_MODES ? u.mode : "playground"));
  /** The Equipment List and Signal Path cover the canvas and hide its tools. */
  const covered = mode !== "playground";
  // One page view per screen: your playground, a shared board (once it has loaded), or another mode.
  const sharedOpen = useUi((u) => !!u.viewing);
  useEffect(() => {
    if (openingShared) return;
    trackPage(sharedOpen ? "Shared Board" : mode === "signal" ? "Signal Path" : mode === "list" ? "Equipment List" : "Playground");
  }, [openingShared, sharedOpen, mode]);
  const [dialog, setDialog] = useState<Dialog>(null);
  const close = () => setDialog(null);
  /** Edit Playground: the open playground, or another saved one picked from the menu. */
  const [editingPlayground, setEditingPlayground] = useState<PlaygroundSummary | undefined>();
  const editPlayground = (target?: PlaygroundSummary) => {
    setEditingPlayground(target);
    setDialog("edit");
  };
  const [emailLink] = useState(readEmailLinkParams);
  const [confirming, setConfirming] = useState(!!emailLink);
  const [billingReturn, setBillingReturn] = useState(readBillingReturn);

  // First visit on this device: once nothing else is asking for attention, show the tour after the UI settles.
  const startTour = useUi((u) => u.startTour);
  const upgradeOpen = useUi((u) => u.upgrade !== null);
  const newPlaygroundOpen = useUi((u) => u.newPlaygroundOpen);
  // A shared playground opened from a link isn't the place for the tour (it would add a demo pedal to it).
  const recovering = useAuth((s) => s.recovering);
  const busy = confirming || recovering || !!billingReturn || dialog !== null || upgradeOpen || newPlaygroundOpen || viewing;
  useEffect(() => {
    if (busy || tourSeen()) return;
    const t = setTimeout(startTour, 800);
    return () => clearTimeout(t);
  }, [busy, startTour]);

  useEffect(init, [init]);
  useEffect(stripEmailLinkParams, []);
  // Picks from the My Playgrounds menu on another page (the gallery); see lib/handoff.
  const [handoff, setHandoff] = useState(() => {
    const h = takeHandoff();
    if (h?.kind === "open") openAfterSignIn(h.id);
    return h?.kind === "open" ? null : h;
  });
  const authReady = useAuth((s) => s.ready);
  const cloudList = useCloud((c) => c.list);
  const manifest = useCatalog((c) => c.manifest);
  const billingKnown = useBilling((b) => !b.billingEnabled || !!b.entitlements);
  useEffect(() => {
    if (!handoff || !authReady) return;
    if (handoff.kind === "new") {
      // Wait for the plan so the limit check is right.
      if (user && !billingKnown) return;
      requestNewPlayground();
    } else if (handoff.kind === "playgrounds") {
      setDialog("playgrounds");
    } else if (handoff.kind === "add") {
      // Waits for the catalog, then drops the item onto the open board.
      if (!manifest) return;
      const [kind, key] = handoff.id.split(":") as [Kind, string];
      const item = (kind === "pedalboard" ? manifest.pedalboards : manifest.pedals).find((c) => c.image === key);
      if (item) {
        usePlayground.getState().addCatalogItem(kind, item);
        recordGearAdd(kind, item.image, "gear_page");
        toast(`Added ${item.brand} ${item.name}`);
      }
    } else if (handoff.kind === "edit") {
      const target = cloudList.find((p) => p.id === handoff.id);
      if (!target) return; // the list is still loading
      editPlayground(target);
    }
    setHandoff(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handoff, authReady, user, billingKnown, cloudList, manifest]);

  useEffect(() => {
    restorePlayground();
    const stopLocal = startLocalAutosave();
    const stopCloud = startCloudSync();
    const stopAvatar = startAvatarSync();
    void openSharedFromUrl();
    // The gallery's What's New sends "new pedals" here, to open Add Gear at its New list.
    if (window.location.hash === "#new-gear") {
      history.replaceState(null, "", window.location.pathname + window.location.search);
      showNewGear();
    }
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
      <SiteHeader
        current={viewing ? null : "build"}
        builds={<BuildsMenu onEdit={editPlayground} onSignIn={() => setDialog("account")} onPlaygrounds={() => setDialog("playgrounds")} />}
        updates={<WhatsNew onNewGear={showNewGear} />}
        brandExtra={pro && <span className="text-sm/4 font-semibold text-brand max-sm:hidden">Pro</span>}
        nav={
          <>
            {BETA && (
            <>
              <span className="rounded-full bg-brand/10 px-2 py-0.5 text-xs font-medium text-brand max-lg:hidden">Beta</span>
              {FEEDBACK_URL && (
                <a href={FEEDBACK_URL} target="_blank" rel="noreferrer" className="truncate text-xs text-ink-muted hover:text-ink hover:underline max-xl:hidden">
                  Send Feedback
                </a>
              )}
            </>
            )}
          </>
        }
        navEnd={
          <>
            <span className="max-sm:hidden">
              <SaveStatus />
            </span>
          </>
        }
        account={
          user ? (
            <>
              {canUpgrade && (
                <button onClick={() => openUpgrade("menu")} data-tour="pro" className={`${headerButton} mr-2 max-sm:hidden`}>
                  Get Pro
                </button>
              )}
              <AvatarMenu onAccount={() => setDialog("account")} onChangeAvatar={() => setDialog("avatar")} />
            </>
          ) : (
            <>
              {cloudEnabled && <GuestButtons onRegister={() => setDialog("register")} onSignIn={() => setDialog("account")} />}
              <GuestMenu onSignIn={() => setDialog("account")} />
            </>
          )
        }
      />

      <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
        {/* Its own column left of the canvas on larger screens (a sheet on phones), so it never covers the board. */}
        {!covered && <BoardPanel onSignIn={() => setDialog("account")} onEdit={() => editPlayground()} />}

        <main data-tour="canvas" className="relative flex-1 overflow-clip bg-canvas">
          {/* Hidden while a shared link loads, so your own board doesn't flash before it. */}
          <div className={`absolute inset-0 ${openingShared ? "invisible" : ""}`}>
            <Canvas />
          </div>
          {openingShared && <p className="absolute inset-0 grid place-items-center text-sm text-ink-muted">Opening board…</p>}
          {!covered && (
            <BoardLabel onEdit={() => editPlayground()} onSignIn={() => setDialog("account")} comments={<BoardInfoButton />} />
          )}
          {/* The other modes cover the canvas; the canvas stays mounted so the view is kept for coming back. */}
          {mode === "list" ? (
            <EquipmentList />
          ) : mode === "signal" ? (
            <SignalPath />
          ) : (
            <>
              {!openingShared && (
                <>
                  <BackToCenter />
                  <EmptyAddGear />
                </>
              )}
              {/* Phones keep it above the toolbar instead, since the toolbar spans the bottom edge there. */}
              <MadeBy className="absolute bottom-[calc(1rem+5px+env(safe-area-inset-bottom))] left-[max(1rem,env(safe-area-inset-left))] z-10 max-md:hidden" />
              {/* Paired with the Settings cog in the lower-right corner. */}
              <ScaleKey end className="absolute bottom-[calc(1rem+5px+env(safe-area-inset-bottom))] right-[calc(max(1rem,env(safe-area-inset-right))+40px)] z-10 max-md:hidden" />
              {wide ? (
                <>
                  {!plugEditing && <ObjectStack />}
                  <CanvasStack viewOnly={viewing} onShare={() => setDialog("share")} />
                </>
              ) : (
                // Tablets keep the full bar; phones (and larger screens) use the little menu under the selection.
                !phoneSized && !plugEditing && <ObjectMenu />
              )}
              {/* While plugs are being edited, their panel takes the menus' place. */}
              {plugEditing ? <PlugPanel /> : <SelectionMiniMenu />}
              <ContextMenu />
            </>
          )}
          {SHOW_MODES && <ModeRail />}

          {/* Phones have no room for the save status in the header, so it floats just below it. */}
          <div className="empty:hidden absolute right-3 top-3 z-20 rounded-control bg-surface/90 px-2 py-1 shadow-float sm:hidden">
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
              !viewing && <AddGearButton onClick={withTool("add_gear", "toolbar", () => setSearchOpen(replacing || editing ? true : !searchOpen))} />
            ) : (
              <Toolbar viewOnly={viewing} onPlace={() => setSearchOpen(replacing || editing ? true : !searchOpen)} onShare={() => setDialog("share")} />
            )}
          </div>
          )}

          {/* Docked on the left on larger screens; phones open it as a bottom drawer (it portals itself there). */}
          {!covered && searchOpen && (
            <SearchPanel key={editing ? "edit" : replacing ? "replace" : "add"} replace={replacing} edit={editing} onClose={() => setSearchOpen(false)} onSignIn={() => setDialog("account")} />
          )}

          {/* Docked on the left on larger screens; a bottom drawer on phones. */}
          {!covered && !viewing && spacingOpen && <SpaceBetweenPanel />}


          {/* Lower-right corner. Phones have it in the bottom bar instead. */}
          <SettingsMenu className={`absolute bottom-[calc(1rem+env(safe-area-inset-bottom))] right-[max(1rem,env(safe-area-inset-right))] z-10 max-sm:hidden`} />

        </main>

      </div>

      <LegalDialog />
      {/* A flag an editor put on this account, shown once (also on the gallery and editor). */}
      <StandingNotice />
      <ConsentBanner />
      <OnboardingTour />
      <TooltipLayer />
      {billingReturn === "success" && <BillingReturn onDone={() => setBillingReturn(null)} />}
      <UpgradeDialog onSignIn={() => setDialog("account")} />
      {/* Not over other dialogs or the sign-in confirmation. */}
      {!busy && <UsernamePrompt />}
      {confirming && emailLink && <ConfirmSignIn tokenHash={emailLink.tokenHash} type={emailLink.type} onDone={() => setConfirming(false)} />}
      {dialog === "account" && <AccountDialog onClose={close} />}
      {!dialog && <SetPasswordDialog />}
      {dialog === "register" && <AccountDialog onClose={close} initialTab="create" />}
      {dialog === "avatar" && <AvatarDialog onClose={close} />}
      {newPlaygroundOpen && <NewPlaygroundDialog />}
      {dialog === "edit" && <EditPlaygroundDialog onClose={close} target={editingPlayground} />}
      {dialog === "share" && <ShareDialog onClose={close} onSignIn={() => setDialog("account")} />}
      {dialog === "playgrounds" && <PlaygroundsDialog onClose={close} onSignIn={() => setDialog("account")} />}
    </div>
  );
}
