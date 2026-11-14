import { ArrowDown, ArrowUp, Pencil, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { tip } from "../components/Tooltip";
import { itemTypes, type Manifest } from "../lib/catalog";
import { addPedalType, listPedalTypes, removePedalType, renamePedalType, reorderPedalTypes } from "../lib/editorApi";
import { plainField } from "../lib/inputProps";
import { setPedalTypes } from "../lib/pedalTypes";
import { rowAction, rowLabeled } from "./CatalogTab";
import type { PublishState, SetNotice } from "./EditorApp";
import { fieldBox, fieldHelp, inputClass, labelClass, primaryButton, secondaryButton } from "./ItemEditor";

/** Types the Gear page's code names (kept out of its Hot list), so a rename there needs a code change too. */
const NAMED_IN_CODE = new Set(["Tuner", "Volume / Expression", "Utility"]);

/** What "lose the type" is called in the Remove menu's value. */
const LOSE = "";

/**
 * Admin > Types: the pedal types players filter by on the Gear page and editors pick for each pedal. Admins only (the
 * database checks too). Each change saves straight away and changes every catalog item that has the type; Publish
 * puts the new list and the retyped items live together.
 */
export function TypesTab({ manifest, publisher, setNotice }: { manifest: Manifest | null; publisher: PublishState; setNotice: SetNotice }) {
  /** null while loading; "missing" until the pedal_types migration runs. */
  const [types, setTypes] = useState<string[] | null | "missing">(null);
  const [adding, setAdding] = useState("");
  const [renaming, setRenaming] = useState<{ from: string; to: string } | null>(null);
  const [removing, setRemoving] = useState<{ name: string; moveTo: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [unpublished, setUnpublished] = useState(0);
  /** Count changes since the catalog was published (a rename moves its count; a remove merges it). */
  const [moved, setMoved] = useState<[string, string | null][]>([]);

  const load = () =>
    listPedalTypes().then(
      (list) => {
        setTypes(list ?? "missing");
        if (list) setPedalTypes(list);
      },
      (e: Error) => setNotice({ text: e.message, error: true }),
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps -- load once
  useEffect(() => void load(), []);

  /** Live pedals with each type, from the published catalog, with this session's renames and removals applied. */
  const counts = useMemo(() => {
    const c = new Map<string, number>();
    for (const p of manifest?.pedals ?? []) for (const t of itemTypes(p)) c.set(t, (c.get(t) ?? 0) + 1);
    for (const [from, to] of moved) {
      const n = c.get(from) ?? 0;
      c.delete(from);
      if (to) c.set(to, (c.get(to) ?? 0) + n);
    }
    return c;
  }, [manifest, moved]);

  if (types === null) return <p className="text-[13px] text-ink-muted">Loading…</p>;
  if (types === "missing")
    return (
      <p className="max-w-xl text-[15px]">
        Pedal types can be edited once the <code className="text-[13px]">20261113000000_pedal_types.sql</code> migration has been run in Supabase.
      </p>
    );
  const list = types;

  /** Runs a change, then reloads the list (so it matches the database) and counts it toward the next publish. */
  const change = async (fn: () => Promise<string>) => {
    setBusy(true);
    try {
      const done = await fn();
      setUnpublished((n) => n + 1);
      setNotice({ text: `${done} Publish to put it live.` });
      await load();
      return true;
    } catch (e) {
      setNotice({ text: (e as Error).message, error: true });
      await load();
      return false;
    } finally {
      setBusy(false);
    }
  };

  const pedals = (n: number) => `${n.toLocaleString("en-US")} ${n === 1 ? "pedal" : "pedals"}`;

  const add = () => {
    const name = adding.trim();
    if (!name) return;
    void change(async () => (await addPedalType(name), `Added ${name}.`)).then((ok) => ok && setAdding(""));
  };

  const rename = () => {
    if (!renaming) return;
    const { from } = renaming;
    const to = renaming.to.trim();
    if (!to || to === from) return setRenaming(null);
    void change(async () => {
      const n = await renamePedalType(from, to);
      setMoved((m) => [...m, [from, to]]);
      return `Renamed ${from} to ${to} (${n.toLocaleString("en-US")} catalog ${n === 1 ? "item" : "items"} changed).`;
    }).then((ok) => ok && setRenaming(null));
  };

  const remove = () => {
    if (!removing) return;
    const { name } = removing;
    const moveTo = removing.moveTo || null;
    void change(async () => {
      const n = await removePedalType(name, moveTo);
      setMoved((m) => [...m, [name, moveTo]]);
      const items = `${n.toLocaleString("en-US")} catalog ${n === 1 ? "item" : "items"}`;
      return moveTo ? `Removed ${name} and moved ${items} to ${moveTo}.` : `Removed ${name} from ${items}.`;
    }).then((ok) => ok && setRemoving(null));
  };

  const move = (i: number, by: -1 | 1) => {
    const next = [...list];
    [next[i], next[i + by]] = [next[i + by], next[i]];
    setTypes(next);
    setPedalTypes(next);
    void change(async () => (await reorderPedalTypes(next), "Order saved."));
  };

  const publishNow = async () => {
    const n = await publisher.run();
    setNotice(n);
    if (!n.error) setUnpublished(0);
  };

  return (
    <div className="grid max-w-2xl gap-6">
      <div>
        <h2 className="text-[15px] font-semibold">Pedal types</h2>
        <p className="mt-1 text-[13px] text-ink-muted">
          The types players filter by on the Gear page and editors pick for each pedal, in the order menus list them. Renaming or removing a type
          changes every pedal that has it, archived ones too. Only admins see this tab.
        </p>
      </div>

      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <div className="min-w-0 flex-1">
          <label className={labelClass} htmlFor="type-new">
            New Type
          </label>
          <span id="type-new-help" className={fieldHelp}>
            Added at the end of the list
          </span>
          <input
            {...plainField}
            id="type-new"
            aria-describedby="type-new-help"
            className={inputClass}
            value={adding}
            onChange={(e) => setAdding(e.target.value)}
            maxLength={40}
            placeholder="Synth"
          />
        </div>
        <button type="submit" className={primaryButton} disabled={busy || !adding.trim()}>
          Add Type
        </button>
      </form>

      <section>
        <div className="mb-2 flex min-h-9 items-center gap-3">
          <h3 className="text-[13px] font-semibold">
            {list.length} {list.length === 1 ? "type" : "types"}
          </h3>
          {unpublished > 0 && (
            <span className="ml-auto flex items-center gap-2 text-[13px] text-ink-muted">
              {unpublished} {unpublished === 1 ? "change" : "changes"} saved, not live yet
              <button type="button" className={secondaryButton} onClick={() => void publishNow()}>
                Publish
              </button>
            </span>
          )}
        </div>
        <ol className="grid divide-y divide-line rounded-panel border border-line">
          {list.map((t, i) => {
            const n = counts.get(t) ?? 0;
            const isRenaming = renaming?.from === t;
            const isRemoving = removing?.name === t;
            return (
              <li key={t} className="px-3 py-2">
                <div className="flex min-h-9 items-center gap-2">
                  <span className="flex shrink-0 items-center">
                    <button type="button" aria-label={`Move ${t} up`} {...tip("Move up")} disabled={busy || i === 0} onClick={() => move(i, -1)} className={`${rowAction} text-icon hover:text-ink`}>
                      <ArrowUp size={15} strokeWidth={2} />
                    </button>
                    <button
                      type="button"
                      aria-label={`Move ${t} down`}
                      {...tip("Move down")}
                      disabled={busy || i === list.length - 1}
                      onClick={() => move(i, 1)}
                      className={`${rowAction} text-icon hover:text-ink`}
                    >
                      <ArrowDown size={15} strokeWidth={2} />
                    </button>
                  </span>
                  {isRenaming ? (
                    <form
                      className="flex min-w-0 flex-1 items-center gap-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        rename();
                      }}
                    >
                      <input
                        {...plainField}
                        autoFocus
                        aria-label={`New name for ${t}`}
                        className={`${inputClass} min-w-0 flex-1`}
                        value={renaming.to}
                        maxLength={40}
                        onChange={(e) => setRenaming({ from: t, to: e.target.value })}
                        onKeyDown={(e) => e.key === "Escape" && setRenaming(null)}
                      />
                      <button type="submit" className={primaryButton} disabled={busy || !renaming.to.trim()}>
                        Save
                      </button>
                      <button type="button" className={secondaryButton} onClick={() => setRenaming(null)}>
                        Cancel
                      </button>
                    </form>
                  ) : (
                    <>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-semibold">{t}</span>
                        <span className="block text-xs text-ink-muted">{pedals(n)}</span>
                      </span>
                      <button
                        type="button"
                        aria-label={`Rename ${t}`}
                        disabled={busy}
                        onClick={() => (setRemoving(null), setRenaming({ from: t, to: t }))}
                        className={rowLabeled}
                      >
                        <Pencil size={14} strokeWidth={2} />
                        Rename
                      </button>
                      <button
                        type="button"
                        aria-label={`Remove ${t}`}
                        {...tip("Remove")}
                        disabled={busy || list.length === 1}
                        onClick={() => (setRenaming(null), setRemoving({ name: t, moveTo: n && list.includes("Other") && t !== "Other" ? "Other" : LOSE }))}
                        className={`${rowAction} text-danger`}
                      >
                        <Trash2 size={15} strokeWidth={2} />
                      </button>
                    </>
                  )}
                </div>
                {isRenaming && NAMED_IN_CODE.has(t) && (
                  <p className="mt-1 text-xs text-ink-muted sm:pl-[72px]">The Gear page's code keeps {t} out of its Hot list by name, so that needs updating after a rename.</p>
                )}
                {isRemoving && (
                  <div className="mt-2 grid gap-2 rounded-inner border border-line p-3 sm:ml-[72px]">
                    {n > 0 ? (
                      <label className="text-[13px]" htmlFor={`type-move-${i}`}>
                        <span className="mb-1 block font-semibold">
                          What happens to the {pedals(n)} with {t}?
                        </span>
                        <select
                          id={`type-move-${i}`}
                          className={`${fieldBox} cursor-pointer`}
                          value={removing.moveTo}
                          onChange={(e) => setRemoving({ name: t, moveTo: e.target.value })}
                        >
                          {list
                            .filter((x) => x !== t)
                            .map((x) => (
                              <option key={x} value={x}>
                                Move them to {x}
                              </option>
                            ))}
                          <option value={LOSE}>They just lose it</option>
                        </select>
                      </label>
                    ) : (
                      <p className="text-[13px]">No live pedals have {t}. Any archived ones just lose it.</p>
                    )}
                    <div className="flex gap-2">
                      <button type="button" className={`${secondaryButton} text-danger`} disabled={busy} onClick={remove}>
                        Remove {t}
                      </button>
                      <button type="button" className={secondaryButton} onClick={() => setRemoving(null)}>
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
        <p className="mt-2 text-xs text-ink-muted">
          Boards that already set a type in their Equipment List keep the old name after a rename. Counts are live pedals in the published catalog.
        </p>
      </section>
    </div>
  );
}
