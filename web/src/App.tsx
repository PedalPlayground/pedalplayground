import { ChevronsUpDown, Plus, Share2 } from "lucide-react";
import { useEffect, useState } from "react";
import { AccountDialog } from "./components/AccountDialog";
import { HeaderMenu } from "./components/HeaderMenu";
import { ModeRail } from "./components/ModeRail";
import { SearchPanel } from "./components/SearchPanel";
import { Toolbar } from "./components/Toolbar";
import { Canvas } from "./components/Canvas";
import { SelectionBar } from "./components/SelectionBar";
import { useAuth } from "./store/auth";
import { restorePlayground, startLocalAutosave, usePlayground } from "./store/playground";

export function App() {
  const init = useAuth((s) => s.init);
  const [searchOpen, setSearchOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);

  useEffect(init, [init]);
  useEffect(() => {
    restorePlayground();
    return startLocalAutosave();
  }, []);
  const name = usePlayground((s) => s.name);

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-11 shrink-0 items-center justify-between border-b border-line bg-surface px-4">
        <h1 className="text-sm tracking-tight">
          <b className="font-bold">PEDAL</b>PLAYGROUND
        </h1>
        <HeaderMenu onAccount={() => setAccountOpen(true)} />
      </header>

      <div className="flex min-h-0 flex-1">
        <ModeRail />

        <main className="relative flex-1 overflow-hidden bg-canvas">
          <Canvas />
          <SelectionBar />

          <div className="absolute left-4 top-4 flex max-w-[calc(100%-2rem)] items-center gap-1 rounded-panel bg-surface p-1.5 shadow-panel lg:bottom-4 lg:top-auto">
            <button className="flex h-9 items-center gap-2 rounded-control px-3 text-sm hover:bg-surface-hover">
              <span className="size-5 rounded bg-canvas ring-1 ring-line" />
              {name}
              <ChevronsUpDown size={14} className="text-ink-muted" />
            </button>
            <button aria-label="New playground" className="grid size-9 place-items-center rounded-control text-ink-muted hover:bg-surface-hover">
              <Plus size={16} />
            </button>
          </div>

          <div className="absolute bottom-4 left-1/2 flex max-w-[calc(100%-1rem)] -translate-x-1/2 flex-col items-center gap-2">
            {searchOpen && <SearchPanel onClose={() => setSearchOpen(false)} />}
            <Toolbar onPlace={() => setSearchOpen((o) => !o)} />
          </div>

          <button className="absolute right-4 top-4 flex h-9 items-center gap-2 rounded-control bg-brand px-4 text-sm font-medium text-brand-ink shadow-panel hover:bg-brand-hover sm:bottom-4 sm:top-auto">
            <Share2 size={16} />
            Share
          </button>
        </main>
      </div>

      {accountOpen && <AccountDialog onClose={() => setAccountOpen(false)} />}
    </div>
  );
}
