import { useState } from "react";
import { usePlayground } from "../store/playground";
import { useCloud } from "../store/cloud";
import { Modal } from "./Modal";
import { plainField } from "../lib/inputProps";

export function RenameDialog({ onClose }: { onClose: () => void }) {
  const current = usePlayground((s) => s.name);
  const rename = useCloud((s) => s.rename);
  const [value, setValue] = useState(current);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const err = await rename(value);
    if (err) setError(err);
    else onClose();
  };

  return (
    <Modal title="Rename Playground" onClose={onClose}>
      <input
        autoFocus
        value={value}
        maxLength={120}
        {...plainField}
        autoCapitalize="words"
        enterKeyHint="done"
        aria-label="Playground name"
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && void submit()}
        className="mb-2 h-9 w-full rounded-control border border-line px-3 text-sm outline-none focus:border-brand"
      />
      {error && <p className="mb-2 text-sm text-danger">{error}</p>}
      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="h-9 rounded-control px-3 text-sm text-ink-muted hover:bg-surface-hover">
          Cancel
        </button>
        <button onClick={() => void submit()} className="h-9 px-3 btn-primary">
          Save
        </button>
      </div>
    </Modal>
  );
}
