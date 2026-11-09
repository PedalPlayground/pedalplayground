import type { KeyboardEvent } from "react";

/**
 * Arrow keys in a number field (sizes and the like): Up and Down step by 1, and with Option (Alt) by 0.1, kept between
 * `min` and `max`. Writes the new value into the field and hands it to `apply` (with the field's own text, for fields
 * that keep text in state).
 */
export function stepNumber(e: KeyboardEvent<HTMLInputElement>, apply: (v: number, text: string) => void, { min = 0.1, max = 60 } = {}) {
  if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
  e.preventDefault();
  const by = (e.altKey ? 0.1 : 1) * (e.key === "ArrowUp" ? 1 : -1);
  const now = Number(e.currentTarget.value.replace(",", ".")) || 0;
  const next = Math.min(max, Math.max(min, Math.round((now + by) * 100) / 100));
  e.currentTarget.value = String(next);
  apply(next, String(next));
}
