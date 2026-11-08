import { X } from "lucide-react";
import { useId, useMemo, useRef, useState } from "react";
import { PEDAL_TYPES } from "../lib/specs";

/**
 * A pedal's types as one combo box: the chosen types as chips in order (the first is the main type), and a text field
 * to add more, with suggestions as you type. Drag a chip to reorder, or focus it and press Alt+← / Alt+→; Backspace in
 * the empty field removes the last one. Used by the item form and each row of the Catalog tab.
 */
export function TypeCombo({
  value,
  onChange,
  compact,
  disabled,
  label = "Types",
}: {
  value: string[];
  onChange: (types: string[]) => void;
  compact?: boolean;
  disabled?: boolean;
  label?: string;
}) {
  const id = useId();
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [dragging, setDragging] = useState<number | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const options = useMemo(() => {
    const q = text.trim().toLowerCase();
    return PEDAL_TYPES.filter((t) => !value.includes(t) && (!q || t.toLowerCase().includes(q)));
  }, [text, value]);

  const add = (t: string) => {
    onChange([...value, t]);
    setText("");
    setActive(0);
    input.current?.focus();
  };
  const remove = (i: number) => onChange(value.filter((_, n) => n !== i));
  const move = (from: number, to: number) => {
    if (to < 0 || to >= value.length || from === to) return;
    const next = [...value];
    const [t] = next.splice(from, 1);
    next.splice(to, 0, t);
    onChange(next);
  };

  const chipSize = compact ? "h-6 text-[11px]" : "h-7 text-xs";
  return (
    <div className={`relative ${disabled ? "pointer-events-none opacity-60" : ""}`}>
      <div
        className={`flex min-h-9 flex-wrap items-center gap-1 rounded-control border border-chrome-line bg-surface px-1.5 py-1 focus-within:ring-2 focus-within:ring-brand ${compact ? "min-h-8" : ""}`}
        onClick={() => input.current?.focus()}
      >
        <ul aria-label={label} className="contents">
          {value.map((t, i) => (
            <li
              key={t}
              draggable
              onDragStart={() => setDragging(i)}
              onDragEnd={() => setDragging(null)}
              onDragOver={(e) => {
                e.preventDefault();
                if (dragging !== null && dragging !== i) {
                  move(dragging, i);
                  setDragging(i);
                }
              }}
              className={`flex cursor-grab items-center gap-0.5 rounded-full pl-2 pr-0.5 font-semibold active:cursor-grabbing ${chipSize} ${
                i === 0 ? "bg-ink text-surface" : "bg-soft text-ink"
              } ${dragging === i ? "opacity-50" : ""}`}
              title={i === 0 ? "Main type. Drag to reorder." : "Drag to reorder."}
            >
              <span
                tabIndex={0}
                aria-label={`${t}${i === 0 ? ", main type" : ""}. Alt and arrow keys move it.`}
                className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-brand"
                onKeyDown={(e) => {
                  if (!e.altKey) return;
                  if (e.key === "ArrowLeft" || e.key === "ArrowUp") (e.preventDefault(), move(i, i - 1));
                  if (e.key === "ArrowRight" || e.key === "ArrowDown") (e.preventDefault(), move(i, i + 1));
                }}
              >
                {t}
              </span>
              <button
                type="button"
                aria-label={`Remove ${t}`}
                onClick={(e) => {
                  e.stopPropagation();
                  remove(i);
                }}
                className="grid size-5 place-items-center rounded-full opacity-70 hover:opacity-100"
              >
                <X size={11} strokeWidth={2.5} />
              </button>
            </li>
          ))}
        </ul>
        <input
          ref={input}
          id={id}
          role="combobox"
          aria-expanded={open && options.length > 0}
          aria-controls={`${id}-list`}
          aria-autocomplete="list"
          aria-label={value.length ? `Add a type to ${label.toLowerCase()}` : label}
          value={text}
          placeholder={value.length ? "" : "Add a type"}
          onChange={(e) => {
            setText(e.target.value);
            setOpen(true);
            setActive(0);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") (e.preventDefault(), setOpen(true), setActive((a) => Math.min(a + 1, options.length - 1)));
            else if (e.key === "ArrowUp") (e.preventDefault(), setActive((a) => Math.max(a - 1, 0)));
            else if (e.key === "Enter" && open && options[active]) (e.preventDefault(), add(options[active]));
            else if (e.key === "Escape") setOpen(false);
            else if (e.key === "Backspace" && !text && value.length) remove(value.length - 1);
          }}
          className={`min-w-[5rem] flex-1 bg-transparent px-1 outline-none ${compact ? "text-xs" : "text-[13px]"}`}
        />
      </div>
      {open && options.length > 0 && (
        <ul
          id={`${id}-list`}
          role="listbox"
          className="absolute left-0 right-0 top-full z-30 mt-1 max-h-60 overflow-y-auto rounded-panel border border-chrome-line bg-surface p-1 shadow-float"
        >
          {options.map((t, i) => (
            <li
              key={t}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                add(t);
              }}
              onMouseEnter={() => setActive(i)}
              className={`cursor-pointer rounded-control px-2 py-1.5 text-[13px] ${i === active ? "bg-soft" : ""}`}
            >
              {t}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
