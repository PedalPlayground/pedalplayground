import { useEffect, useMemo } from "react";
import { useCatalog } from "../store/catalog";
import { usableFeaturedPedals } from "../lib/featuredPedals";
import { useUi } from "../store/ui";
import { Modal } from "./Modal";
import { PedalAvatar } from "./PedalAvatar";

export function AvatarDialog({ onClose }: { onClose: () => void }) {
  const manifest = useCatalog((s) => s.manifest);
  const avatar = useUi((u) => u.avatar);
  const setAvatar = useUi((u) => u.setAvatar);

  useEffect(() => {
    void useCatalog.getState().load();
  }, []);

  const keys = useMemo(() => (manifest ? usableFeaturedPedals(manifest) : []), [manifest]);

  return (
    <Modal title="Choose your avatar" onClose={onClose}>
      {!manifest && <p className="text-sm text-ink-muted">Loading pedals…</p>}
      <div className="grid grid-cols-5 gap-2">
        {keys.map((key) => {
          const name = manifest?.pedals.find((p) => p.image === key);
          return (
            <button
              key={key}
              aria-label={name ? `${name.brand} ${name.name}` : key}
              aria-pressed={avatar === key}
              title={name ? `${name.brand} ${name.name}` : key}
              onClick={() => {
                setAvatar(key);
                onClose();
              }}
              className={`grid aspect-square place-items-center rounded-control p-1.5 outline-none hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-brand ${
                avatar === key ? "bg-brand/10 ring-2 ring-brand" : ""
              }`}
            >
              <PedalAvatar pedalKey={key} size={48} />
            </button>
          );
        })}
      </div>
    </Modal>
  );
}
