const TABS = [
  { id: "build", href: "/", label: "Build" },
  { id: "gallery", href: "/gallery/", label: "Gallery" },
] as const;

/** "Build · Gallery" beside the logo on both pages, so either is one click away. */
/** `current` null: neither is marked (someone else's board, which is neither your build nor the gallery). */
export function SiteTabs({ current }: { current: "build" | "gallery" | null }) {
  return (
    <nav aria-label="Pedal Playground" className="flex shrink-0 items-center gap-0.5">
      {TABS.map((t) => {
        const here = t.id === current;
        return (
          <a
            key={t.id}
            href={t.href}
            aria-current={here ? "page" : undefined}
            className={`flex h-7 items-center gap-1.5 rounded-control px-2 text-[13px] font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand sm:px-2.5 ${
              here ? "bg-ink/[0.06] text-ink" : "text-ink-muted hover:bg-ink/5 hover:text-ink"
            }`}
          >
            {t.label}
          </a>
        );
      })}
    </nav>
  );
}
