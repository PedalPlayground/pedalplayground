import { ArrowLeft, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { canSearchAvatars, chooseAvatar } from "../lib/avatar";
import { usableFeaturedPedals } from "../lib/featuredPedals";
import { imageKey } from "../lib/catalog";
import { useBilling } from "../store/billing";
import { useCatalog } from "../store/catalog";
import { useUi } from "../store/ui";
import { Modal } from "./Modal";
import { PedalAvatar } from "./PedalAvatar";

export function AvatarDialog({ onClose }: { onClose: () => void }) {
  const manifest = useCatalog((s) => s.manifest);
  const avatar = useUi((u) => u.avatar);
  const openUpgrade = useUi((u) => u.openUpgrade);
  const { billingEnabled, entitlements } = useBilling();
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    void useCatalog.getState().load();
  }, []);

  const keys = useMemo(() => (manifest ? usableFeaturedPedals(manifest) : []), [manifest]);
  const allowed = canSearchAvatars(billingEnabled, entitlements);

  const results = useMemo(() => {
    if (!manifest) return [];
    const q = query.trim().toLowerCase();
    const withImage = manifest.pedals.filter((p) => manifest.assets.pedals[imageKey(p.image)]);
    return (q ? withImage.filter((p) => `${p.brand} ${p.name}`.toLowerCase().includes(q)) : withImage).slice(0, 40);
  }, [manifest, query]);

  const pick = (key: string) => {
    chooseAvatar(key);
    onClose();
  };

  const other = () => {
    if (allowed) return setSearching(true);
    onClose();
    openUpgrade("avatar");
  };

  if (searching) {
    return (
      <Modal title="Search for your avatar pedal" onClose={onClose}>
        <button onClick={() => setSearching(false)} className="mb-3 flex items-center gap-1 text-sm text-ink-muted hover:text-ink">
          <ArrowLeft size={14} /> Back to featured pedals
        </button>
        <div className="mb-2 flex items-center gap-2 rounded-control border border-line px-3">
          <Search size={16} className="text-ink-muted" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search pedals"
            className="h-9 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-muted"
          />
        </div>
        <ul className="max-h-72 overflow-y-auto">
          {!manifest && <li className="p-3 text-sm text-ink-muted">Loading catalog…</li>}
          {manifest && results.length === 0 && <li className="p-3 text-sm text-ink-muted">No results</li>}
          {results.map((p) => (
            <li key={p.image}>
              <button onClick={() => pick(imageKey(p.image))} className="flex w-full items-center gap-3 rounded-control p-2 text-left hover:bg-surface-hover">
                <span className="grid size-10 shrink-0 place-items-center">
                  <PedalAvatar pedalKey={imageKey(p.image)} size={40} />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{p.name}</span>
                  <span className="block truncate text-xs text-ink-muted">{p.brand}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </Modal>
    );
  }

  return (
    <Modal title="Choose your avatar" onClose={onClose}>
      {!manifest && <p className="text-sm text-ink-muted">Loading pedals…</p>}
      <div className="grid grid-cols-5 gap-2">
        {keys.map((key) => {
          const p = manifest?.pedals.find((i) => i.image === key);
          const label = p ? `${p.brand} ${p.name}` : key;
          return (
            <button
              key={key}
              aria-label={label}
              aria-pressed={avatar === key}
              title={label}
              onClick={() => pick(key)}
              className={`grid aspect-square place-items-center rounded-control p-1.5 outline-none hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-brand ${
                avatar === key ? "bg-brand/10 ring-2 ring-brand" : ""
              }`}
            >
              <PedalAvatar pedalKey={key} size={48} />
            </button>
          );
        })}
        <button
          onClick={other}
          className="grid aspect-square place-items-center rounded-control border border-dashed border-line p-1 text-center text-xs text-ink-muted outline-none hover:bg-surface-hover hover:text-ink focus-visible:ring-2 focus-visible:ring-brand"
        >
          <span>
            <Search size={16} className="mx-auto mb-0.5" />
            Other…
            {!allowed && <span className="mt-0.5 block text-[10px] font-semibold text-brand">PRO</span>}
          </span>
        </button>
      </div>
    </Modal>
  );
}
