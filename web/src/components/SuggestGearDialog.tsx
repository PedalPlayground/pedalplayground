import { ImagePlus } from "lucide-react";
import { useId, useMemo, useRef, useState } from "react";
import { catalogBrands, fieldProblems, type Fields } from "../lib/editorChecks";
import { plainField } from "../lib/inputProps";
import { VOLTAGES } from "../lib/specs";
import { reportBug, submitSuggestion } from "../lib/suggestions";
import { canvasImageUrl, itemTypes, thumbUrl, type Kind } from "../lib/catalog";
import type { CatalogItem } from "../lib/types";
import { useAuth } from "../store/auth";
import { useCatalog } from "../store/catalog";
import { fieldError, fieldHelp, fieldInput, fieldLabel, fieldUnit, fieldWithUnit, fieldWithUnitInput } from "./formText";
import { Modal } from "./Modal";
import { TypeCombo } from "./TypeCombo";

const num = (s: string) => Number(s.replace(",", "."));
const inches = (n: number) => String(Math.round(n * 1000) / 1000);

/** The three things the form can send. */
export type SuggestTab = "new" | "fix" | "bug";
const TABS: [SuggestTab, string][] = [
  ["new", "New Gear"],
  ["fix", "Wrong Info"],
  ["bug", "Report a Bug"],
];
const TITLES: Record<SuggestTab, string> = { new: "Suggest Gear", fix: "Fix Gear Info", bug: "Report a Bug" };

/**
 * "Suggest Gear", in three tabs. New Gear: a pedal or pedalboard for the catalog, with the Admin form's fields (kind,
 * brand, name, size, power, types) plus a photo and a note. Wrong Info: pick a catalog item and correct its fields
 * (a new photo is optional). Both go to the Admin queue. Report a Bug: a description, filed with the page and browser
 * for the Admin page's Bug Reports. From the Gear page's Suggest tile and Add Gear's search. Signed out, it asks to
 * sign in first.
 */
