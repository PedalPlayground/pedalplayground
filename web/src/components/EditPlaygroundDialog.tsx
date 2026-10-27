import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";
import {
  DESCRIPTION_MAX,
  fetchDetails,
  fetchInGallery,
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
import { tip } from "./Tooltip";

/** Shaded, borderless fields; focus shows a brand ring. */
const field =
  "rounded-control bg-surface-hover text-sm outline-none placeholder:text-ink-muted/70 focus-visible:ring-2 focus-visible:ring-brand focus:ring-2 focus:ring-brand";

/**
 * Name, type, description, gallery listing and delete for one playground. `target` is a saved playground picked from the menu;
 * without it, the dialog edits the open playground.
 */
export function EditPlaygroundDialog({ onClose, target }: { onClose: () => void; target?: PlaygroundSummary }) {
  const user = useAuth((s) => s.user);
  const openName = usePlayground((s) => s.name);
  const cloud = useCloud();

  const id = target?.id ?? cloud.cloudId;
  const startName = target?.name ?? openName;
  // The gallery switch and delete need a playground saved to the account.
  const saved = !!user && !!id;

  const [name, setName] = useState(startName);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** Loaded like the details; undefined hides the switch. */
  const [startGallery, setStartGallery] = useState<boolean | undefined>();
  const [inGallery, setGallery] = useState(false);
  /** The share link's slug once the playground is shared; null until then. */
  const startShared = target ? target.is_public : cloud.isPublic;
  const [slug, setSlug] = useState<string | null>(startShared ? (target ? target.slug : cloud.slug) : null);
  const [sharing, setSharing] = useState(false);
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
    fetchInGallery(id)
      .then((g) => {
        if (cancelled || g === undefined) return;
        setStartGallery(g);
        setGallery(g);
      })
      .catch(() => {
        /* leave the switch hidden */
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
      if (id && startGallery !== undefined && inGallery !== startGallery) {
        await cloud.setInGallery(id, inGallery);
      }
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
        className={`mb-4 h-9 w-full px-3 ${field}`}
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
            className={`mb-4 h-9 w-full px-2.5 ${field} ${type ? "" : "text-ink-muted"}`}
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
            className={`mb-4 block w-full resize-none px-3 py-2 ${field}`}
          />
        </>
      )}

      {saved && (
        <>
          <span className="mb-1 block text-xs text-ink-muted">Share Link</span>
          {slug ? (
            <button
              type="button"
              aria-label="Copy share link"
              onClick={() => {
                void navigator.clipboard?.writeText(shareUrl(slug));
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              {...tip(copied ? "Copied" : "Copy Link")}
              className={`mb-4 flex h-9 w-full items-center gap-2 px-3 text-left ${field}`}
            >
              <span className="min-w-0 flex-1 truncate">{shareUrl(slug)}</span>
              {copied ? <Check size={14} className="shrink-0 text-brand" /> : <Copy size={14} className="shrink-0 text-ink-muted" />}
            </button>
          ) : (
            <button
              type="button"
              disabled={sharing || !id}
              onClick={() => {
                if (!id) return;
                setSharing(true);
                cloud
                  .shareById(id)
                  .then(setSlug)
                  .catch((e: unknown) => setError(e instanceof Error ? e.message : "Could not create a share link."))
                  .finally(() => setSharing(false));
              }}
              className={`mb-4 flex h-9 w-full items-center px-3 text-left text-brand disabled:opacity-60 ${field}`}
            >
              {sharing ? "Creating Link…" : "Create Share Link"}
            </button>
          )}
        </>
      )}

      {startGallery !== undefined && (
        <button
          type="button"
          role="switch"
          aria-checked={inGallery}
          onClick={() => setGallery(!inGallery)}
          className="mb-2 flex w-full items-start justify-between gap-4 rounded-control text-left outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <span>
            <span className="block text-sm">Show in Public Gallery</span>
            <span className="block text-xs text-ink-muted">
              {inGallery
                ? "Anyone can find this board in the gallery and open their own copy."
                : "Only people you send a share link to can see it."}
            </span>
          </span>
          <span className={`relative mt-0.5 inline-flex h-[18px] w-8 shrink-0 rounded-full transition-colors duration-200 ${inGallery ? "bg-brand" : "bg-ink/15"}`}>
            <span
              className={`absolute left-0.5 top-0.5 size-3.5 rounded-full bg-white shadow-sm transition-transform duration-200 ease-out ${inGallery ? "translate-x-3.5" : ""}`}
            />
          </span>
        </button>
      )}

      {error && <p className="mb-2 text-sm text-danger">{error}</p>}

      <div className="mt-4 flex items-center gap-2">
        {saved && (
          <button onClick={() => void remove()} className="mr-auto h-9 rounded-control text-sm text-danger outline-none hover:underline focus-visible:underline">
            Delete Playground
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
