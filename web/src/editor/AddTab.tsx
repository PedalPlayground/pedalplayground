import { useEffect, useState } from "react";
import type { Manifest } from "../lib/catalog";
import { copiedFields, fieldProblems, type Fields } from "../lib/editorChecks";
import type { CatalogItem } from "../lib/types";
import { saveDirect, uploadSource } from "../lib/editorApi";
import { withPublish, type PublishState, type SetNotice } from "./EditorApp";
import { ItemEditor, primaryButton } from "./ItemEditor";

const blank: Fields = { kind: "pedal", brand: "", name: "", width: 0, height: 0 };

/** Adds a pedal or pedalboard straight to the catalog, skipping the queue. */
export function AddTab({
  manifest,
  publisher,
  setNotice,
  userId,
}: {
  manifest: Manifest | null;
  publisher: PublishState;
  setNotice: SetNotice;
  userId: string;
}) {
  const [fields, setFields] = useState<Fields>(blank);
  const [file, setFile] = useState<File | null>(null);
  const [image, setImage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Bumped after a save to reset the form's inputs. */
  const [round, setRound] = useState(0);

  useEffect(() => () => void (image && URL.revokeObjectURL(image)), [image]);

  // Duplicate (from the Catalog tab): #add?from=<key> starts from that item's kind, brand and size.
  const [copiedFrom, setCopiedFrom] = useState<{ item: CatalogItem; kind: Fields["kind"]; specs: boolean } | null>(null);
  useEffect(() => {
    const take = () => {
      const key = new URLSearchParams(window.location.hash.split("?")[1] ?? "").get("from");
      if (!key || !manifest) return;
      const pedal = manifest.pedals.find((i) => i.image === key);
      const board = manifest.pedalboards.find((i) => i.image === key);
      const from = pedal ?? board;
      history.replaceState(null, "", "#add");
      if (!from) return setError("That item isn't in the live catalog, so there's nothing to copy.");
      const kind = pedal ? "pedal" : "pedalboard";
      setFields({ ...blank, kind, ...copiedFields(from, false) });
      setCopiedFrom({ item: from, kind, specs: false });
      setRound((r) => r + 1);
    };
    take();
    window.addEventListener("hashchange", take);
    return () => window.removeEventListener("hashchange", take);
  }, [manifest]);

  const problems = [...fieldProblems(fields), ...(file ? [] : ["Choose a photo."])];
  const add = async () => {
    setBusy(true);
    setError(null);
    try {
      const path = await uploadSource(file!, userId);
      const key = await saveDirect(fields, { sourcePath: path });
      setNotice(withPublish(`Added ${fields.brand} ${fields.name} (${key}).`, await publisher.run()));
      setFields({ ...blank, kind: fields.kind, brand: fields.brand });
      setFile(null);
      setImage(null);
      setRound((r) => r + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-5">
      <h2 className="text-lg font-bold tracking-[-0.01em]">Add to the catalog</h2>
      {copiedFrom && (
        <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-panel border border-line px-3 py-2 text-[13px]">
          <span>
            Copied brand and size from {copiedFrom.item.brand} {copiedFrom.item.name}.
          </span>
          {copiedFrom.kind === "pedal" && (
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={copiedFrom.specs}
                onChange={(e) => {
                  const specs = e.target.checked;
                  setCopiedFrom({ ...copiedFrom, specs });
                  setFields((f) => ({ ...f, ma: undefined, voltage: undefined, type: undefined, ...(specs ? copiedFields(copiedFrom.item, true) : {}) }));
                  setRound((r) => r + 1);
                }}
                className="accent-[var(--color-brand)]"
              />
              Also copy power and type
            </label>
          )}
          <button type="button" onClick={() => setCopiedFrom(null)} className="ml-auto text-ink-muted hover:text-ink" aria-label="Dismiss">
            ×
          </button>
        </div>
      )}
      <ItemEditor
        key={round}
        fields={fields}
        onChange={setFields}
        image={image}
        onPickFile={(f) => {
          setFile(f);
          setImage(URL.createObjectURL(f));
        }}
        manifest={manifest}
      />
      {error && <p className="text-[13px] text-danger">{error}</p>}
      <div className="flex items-center gap-3">
        <button type="button" className={primaryButton} disabled={busy || problems.length > 0} onClick={add}>
          {busy ? "Adding…" : "Add and publish"}
        </button>
        {problems.length > 0 && <span className="text-xs text-ink-muted">{problems.join(" ")}</span>}
      </div>
    </div>
  );
}
