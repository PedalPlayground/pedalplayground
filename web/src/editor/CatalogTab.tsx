import { useEffect, useState } from "react";
import type { Manifest } from "../lib/catalog";
import { fieldProblems, type Fields } from "../lib/editorChecks";
import { fieldsFrom, publicUrl, saveDirect, searchItems, setStatus, sourceUrl, uploadSource, type Item } from "../lib/editorApi";
import { plainField } from "../lib/inputProps";
import { withPublish, type PublishState, type SetNotice } from "./EditorApp";
import { inputClass, ItemEditor, primaryButton, secondaryButton } from "./ItemEditor";

/** Search the live catalog (and retired items) to fix, re-photo, retire or restore an item. */
export function CatalogTab({
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
  const [text, setText] = useState("");
  const [retired, setRetired] = useState(false);
  const [results, setResults] = useState<Item[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Item | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      searchItems(text, { retired }).then(
        (r) => {
          setResults(r);
          setError(null);
        },
        (e: Error) => setError(e.message),
      );
    }, 250);
    return () => clearTimeout(t);
  }, [text, retired]);

  if (open)
    return (
      <EditItem
        key={open.id}
        item={open}
        manifest={manifest}
        userId={userId}
        onClose={() => setOpen(null)}
        onSaved={(n, updated) => {
          setNotice(n);
          setOpen(null);
          if (updated) setResults((r) => r?.map((x) => (x.id === updated.id ? updated : x)) ?? r);
        }}
        publisher={publisher}
      />
    );

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <input
          {...plainField}
          className={`${inputClass} max-w-sm`}
          placeholder="Search brand or name"
          value={text}
          onChange={(e) => setText(e.target.value)}
          autoFocus
        />
        <label className="flex items-center gap-1.5 text-[13px] text-ink-muted">
          <input type="checkbox" checked={retired} onChange={(e) => setRetired(e.target.checked)} /> Include retired
        </label>
      </div>
      {error && <p className="text-[13px] text-danger">{error}</p>}
      {!text.trim() && <p className="text-xs text-ink-muted">Most recently changed first.</p>}
      {results && results.length === 0 && <p className="text-[13px] text-ink-muted">Nothing matches.</p>}
      <ul className="grid gap-1 sm:grid-cols-2">
        {results?.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => setOpen(item)}
              className="flex w-full items-center gap-3 rounded-[5px] px-2 py-1.5 text-left hover:bg-surface-hover"
            >
              <span className="grid size-10 shrink-0 place-items-center">
                {item.thumb_path ? (
                  <img src={publicUrl(item.thumb_path)} alt="" className="max-h-10 max-w-10 object-contain" loading="lazy" />
                ) : (
                  <span className="size-8 rounded bg-ink/10" />
                )}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-semibold">
                  {item.brand} {item.name}
                </span>
                <span className="block truncate text-xs text-ink-muted">
                  {item.kind === "pedalboard" ? "Pedalboard · " : ""}
                  {+Number(item.width_in).toFixed(3)} × {+Number(item.height_in).toFixed(3)} in
                  {item.status === "retired" && " · retired"}
                  {item.needs_render && item.source_path && " · building"}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function EditItem({
  item,
  manifest,
  userId,
  onClose,
  onSaved,
  publisher,
}: {
  item: Item;
  manifest: Manifest | null;
  userId: string;
  onClose: () => void;
  onSaved: (n: { text: string; error?: boolean }, updated?: Item) => void;
  publisher: PublishState;
}) {
  const [fields, setFields] = useState<Fields>(() => fieldsFrom(item));
  const [image, setImage] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (item.source_path) sourceUrl(item.source_path).then(setImage, () => setImage(item.img_path ? publicUrl(item.img_path) : null));
    else if (item.img_path) setImage(publicUrl(item.img_path));
  }, [item]);

  const problems = fieldProblems(fields);
  const name = `${item.brand} ${item.name}`;
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className={secondaryButton} onClick={onClose}>
          ← Back
        </button>
        <h2 className="text-lg font-bold tracking-[-0.01em]">{name}</h2>
        <span className="text-xs text-ink-muted">
          key {item.key} · added {item.added_on}
          {item.status === "retired" && " · retired"}
        </span>
      </div>
      <ItemEditor
        fields={fields}
        onChange={setFields}
        image={image}
        onPickFile={(f) => {
          setFile(f);
          setImage(URL.createObjectURL(f));
        }}
        manifest={manifest}
        skipImage={item.key}
        lockKind
      />
      <p className="text-xs text-ink-muted">
        Saved boards keep using this item's key, so fixing its size or photo updates them too.
      </p>
      {problems.length > 0 && <p className="text-[13px] text-danger">{problems.join(" ")}</p>}
      {error && <p className="text-[13px] text-danger">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={primaryButton}
          disabled={busy || problems.length > 0}
          onClick={() =>
            run(async () => {
              const path = file ? await uploadSource(file, userId) : undefined;
              await saveDirect(fields, { targetKey: item.key, sourcePath: path });
              onSaved(withPublish(`Saved ${fields.brand} ${fields.name}.`, await publisher.run()));
            })
          }
        >
          {busy ? "Saving…" : "Save and publish"}
        </button>
        {item.status === "live" ? (
          <button
            type="button"
            className={`${secondaryButton} text-danger`}
            disabled={busy}
            onClick={() => {
              if (!window.confirm(`Retire ${name}? It leaves search, but saved boards still show it.`)) return;
              void run(async () => {
                await setStatus(item.kind, item.key, "retired");
                onSaved(withPublish(`Retired ${name}.`, await publisher.run()), { ...item, status: "retired" });
              });
            }}
          >
            Retire
          </button>
        ) : (
          <button
            type="button"
            className={secondaryButton}
            disabled={busy}
            onClick={() =>
              run(async () => {
                await setStatus(item.kind, item.key, "live");
                onSaved(withPublish(`Restored ${name}.`, await publisher.run()), { ...item, status: "live" });
              })
            }
          >
            Restore
          </button>
        )}
      </div>
    </div>
  );
}
