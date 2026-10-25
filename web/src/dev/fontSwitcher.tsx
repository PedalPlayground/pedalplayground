// Dev only (imported behind import.meta.env.DEV in main.tsx): a floating panel to preview candidate
// fonts app-wide. It overrides --font-sans (body) and --font-heading (headings) on <html> and
// remembers the choice in localStorage. Fonts load from Google Fonts, so nothing ships in production.
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

const FONTS = [
  { name: "Inter", gf: "Inter:wght@400;500;600;700" },
  { name: "Geist", gf: "Geist:wght@400;500;600;700" },
  { name: "Plus Jakarta Sans", gf: "Plus+Jakarta+Sans:wght@400;500;600;700" },
  { name: "Manrope", gf: "Manrope:wght@400;500;600;700" },
  { name: "Outfit", gf: "Outfit:wght@400;500;600;700" },
  { name: "Figtree", gf: "Figtree:wght@400;500;600;700" },
  { name: "Space Grotesk", gf: "Space+Grotesk:wght@400;500;600;700" },
  { name: "DM Sans", gf: "DM+Sans:wght@400;500;600;700" },
];

const FALLBACK = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';
const KEY = "pp:dev-fonts";
const SAME = "";

type Choice = { body: string; heading: string };

function load(): Choice {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (v && typeof v.body === "string" && typeof v.heading === "string") return v;
  } catch {}
  return { body: "Inter", heading: SAME };
}

function apply({ body, heading }: Choice) {
  const s = document.documentElement.style;
  s.setProperty("--font-sans", `"${body}", ${FALLBACK}`);
  if (heading) s.setProperty("--font-heading", `"${heading}", ${FALLBACK}`);
  else s.removeProperty("--font-heading");
}

function injectFonts() {
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?${FONTS.map((f) => `family=${f.gf}`).join("&")}&display=swap`;
  document.head.appendChild(link);
}

function FontSwitcher() {
  const [choice, setChoice] = useState(load);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    apply(choice);
    try {
      localStorage.setItem(KEY, JSON.stringify(choice));
    } catch {}
  }, [choice]);

  const select = (label: string, value: string, key: keyof Choice, allowSame = false) => (
    <label className="flex items-center justify-between gap-2">
      <span className="text-ink-muted">{label}</span>
      <select
        value={value}
        onChange={(e) => setChoice({ ...choice, [key]: e.target.value })}
        className="rounded-control border border-line bg-surface px-1 py-0.5 text-ink"
      >
        {allowSame && <option value={SAME}>Same as body</option>}
        {FONTS.map((f) => (
          <option key={f.name} value={f.name}>
            {f.name}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div
      className="fixed bottom-3 right-3 z-[9999] rounded-panel bg-surface text-xs text-ink shadow-panel"
      style={{ fontFamily: "system-ui, sans-serif" }}
    >
      <button onClick={() => setOpen(!open)} className="w-full px-3 py-1.5 text-left font-semibold">
        Fonts (dev) {open ? "▾" : "▸"}
      </button>
      {open && (
        <div className="flex w-56 flex-col gap-2 px-3 pb-3">
          {select("Body", choice.body, "body")}
          {select("Headings", choice.heading, "heading", true)}
          <div className="flex justify-between">
            <button
              onClick={() => {
                const i = FONTS.findIndex((f) => f.name === choice.body);
                setChoice({ ...choice, body: FONTS[(i + FONTS.length - 1) % FONTS.length].name });
              }}
              className="rounded-control border border-line px-2 py-0.5 hover:bg-surface-hover"
            >
              ← Prev
            </button>
            <button
              onClick={() => {
                const i = FONTS.findIndex((f) => f.name === choice.body);
                setChoice({ ...choice, body: FONTS[(i + 1) % FONTS.length].name });
              }}
              className="rounded-control border border-line px-2 py-0.5 hover:bg-surface-hover"
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

injectFonts();
apply(load());
const host = document.createElement("div");
document.body.appendChild(host);
createRoot(host).render(<FontSwitcher />);
