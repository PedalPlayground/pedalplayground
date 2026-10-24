import { Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "../store/auth";
import { useCloud } from "../store/cloud";
import { Modal } from "./Modal";

export function PlaygroundsDialog({ onClose, onSignIn }: { onClose: () => void; onSignIn: () => void }) {
  const user = useAuth((s) => s.user);
  const { list, cloudId, refreshList, openPlayground, remove } = useCloud();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void refreshList();
  }, [refreshList]);

  const open = async (id: string) => {
    try {
      await openPlayground(id);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open that playground.");
    }
  };

  return (
    <Modal title="Your playgrounds" onClose={onClose} wide>
      {!user && (
        <>
          <p className="mb-3 text-sm text-ink-muted">Sign in to save playgrounds to your account and open them on any device.</p>
          <button onClick={onSignIn} className="h-9 rounded-control bg-brand px-4 text-sm font-medium text-brand-ink hover:bg-brand-hover">
            Sign in
          </button>
        </>
      )}
      {user && list.length === 0 && <p className="text-sm text-ink-muted">Nothing saved yet. Your current board saves automatically.</p>}
      {error && <p className="mb-2 text-sm text-danger">{error}</p>}
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {list.map((p) => (
          <li key={p.id} className={`group relative overflow-hidden rounded-control border ${p.id === cloudId ? "border-brand" : "border-line"}`}>
            <button onClick={() => void open(p.id)} className="block w-full text-left">
              <div className="aspect-[8/5] bg-canvas">
                {p.thumbnail && <img src={p.thumbnail} alt="" className="size-full object-cover" />}
              </div>
              <div className="p-2">
                <div className="truncate text-sm font-medium">{p.name}</div>
                <div className="text-xs text-ink-muted">{new Date(p.updated_at).toLocaleDateString()}</div>
              </div>
            </button>
            <button
              aria-label={`Delete ${p.name}`}
              onClick={() => {
                if (window.confirm(`Delete "${p.name}"? This can't be undone.`)) void remove(p.id).catch((e: unknown) => setError(e instanceof Error ? e.message : "Could not delete."));
              }}
              className="absolute right-1 top-1 hidden size-7 place-items-center rounded-control bg-surface text-danger shadow-panel group-hover:grid"
            >
              <Trash2 size={14} />
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-4 text-right">
        <button onClick={onClose} className="h-9 rounded-control px-3 text-sm text-ink-muted hover:bg-surface-hover">
          Close
        </button>
      </div>
    </Modal>
  );
}
