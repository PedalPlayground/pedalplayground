/** Shared look for the floating bars (bottom toolbar, object menu), from the Figma mockup. */
export const barPanel = "rounded-[10px] border border-chrome-line bg-surface p-1.5 shadow-[0_0_12px_rgb(0_0_0/0.05)]";
export const barIconButton =
  "grid size-7 place-items-center rounded-[5px] outline-none focus-visible:ring-2 focus-visible:ring-brand pointer-coarse:size-10 disabled:opacity-40";
export const barIconIdle = "text-ink hover:bg-surface-hover";
export const barIconActive = "bg-brand/10 text-brand";
const barSoftBase =
  "flex h-[26px] shrink-0 items-center gap-1 rounded-[5px] px-3 text-[13px] font-semibold tracking-[-0.01em] outline-none focus-visible:ring-2 focus-visible:ring-brand pointer-coarse:h-10";
export const barSoftButton = `${barSoftBase} bg-[rgb(202_203_226/0.39)] text-ink hover:bg-[rgb(202_203_226/0.6)]`;
export const barSoftDangerButton = `${barSoftBase} bg-danger/10 text-danger hover:bg-danger/15`;
export const barDivider = "mx-1 h-4 w-px shrink-0 bg-line";
