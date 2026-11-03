import { useEffect, useState } from "react";
import type { Manifest } from "../lib/catalog";
import { fieldProblems, type Fields } from "../lib/editorChecks";
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