export function SuggestGearDialog({
  onClose,
  onSignIn,
  initialName = "",
  initialTab = "new",
}: {
  onClose: () => void;
  onSignIn: () => void;
  initialName?: string;
  initialTab?: SuggestTab;
}) {
  const [tab, setTab] = useState<SuggestTab>(initialTab);
  /** Wrong Info: the item being corrected, and the search for it. */
  const [fixing, setFixing] = useState<{ kind: Kind; item: CatalogItem } | null>(null);
  const [find, setFind] = useState(initialName);
  const [bug, setBug] = useState("");
  const id = useId();
  const user = useAuth((s) => s.user);
  const manifest = useCatalog((s) => s.manifest);
  const brands = useMemo(() => (manifest ? catalogBrands([...manifest.pedals, ...manifest.pedalboards]) : []), [manifest]);
  const [kind, setKind] = useState<Fields["kind"]>("pedal");
  const [brand, setBrand] = useState("");
  const [name, setName] = useState(initialName);
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");
  const [voltage, setVoltage] = useState("");
  const [ma, setMa] = useState("");
  const [types, setTypes] = useState<string[]>([]);
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  if (!user)
    return (
      <Modal title={TITLES[tab]} onClose={onClose} closeX>
        <p className="text-sm text-ink-muted">Sign in to suggest gear, fix the catalog's info or report a bug. We read every one.</p>
        <button type="button" className="btn-primary mt-4 h-9 w-full" onClick={onSignIn}>
          Sign In
        </button>
      </Modal>
    );

  if (done)
    return (
      <Modal title={tab === "bug" ? "Thanks for the Report" : "Thanks for the Suggestion"} onClose={onClose} closeX>
        <p className="text-sm text-ink-muted">
          {tab === "bug"
            ? "We'll look into it. Your report includes this page's address and your browser, so there's no need to add those."
            : tab === "fix"
              ? `Your fix for ${brand.trim()} ${name.trim()} is in the review queue. Once it's approved, everyone sees the corrected info.`
              : `${brand.trim()} ${name.trim()} is in the review queue. Once it's approved, it shows up in Gear and in Add Gear for everyone.`}
        </p>
        <button type="button" className="btn-primary mt-4 h-9 w-full" onClick={onClose}>
          Done
        </button>
      </Modal>
    );

  const pickFix = (kind: Kind, item: CatalogItem) => {
    setFixing({ kind, item });
    setKind(kind);
    setBrand(item.brand);
    setName(item.name);
    setWidth(inches(item.width));
    setHeight(inches(item.height));
    setVoltage(item.voltage ?? "");
    setMa(item.ma ? String(item.ma) : "");
    setTypes(itemTypes(item));
    setError(null);
  };
  const matches = (() => {
    const words = find.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!manifest || !words.length) return [];
    const out: { kind: Kind; item: CatalogItem }[] = [];
    for (const [kind, list] of [["pedal", manifest.pedals], ["pedalboard", manifest.pedalboards]] as const)
      for (const item of list) {
        const hay = `${item.brand} ${item.name}`.toLowerCase();
        if (words.every((w) => hay.includes(w))) out.push({ kind, item });
        if (out.length >= 6) return out;
      }
    return out;
  })();

  const fields: Fields = {
    kind,
    brand,
    name,
    width: num(width),
    height: num(height),
    ma: kind === "pedal" && ma.trim() ? Math.round(num(ma)) : undefined,
    voltage: kind === "pedal" ? voltage || undefined : undefined,
    type: kind === "pedal" ? types[0] : undefined,
    extraTypes: kind === "pedal" ? types.slice(1) : [],
  };
  const submit = async () => {
    if (tab === "bug") {
      if (!bug.trim()) return setError("Tell us what went wrong.");
    } else {
      if (tab === "fix" && !fixing) return setError("Pick the gear to fix.");
      const problems = fieldProblems(fields);
      if (tab === "new" && !photo) problems.push("Add a photo.");
      if (problems.length) return setError(problems.join(" "));
    }
    setBusy(true);
    setError(null);
    try {
      if (tab === "bug") await reportBug(bug);
      else await submitSuggestion(fields, photo, user.id, note, tab === "fix" ? fixing!.item.image.replace(/\.png$/, "") : undefined);
      setDone(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={TITLES[tab]} onClose={onClose} closeX>
      <form
        className="grid gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        {/* What to send. */}
        <div role="tablist" aria-label="What to send" className="-mt-1 flex rounded-control bg-soft p-0.5">
          {TABS.map(([t, label]) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => {
                setTab(t);
                setError(null);
              }}
              className={`h-7 flex-1 whitespace-nowrap rounded-inner px-2 text-xs font-semibold transition-colors ${tab === t ? "bg-surface text-ink" : "text-ink-muted hover:text-ink"}`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "bug" ? (
          <label className="block">
            <span className={fieldLabel}>What went wrong?</span>
            <span className={fieldHelp}>What you did, what you expected, and what happened instead. We'll see which page you're on.</span>
            <textarea className={`${fieldInput} h-32 resize-none py-2`} value={bug} onChange={(e) => setBug(e.target.value)} maxLength={2000} autoFocus />
          </label>
        ) : tab === "fix" && !fixing ? (
          <div>
            <label className="block">
              <span className={fieldLabel}>Which gear?</span>
              <input className={fieldInput} {...plainField} placeholder="Search brand or name" value={find} onChange={(e) => setFind(e.target.value)} autoFocus />
            </label>
            <ul className="mt-1.5 grid gap-0.5">
              {matches.map(({ kind: k, item }) => (
                <li key={`${k}:${item.brand}|${item.name}|${item.image}`}>
                  <button
                    type="button"
                    onClick={() => pickFix(k, item)}
                    className="flex w-full items-center gap-2.5 rounded-control px-2 py-1.5 text-left hover:bg-surface-hover"
                  >
                    <span className="grid size-9 shrink-0 place-items-center">
                      {manifest && <img src={thumbUrl(manifest, k, item.image) ?? ""} alt="" className="max-h-9 max-w-9 object-contain" />}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{item.name}</span>
                      <span className="block truncate text-xs text-ink-muted">{item.brand}</span>
                    </span>
                  </button>
                </li>
              ))}
              {find.trim() && !matches.length && <li className="px-2 py-1.5 text-sm text-ink-muted">Nothing matches. Is it new? Try New Gear.</li>}
            </ul>
          </div>
        ) : (
          <>
        {tab === "fix" && fixing ? (
          <div className="flex items-center gap-2.5 rounded-control bg-card p-2">
            <span className="grid size-10 shrink-0 place-items-center">
              {manifest && <img src={canvasImageUrl(manifest, fixing.kind, fixing.item.image) ?? ""} alt="" className="max-h-10 max-w-10 object-contain" />}
            </span>
            <span className="min-w-0 flex-1 text-xs text-ink-muted">Fixing <span className="font-semibold text-ink">{fixing.item.brand} {fixing.item.name}</span>. Change what's wrong below.</span>
            <button type="button" className="shrink-0 text-xs font-semibold text-brand hover:underline" onClick={() => setFixing(null)}>
              Change
            </button>
          </div>
        ) : (
        <div className="flex gap-1" role="radiogroup" aria-label="Kind">
          {(["pedal", "pedalboard"] as const).map((k) => (
            <button
              type="button"
              key={k}
              role="radio"
              aria-checked={kind === k}
              onClick={() => setKind(k)}
              className={`flex-1 rounded-control py-1.5 text-sm ${kind === k ? "bg-brand/10 font-semibold text-brand" : "text-ink-muted hover:bg-surface-hover"}`}
            >
              {k === "pedal" ? "Pedal" : "Pedalboard"}
            </button>
          ))}
        </div>
        )}

        <label className="block">
          <span className={fieldLabel}>Brand</span>
          <input className={`${fieldInput} [&::-webkit-calendar-picker-indicator]:hidden`} {...plainField} list={`${id}-brands`} value={brand} onChange={(e) => setBrand(e.target.value)} maxLength={120} autoFocus={tab === "new"} />
          <datalist id={`${id}-brands`}>
            {brands.map((b) => (
              <option key={b} value={b} />
            ))}
          </datalist>
        </label>
        <label className="block">
          <span className={fieldLabel}>Name</span>
          <input className={fieldInput} {...plainField} value={name} onChange={(e) => setName(e.target.value)} maxLength={200} />
        </label>

        <div>
          <span className={fieldLabel}>Size</span>
          <span className={fieldHelp}>The whole footprint from above, including jacks, knobs and anything else that sticks out.</span>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ["Width", width, setWidth],
                ["Height", height, setHeight],
              ] as const
            ).map(([label, value, set]) => (
              <label key={label} className={fieldWithUnit}>
                <span className="shrink-0 text-xs text-ink-muted">{label}</span>
                <input
                  className={`${fieldWithUnitInput} text-right`}
                  {...plainField}
                  inputMode="decimal"
                  aria-label={`${label} (inches)`}
                  value={value}
                  onChange={(e) => set(e.target.value)}
                />
                <span aria-hidden className={fieldUnit}>
                  in
                </span>
              </label>
            ))}
          </div>
        </div>

        {kind === "pedal" && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className={fieldLabel}>Power</span>
                <select className={fieldInput} value={voltage} onChange={(e) => setVoltage(e.target.value)}>
                  <option value="">Not sure</option>
                  {VOLTAGES.map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className={fieldLabel}>Current Draw</span>
                <span className={fieldWithUnit}>
                  <input className={fieldWithUnitInput} {...plainField} inputMode="numeric" aria-label="Current draw (mA)" value={ma} onChange={(e) => setMa(e.target.value)} />
                  <span aria-hidden className={fieldUnit}>
                    mA
                  </span>
                </span>
              </label>
            </div>
            <div>
              <span className={fieldLabel}>Types</span>
              <span className={fieldHelp}>The first is its main type. Optional.</span>
              <TypeCombo value={types} onChange={setTypes} />
            </div>
          </>
        )}

        <div>
          <span className={fieldLabel}>{tab === "fix" ? "New Photo" : "Photo"}</span>
          <span className={fieldHelp}>
            {tab === "fix" ? "Optional, if the picture is wrong. " : ""}Straight on from above, showing the whole pedal: jacks, knobs and everything that sticks out, with little empty space around it. A PNG with a transparent background is ideal. 10 MB at most.
          </span>
          <input
            ref={fileInput}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              if (f && f.size > 10 * 1024 * 1024) return setError("That photo is over 10 MB.");
              setPhoto(f);
              setPreview(f ? URL.createObjectURL(f) : null);
            }}
          />
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="flex h-24 w-full items-center justify-center gap-2 rounded-control border border-dashed border-chrome-line bg-surface-hover text-sm text-ink-muted outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-brand"
          >
            {preview ? <img src={preview} alt="" className="max-h-20 max-w-[80%] object-contain" /> : (
              <>
                <ImagePlus size={18} /> Choose a Photo
              </>
            )}
          </button>
        </div>

        <label className="block">
          <span className={fieldLabel}>Note</span>
          <span className={fieldHelp}>
            {tab === "fix" ? "What was wrong? A link to the maker's page helps us check." : "Optional. A link to the maker's page helps us check the size."}
          </span>
          <textarea className={`${fieldInput} h-16 resize-none py-2`} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
        </label>
          </>
        )}

        {error && <p className={fieldError}>{error}</p>}
        <button type="submit" className="btn-primary h-9 w-full disabled:opacity-60" disabled={busy}>
          {busy ? "Sending…" : tab === "bug" ? "Send Report" : tab === "fix" ? "Send Fix" : "Send Suggestion"}
        </button>
      </form>
    </Modal>
  );
}
