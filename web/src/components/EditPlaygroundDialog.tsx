import { useEffect, useState } from "react";
import {
  DESCRIPTION_MAX,
  fetchDetails,
  PLAYGROUND_TYPES,
  shareUrl,
  updateDetails,
  type PlaygroundDetails,
  type PlaygroundSummary,
  type PlaygroundType,
} from "../lib/cloud";
import { plainField } from "../lib/inputProps";
import { useAuth } from "../store/auth";
import { useCloud } from "../store/cloud";
import { usePlayground } from "../store/playground";
import { Modal } from "./Modal";
import { Segmented } from "./SettingsMenu";

type Visibility = "private" | "public";

/**
 * Name, visibility and delete for one playground. `target` is a saved playground picked from the menu;
 * without it, the dialog edits the open playground.
 */
export function EditPlaygroundDialog({ onClose, target }: { onClose: () => void; target?: PlaygroundSummary }) {
  const user = useAuth((s) => s.user);
  const openName = usePlayground((s) => s.name);
  const cloud = useCloud();

  const id = target?.id ?? cloud.cloudId;
  const startName = target?.name ?? openName;
  const startPublic = target ? target.is_public : cloud.isPublic;
  const slug = target ? target.slug : cloud.slug;
  // Visibility and delete need a playground saved to the account.
  const saved = !!user && !!id;

  const [name, setName] = useState(startName);
  const [visibility, setVisibility] = useState<Visibility>(startPublic ? "public" : "private");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  /** Loaded from the account; undefined while loading, or when the database can't store them yet (fields hidden). */
  const [startDetails, setStartDetails] = useState<PlaygroundDetails | undefined>();
  const [description, setDescription] = useState("");
  const [type, setType] = useState<PlaygroundType | null>(null);

  useEffect(() => {
    if (!saved || !id) return;
    let cancelled = false;
    fetchDetails(id)
      .then((d) => {
        if (cancelled || !d) return;
        setStartDetails(d);
        setDescription(d.description);
        setType(d.type);
      })
      .catch(() => {
        /* leave the fields hidden */
      });
    return () => {
      cancelled = true;
    };
  }, [saved, id]);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      if (name.trim() !== startName) {
        const err = await cloud.rename(name, target?.id);
        if (err) return setError(err);
      }
      if (id && startDetails && (description.trim() !== startDetails.description.trim() || type !== startDetails.type)) {
        await updateDetails(id, { description, type });
      }
      const isPublic = visibility === "public";
      if (saved && id && isPublic !== startPublic) await cloud.setVisibility(id, isPublic);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save those changes.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!id) return;
    const open = id === cloud.cloudId ? " It's open now, so the canvas will be cleared." : "";
    if (!window.confirm(`Delete "${startName}"? This can't be undone.${open}`)) return;
    try {
      await cloud.remove(id);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete that playground.");
    }
  };

  // The link only exists once it's been made public and saved.
  const url = startPublic && slug && visibility === "public" ? shareUrl(slug) : "";

  return (
    <Modal title="Edit Playground" onClose={onClose}>
      <label className="mb-1 block text-xs text-ink-muted" htmlFor="pg-name">
        Name
      </label>
      <input
        id="pg-name"
        autoFocus
        value={name}
        maxLength={120}
        {...plainField}
        autoCapitalize="words"
        enterKeyHint="done"
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && void save()}
        className="mb-4 h-9 w-full rounded-control border border-line px-3 text-sm outline-none focus:border-brand"
      />

      {startDetails && (
        <>
          <label className="mb-1 block text-xs text-ink-muted" htmlFor="pg-type">
            Playground Type
          </label>
          <select
            id="pg-type"
            value={type ?? ""}
            onChange={(e) => setType((e.target.value || null) as PlaygroundType | null)}
            className={`mb-4 h-9 w-full rounded-control border border-line bg-surface px-2.5 text-sm outline-none focus:border-brand ${type ? "" : "text-ink-muted"}`}
          >
            <option value="">Choose a type…</option>
            {PLAYGROUND_TYPES.map(([value, label]) => (
              <option key={value} value={value} className="text-ink">
                {label}
              </option>
            ))}
          </select>

          <label className="mb-1 flex justify-between text-xs text-ink-muted" htmlFor="pg-description">
            Description
            {description.length > DESCRIPTION_MAX - 100 && (
              <span>
                {description.length}/{DESCRIPTION_MAX}
              </span>
            )}
          </label>
          <textarea
            id="pg-description"
            value={description}
            maxLength={DESCRIPTION_MAX}
            rows={3}
            placeholder="What's this board for? Gear notes, power, anything."
            onChange={(e) => setDescription(e.target.value)}
            className="mb-4 block w-full resize-none rounded-control border border-line px-3 py-2 text-sm outline-none placeholder:text-ink-muted/70 focus:border-brand"
          />
        </>
      )}

      <div className="mb-1 flex items-center justify-between gap-4">
        <span className="text-xs text-ink-muted">Visibility</span>
        {saved && (
          <Segmented
            label="Visibility"
            value={visibility}
            onChange={setVisibility}
            options={[
              ["private", "Private"],
              ["public", "Public"],
            ]}
          />
        )}
      </div>
      <p className="mb-2 text-sm text-ink-muted">
        {!saved
          ? "Sign in to save this playground to your account before sharing it."
          : visibility === "public"
            ? "Anyone with the link can open their own copy. Their edits never change yours."
            : "Only you can see it."}
      </p>
      {url && (
        <div className="mb-2 flex gap-2">
          <input
            readOnly
            value={url}
            {...plainField}
            aria-label="Share link"
            onFocus={(e) => e.target.select()}
            className="h-8 min-w-0 flex-1 rounded-control border border-line px-2 text-xs"
          />
          <button
            onClick={() => {
              void navigator.clipboard?.writeText(url);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
            className="h-8 w-16 rounded-control text-xs font-medium text-brand hover:bg-brand/10"
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      )}

      {error && <p className="mb-2 text-sm text-danger">{error}</p>}

      <div className="mt-4 flex items-center gap-2">
        {saved && (
          <button onClick={() => void remove()} className="mr-auto h-9 rounded-control px-2 text-sm text-danger hover:bg-danger/10">
            Delete
          </button>
        )}
        <button onClick={onClose} className="ml-auto h-9 rounded-control px-3 text-sm text-ink-muted hover:bg-surface-hover">
          Cancel
        </button>
        <button onClick={() => void save()} disabled={busy} className="h-9 px-3 btn-primary disabled:opacity-60">
          Save
        </button>
      </div>
    </Modal>
  );
}
