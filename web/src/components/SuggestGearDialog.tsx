import { ImagePlus } from "lucide-react";
import { useId, useMemo, useRef, useState } from "react";
import { catalogBrands, fieldProblems, type Fields } from "../lib/editorChecks";
import { plainField } from "../lib/inputProps";
import { VOLTAGES } from "../lib/specs";
import { submitSuggestion } from "../lib/suggestions";
import { useAuth } from "../store/auth";
import { useCatalog } from "../store/catalog";
import { fieldError, fieldHelp, fieldInput, fieldLabel, fieldUnit, fieldWithUnit, fieldWithUnitInput } from "./formText";
import { Modal } from "./Modal";
import { TypeCombo } from "./TypeCombo";

const num = (s: string) => Number(s.replace(",", "."));

/**
 * "Suggest Gear": a player proposes a pedal or pedalboard for the catalog with the same fields the Admin form uses
 * (kind, brand, name, size, power, types) plus a photo and a note. It goes to the Admin queue for review. From the
 * Gear page's Suggest tile and Add Gear's search. Signed out, it asks to sign in first.
 */
export function SuggestGearDialog({ onClose, onSignIn, initialName = "" }: { onClose: () => void; onSignIn: () => void; initialName?: string }) {
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
      <Modal title="Suggest Gear" onClose={onClose} closeX>
        <p className="text-sm text-ink-muted">Sign in to suggest a pedal or pedalboard for the catalog. We'll review it and add it for everyone.</p>
        <button type="button" className="btn-primary mt-4 h-9 w-full" onClick={onSignIn}>
          Sign In
        </button>
      </Modal>
    );

  if (done)
    return (
      <Modal title="Thanks for the Suggestion" onClose={onClose} closeX>
        <p className="text-sm text-ink-muted">
          {brand.trim()} {name.trim()} is in the review queue. Once it's approved, it shows up in Gear and in Add Gear for everyone.
        </p>
        <button type="button" className="btn-primary mt-4 h-9 w-full" onClick={onClose}>
          Done
        </button>
      </Modal>
    );

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
    const problems = fieldProblems(fields);
    if (!photo) problems.push("Add a photo.");
    if (problems.length) return setError(problems.join(" "));
    setBusy(true);
    setError(null);
    try {
      await submitSuggestion(fields, photo!, user.id, note);
      setDone(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Suggest Gear" onClose={onClose} closeX>
      <form
        className="grid gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <p className="-mt-1 text-sm text-ink-muted">Missing something from the catalog? Tell us about it and we'll add it after a quick check.</p>

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

        <label className="block">
          <span className={fieldLabel}>Brand</span>
          <input className={`${fieldInput} [&::-webkit-calendar-picker-indicator]:hidden`} {...plainField} list={`${id}-brands`} value={brand} onChange={(e) => setBrand(e.target.value)} maxLength={120} autoFocus />
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
          <span className={fieldHelp}>The enclosure, without knobs or jacks. A spec sheet or a ruler both work.</span>
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
          <span className={fieldLabel}>Photo</span>
          <span className={fieldHelp}>Straight on, from above. A PNG with a transparent background is ideal. 10 MB at most.</span>
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
          <span className={fieldHelp}>Optional. A link to the maker's page helps us check the size.</span>
          <textarea className={`${fieldInput} h-16 resize-none py-2`} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
        </label>

        {error && <p className={fieldError}>{error}</p>}
        <button type="submit" className="btn-primary h-9 w-full disabled:opacity-60" disabled={busy}>
          {busy ? "Sending…" : "Send Suggestion"}
        </button>
      </form>
    </Modal>
  );
}
