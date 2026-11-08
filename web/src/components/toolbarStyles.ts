/** Shared look for the floating bars (bottom toolbar, object menu), from the Figma mockup. */
export const barPanel = "rounded-panel bg-surface p-1.5 shadow-float";
export const barIconButton =
  "press grid size-7 place-items-center rounded-control outline-none focus-visible:ring-2 focus-visible:ring-brand pointer-coarse:size-10 disabled:opacity-40";
export const barIconIdle = "text-icon-solo hover:bg-surface-hover hover:text-ink active:bg-chrome-line";
export const barIconActive = "bg-brand/10 text-brand active:bg-brand/20";
const barSoftBase =
  "press flex h-[26px] shrink-0 items-center gap-1 rounded-control px-3 text-[13px] font-semibold tracking-[-0.01em] outline-none focus-visible:ring-2 focus-visible:ring-brand pointer-coarse:h-10";
export const barSoftButton = `${barSoftBase} bg-soft text-ink hover:bg-soft-hover active:bg-soft-active`;
/** Icon + text with no fill until hovered (the toolbar's Share). */
export const barGhostButton = `${barSoftBase} text-ink hover:bg-surface-hover active:bg-chrome-line`;
export const barSoftDangerButton = `${barSoftBase} bg-danger/10 text-danger hover:bg-danger/15 active:bg-danger/25`;
export const barDivider = "mx-1 h-4 w-px shrink-0 bg-line";
