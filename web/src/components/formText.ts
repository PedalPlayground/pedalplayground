/**
 * Form field text, top to bottom: the label, optional help text right under it, the field, then any error under the
 * field. Wrap each field's pieces in a `mb-3` (or `mb-4` before a button) block so the spacing stays even.
 * Units go inside the field at the end (`fieldWithUnit`), never in the label.
 */

/** Label text alone, for a label that shares its row (with a units switch, a toggle, a link or a counter). */
export const fieldLabelText = "text-[13px] font-semibold text-ink/80";
export const fieldLabel = `mb-1 block ${fieldLabelText}`;
/** Help text under a label. Pulls up a little so it reads as part of the label. */
export const fieldHelp = "-mt-1 mb-1.5 block text-xs text-ink-muted";
/** A field's validation message, under the field. */
export const fieldError = "mt-1 block text-xs text-danger";

/** A text field's look without its height, for text areas (add `h-*` and `py-2`). */
export const fieldBox =
  "w-full rounded-control bg-surface-hover px-3 text-sm outline-none placeholder:text-ink-muted/70 focus:ring-2 focus:ring-brand";
/** The standard text field (also selects). */
export const fieldInput = `h-9 ${fieldBox}`;

/**
 * A field with its unit inside, at the end ("12  in"). Make the wrapper a `<label>` with this class holding the input
 * (`fieldWithUnitInput`) and the unit (`fieldUnit`, aria-hidden; put the unit in the input's accessible name instead).
 */
export const fieldWithUnit = "flex h-9 w-full items-center gap-1 rounded-control bg-surface-hover px-3 focus-within:ring-2 focus-within:ring-brand";
export const fieldWithUnitInput = "h-full min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-muted/70";
export const fieldUnit = "shrink-0 text-sm text-ink-muted";
