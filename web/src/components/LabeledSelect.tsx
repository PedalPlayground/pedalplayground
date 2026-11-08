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
  options: readonly (readonly [T, string])[];
  onChange: (v: T) => void;
}) {
  const current = options.find(([v]) => v === value)?.[1] ?? value;
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
        {options.map(([v, text]) => (
          <option key={v} value={v}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}
