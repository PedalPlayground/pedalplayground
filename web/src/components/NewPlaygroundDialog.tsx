import { useState } from "react";
import { PLAYGROUND_TYPES, type Genre, type PlaygroundType } from "../lib/cloud";
import { plainField } from "../lib/inputProps";
import { useCloud } from "../store/cloud";
import { DEFAULT_NAME } from "../store/playground";
import { useUi } from "../store/ui";
import { GenrePicker } from "./GenrePicker";
import { Modal } from "./Modal";

/** Shaded, borderless fields; focus shows a brand ring. Matches the Edit Playground dialog. */
const field =
  "rounded-control bg-surface-hover text-sm outline-none placeholder:text-ink-muted/70 focus-visible:ring-2 focus-visible:ring-brand focus:ring-2 focus:ring-brand";

/** Names and categorizes a signed-in user's new playground before its fresh canvas opens. Cancel keeps the current board. */
export function NewPlaygroundDialog() {
  const close = () => useUi.getState().setNewPlaygroundOpen(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<PlaygroundType | null>(null);
  const [genres, setGenres] = useState<Genre[]>([]);
  const [busy, setBusy] = useState(false);

  const create = async () => {
    if (busy) return;
    setBusy(true);
    // Save any edits still waiting on autosave before the canvas is cleared.
    await useCloud.getState().saveNow();
    useCloud.getState().newPlayground({ name: name.trim() || DEFAULT_NAME, details: { description: "", type, genres } });
    close();
  };

  return (
    <Modal title="New Playground" onClose={close}>
      <label className="mb-1 block text-xs text-ink-muted" htmlFor="new-pg-name">
        Name
      </label>
      <input
        id="new-pg-name"
        autoFocus
        value={name}
        maxLength={120}
        placeholder="My Pedalboard"
        {...plainField}
        autoCapitalize="words"
        enterKeyHint="done"
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && void create()}
        className={`mb-4 h-9 w-full px-3 ${field}`}
      />

      <label className="mb-1 block text-xs text-ink-muted" htmlFor="new-pg-type">
        Playground Type
      </label>
      <select
        id="new-pg-type"
        value={type ?? ""}
        onChange={(e) => setType((e.target.value || null) as PlaygroundType | null)}
        className={`mb-4 h-9 w-full px-2.5 ${field} ${type ? "" : "text-ink-muted"}`}
      >
        <option value="">Choose a type…</option>
        {PLAYGROUND_TYPES.map(([value, label]) => (
          <option key={value} value={value} className="text-ink">
            {label}
          </option>
        ))}
      </select>

      <span className="mb-1.5 block text-xs text-ink-muted">Genres</span>
      <GenrePicker value={genres} onChange={setGenres} />

      <div className="mt-4 flex items-center justify-end gap-2">
        <button onClick={close} className="h-9 rounded-control px-3 text-sm text-ink-muted hover:bg-surface-hover">
          Cancel
        </button>
        <button onClick={() => void create()} disabled={busy} className="h-9 px-3 btn-primary disabled:opacity-60">
          Create Playground
        </button>
      </div>
    </Modal>
  );
}
