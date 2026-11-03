import { Check } from "lucide-react";
import { GENRES, type Genre } from "../lib/cloud";

/** Toggle chips for a playground's genre tags, shared by the New and Edit Playground dialogs. Keeps the list's order. */
export function GenrePicker({ value, onChange }: { value: Genre[]; onChange: (genres: Genre[]) => void }) {
  const toggle = (g: Genre) => onChange(GENRES.map(([id]) => id).filter((id) => (id === g ? !value.includes(g) : value.includes(id))));
  return (
    <div role="group" aria-label="Genres" className="mb-4 flex flex-wrap gap-1.5">
      {GENRES.map(([id, label]) => {
        const on = value.includes(id);
        return (
          <button
            key={id}
            type="button"
            aria-pressed={on}
            onClick={() => toggle(id)}
            className={`press flex h-7 items-center gap-1 rounded-full px-2.5 text-[13px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand ${
              on ? "bg-brand/10 text-brand" : "bg-surface-hover text-ink-muted hover:text-ink"
            }`}
          >
            {on && <Check size={13} strokeWidth={2.5} />}
            {label}
          </button>
        );
      })}
    </div>
  );
}
