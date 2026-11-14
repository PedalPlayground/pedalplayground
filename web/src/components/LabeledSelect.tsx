import { ChevronDown } from "lucide-react";

/**
 * A quiet dropdown over a card grid: "Sort by: Newest ⌄". The label in ink, the current choice muted, and a native
 * select stretched invisibly over both, so it opens the platform's own menu (and works with keyboards and phones).
 */
export function LabeledSelect<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  /** [value, text], or [value, text, group] to sort the menu under group headings (shown as "Group · text"). */
  options: readonly (readonly [T, string] | readonly [T, string, string])[];
  onChange: (v: T) => void;
}) {
  const hit = options.find(([v]) => v === value);
  const current = !hit ? value : hit[2] && hit[2] !== hit[1] ? `${hit[2]} · ${hit[1]}` : hit[1];
  const groups = [...new Set(options.map((o) => o[2]))];
  return (
    <label className="relative flex shrink-0 cursor-pointer items-center gap-1.5 rounded-inner text-sm has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand">
      <span className="font-semibold text-ink">{label}:</span>
      <span className="flex items-center gap-0.5 text-ink-muted transition-colors hover:text-ink">
        {current}
        <ChevronDown size={14} strokeWidth={2.25} aria-hidden />
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        aria-label={label}
        className="absolute inset-0 cursor-pointer appearance-none opacity-0 outline-none"
      >
        {groups.map((g) => {
          const opts = options
            .filter((o) => o[2] === g)
            .map(([v, text]) => (
              <option key={v} value={v}>
                {text}
              </option>
            ));
          return g ? (
            <optgroup key={g} label={g}>
              {opts}
            </optgroup>
          ) : (
            opts
          );
        })}
      </select>
    </label>
  );
}
