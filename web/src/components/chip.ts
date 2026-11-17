/**
 * A filter chip on a page (Gallery's board types, the Admin Queue's statuses): a pill with a hairline (`shadow-chip`),
 * filled with ink when chosen. A row of them that scrolls sideways needs room for the hairline: see Gallery's bar.
 */
export const chip = (on: boolean) =>
  `press h-8 shrink-0 rounded-full px-3 text-[13px] font-semibold transition-colors ${on ? "bg-ink text-surface" : "bg-surface text-ink-muted shadow-chip hover:text-ink"}`;
