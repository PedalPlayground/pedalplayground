import { Share2 } from "lucide-react";
import { useEffect, useState } from "react";
import { AccountDialog } from "./components/AccountDialog";
import { Canvas } from "./components/Canvas";
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
import { useAuth } from "./store/auth";
import { startCloudSync, useCloud } from "./store/cloud";
import { restorePlayground, startLocalAutosave, usePlayground } from "./store/playground";

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

  useEffect(init, [init]);
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

      {dialog === "account" && <AccountDialog onClose={close} />}
      {dialog === "rename" && <RenameDialog onClose={close} />}
      {dialog === "share" && <ShareDialog onClose={close} onSignIn={() => setDialog("account")} />}
      {dialog === "playgrounds" && <PlaygroundsDialog onClose={close} onSignIn={() => setDialog("account")} />}
    </div>
  );
}
