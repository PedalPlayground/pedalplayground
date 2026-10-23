import { Share2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { EmailOtpType } from "@supabase/supabase-js";
import { AccountDialog } from "./components/AccountDialog";
import { Canvas } from "./components/Canvas";
import { BillingReturn } from "./components/BillingReturn";
import { ConfirmSignIn } from "./components/ConfirmSignIn";
import { HeaderMenu } from "./components/HeaderMenu";
import { ModeRail } from "./components/ModeRail";
import { PlaygroundsDialog } from "./components/PlaygroundsDialog";
import { PlaygroundSwitcher } from "./components/PlaygroundSwitcher";
import { RenameDialog } from "./components/RenameDialog";
import { SaveStatus } from "./components/SaveStatus";
import { SearchPanel } from "./components/SearchPanel";
import { SelectionBar } from "./components/SelectionBar";
import { ShareDialog } from "./components/ShareDialog";
import { Toolbar } from "./components/Toolbar";
import { UpgradeDialog } from "./components/UpgradeDialog";
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

type Dialog = "account" | "rename" | "share" | "playgrounds" | null;

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
  const [searchOpen, setSearchOpen] = useState(false);
  const [dialog, setDialog] = useState<Dialog>(null);
  const close = () => setDialog(null);
  const [emailLink] = useState(readEmailLinkParams);
  const [confirming, setConfirming] = useState(!!emailLink);
  const [billingReturn, setBillingReturn] = useState(readBillingReturn);

  useEffect(init, [init]);
  useEffect(stripEmailLinkParams, []);
  useEffect(() => {
    restorePlayground();
    const stopLocal = startLocalAutosave();
    const stopCloud = startCloudSync();
    void openSharedFromUrl();
    return () => {
      stopLocal();
      stopCloud();
    };
  }, []);

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-11 shrink-0 items-center justify-between border-b border-line bg-surface px-4">
        <h1 className="text-sm tracking-tight">
          <b className="font-bold">PEDAL</b>PLAYGROUND
        </h1>
        <div className="flex items-center gap-3">
          <SaveStatus />
          <HeaderMenu onAccount={() => setDialog("account")} onPlaygrounds={() => setDialog("playgrounds")} />
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <ModeRail />

        <main className="relative flex-1 overflow-hidden bg-canvas">
          <Canvas />
          <SelectionBar />

          <PlaygroundSwitcher
            onRename={() => setDialog("rename")}
            onAll={() => setDialog("playgrounds")}
            onSignIn={() => setDialog("account")}
          />

          <div className="absolute bottom-4 left-1/2 flex max-w-[calc(100%-1rem)] -translate-x-1/2 flex-col items-center gap-2">
            {searchOpen && <SearchPanel onClose={() => setSearchOpen(false)} />}
            <Toolbar onPlace={() => setSearchOpen((o) => !o)} />
          </div>

          <button
            onClick={() => setDialog("share")}
            className="absolute right-4 top-4 flex h-9 items-center gap-2 rounded-control bg-brand px-4 text-sm font-medium text-brand-ink shadow-panel hover:bg-brand-hover sm:bottom-4 sm:top-auto"
          >
            <Share2 size={16} />
            Share
          </button>
        </main>
      </div>

      {billingReturn === "success" && <BillingReturn onDone={() => setBillingReturn(null)} />}
      <UpgradeDialog onSignIn={() => setDialog("account")} />
      {confirming && emailLink && <ConfirmSignIn tokenHash={emailLink.tokenHash} type={emailLink.type} onDone={() => setConfirming(false)} />}
      {dialog === "account" && <AccountDialog onClose={close} />}
      {dialog === "rename" && <RenameDialog onClose={close} />}
      {dialog === "share" && <ShareDialog onClose={close} onSignIn={() => setDialog("account")} />}
      {dialog === "playgrounds" && <PlaygroundsDialog onClose={close} onSignIn={() => setDialog("account")} />}
    </div>
  );
}
