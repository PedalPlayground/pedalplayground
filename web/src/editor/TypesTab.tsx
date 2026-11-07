import { useEffect, useRef, useState } from "react";
import { thumbUrl, type Manifest } from "../lib/catalog";
import { fieldsFrom, listByType, saveDirect, type Item } from "../lib/editorApi";
import { plainField } from "../lib/inputProps";
import { PEDAL_TYPES } from "../lib/specs";
import { type PublishState, type SetNotice } from "./EditorApp";
import { AlsoTypes, inputClass, secondaryButton } from "./ItemEditor";

const PAGE = 100;

/**
 * Fix types many at a time: pick a type (or "No type") to list its pedals, then change each one's main type or tick
 * what else it counts as. Each change saves straight away, filed and approved like any other edit; Publish puts
 * them all live at once.
 */
export function TypesTab({ manifest, publisher, setNotice }: { manifest: Manifest | null; publisher: PublishState; setNotice: SetNotice }) {
  const [type, setType] = useState<string | null>("Amp / Preamp");
  const [text, setText] = useState("");
  const [items, setItems] = useState<Item[] | null>(null);
  const [more, setMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Rows saving right now, and rows that failed (by id). */
  const [saving, setSaving] = useState<Set<number>>(new Set());
  const [failed, setFailed] = useState<Map<number, string>>(new Map());
  /** Changes saved since the last publish. */
  const [unpublished, setUnpublished] = useState(0);
  const request = useRef(0);

  const load = async (page: number) => {
    const id = ++request.current;
    try {
      const rows = await listByType(type, text, page, PAGE);
      if (id !== request.current) return;
      setItems((list) => (page === 0 ? rows : [...(list ?? []), ...rows]));
      setMore(rows.length === PAGE);
      setError(null);
    } catch (e) {
      if (id === request.current) setError((e as Error).message);
    }
  };

  useEffect(() => {
    setItems(null);
    const t = setTimeout(() => void load(0), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, text]);

  const change = async (item: Item, main: string | null, extra: string[]) => {
    const next: Item = { ...item, type: main, extra_types: main ? extra.filter((t) => t !== main) : [] };
    setItems((list) => list?.map((x) => (x.id === item.id ? next : x)) ?? list);
    setSaving((s) => new Set(s).add(item.id));
    try {
      await saveDirect({ ...fieldsFrom(item), type: main ?? undefined, extraTypes: next.extra_types }, { targetKey: item.key, note: "Type fix" });
      setFailed((f) => {
        const n = new Map(f);
        n.delete(item.id);
        return n;
      });
      setUnpublished((n) => n + 1);
    } catch (e) {
      setItems((list) => list?.map((x) => (x.id === item.id ? item : x)) ?? list);
      setFailed((f) => new Map(f).set(item.id, (e as Error).message));
    } finally {
      setSaving((s) => {
        const n = new Set(s);
        n.delete(item.id);
        return n;
      });
    }
  };

  const publishNow = async () => {
    const n = await publisher.run();
    setNotice(n);
    if (!n.error) setUnpublished(0);
  };

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <select className={`${inputClass} max-w-[14rem]`} value={type ?? ""} onChange={(e) => setType(e.target.value || null)} aria-label="Type">
          <option value="">No type</option>
          {PEDAL_TYPES.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <input {...plainField} className={`${inputClass} max-w-xs`} placeholder="Narrow by brand or name" value={text} onChange={(e) => setText(e.target.value)} />
        {unpublished > 0 && (
          <span className="ml-auto flex items-center gap-2 text-[13px] text-ink-muted">
            {unpublished} {unpublished === 1 ? "change" : "changes"} saved, not live yet
            <button type="button" className={secondaryButton} onClick={() => void publishNow()}>
              Publish
            </button>
          </span>
        )}
      </div>
      <p className="text-xs text-ink-muted">
        Changes save as you go. Pedals stay listed until you reload, so a change is easy to undo.
      </p>
      {error && <p className="text-[13px] text-danger">{error}</p>}
      {items && items.length === 0 && <p className="text-[13px] text-ink-muted">No pedals here.</p>}

      <ul className="grid divide-y divide-line rounded-panel border border-line">
        {items?.map((item) => {
          const thumb = thumbUrl(manifest, "pedal", item.key);
          const problem = failed.get(item.id);
          return (
            <li key={item.id} className="grid gap-2 px-3 py-2.5 md:grid-cols-[minmax(0,16rem)_12rem_minmax(0,1fr)] md:items-start md:gap-4">
              <div className="flex min-w-0 items-center gap-2.5">
                <div className="grid size-10 shrink-0 place-items-center">{thumb && <img src={thumb} alt="" loading="lazy" className="max-h-10 max-w-10 object-contain" />}</div>
                <div className="min-w-0">
                  <p className="truncate text-xs text-ink-muted">{item.brand}</p>
                  <p className="truncate text-[13px] font-semibold">{item.name}</p>
                </div>
              </div>
              <select
                className={`${inputClass} h-8 text-[13px]`}
                aria-label={`Main type for ${item.brand} ${item.name}`}
                value={item.type ?? ""}
                disabled={saving.has(item.id)}
                onChange={(e) => void change(item, e.target.value || null, item.extra_types ?? [])}
              >
                <option value="">No type</option>
                {PEDAL_TYPES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
              <div className={`min-w-0 ${saving.has(item.id) ? "pointer-events-none opacity-60" : ""}`}>
                {item.type ? (
                  <AlsoTypes compact main={item.type} extra={item.extra_types ?? []} onChange={(extra) => void change(item, item.type, extra)} />
                ) : (
                  <p className="pt-1 text-xs text-ink-muted">Pick a main type first.</p>
                )}
                {problem && <p className="mt-1 text-xs text-danger">Didn't save: {problem}</p>}
              </div>
            </li>
          );
        })}
      </ul>
      {more && (
        <button type="button" className={`${secondaryButton} justify-self-center`} onClick={() => void load(Math.ceil((items?.length ?? 0) / PAGE))}>
          Show more
        </button>
      )}
    </div>
  );
}
