/**
 * A row in a filter list (Gear's sidebar, the editor's Catalog tab): the label at the left, a count at the right, and
 * a soft fill when chosen. Lists using it get a hanging outdent (-mx-2), so row text lines up with the column.
 */
export const filterRow = (on: boolean) =>
  `flex w-full items-center justify-between gap-2 rounded-control px-2 py-1.5 text-left text-[13px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand ${
    on ? "bg-soft font-semibold text-ink" : "text-ink-muted hover:bg-soft hover:text-ink"
  }`;

/** "Show 12 more" / "Show less" under a collapsed filter list. */
export const filterMore = "justify-self-start px-2 py-1 text-[13px] font-semibold text-brand hover:underline";
