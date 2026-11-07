import { ArrowLeft, Check, Info, Plus, Share2, Trash2, TriangleAlert, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { DensitySwitch, type Density } from "../components/DensitySwitch";
import { fieldError, fieldHelp, fieldInput, fieldLabel, fieldUnit, fieldWithUnit, fieldWithUnitInput } from "../components/formText";
import { Meta } from "../components/Meta";
import { RoleBadges, nameLink, squiggle } from "../components/RoleBadge";
import { PageHeader, type PageDialog } from "../components/PageHeader";
import { rowClass } from "../components/ContextMenu";
import { Segmented } from "../components/SettingsMenu";
import { barGhostButton, barIconButton, barIconIdle, barPanel, barSoftButton, barSoftDangerButton } from "../components/toolbarStyles";
import { primaryButton, secondaryButton } from "../editor/ItemEditor";
import { useAuth } from "../store/auth";

type Theme = "light" | "dark" | "oled";

/**
 * The design reference at /design/: every shared token and piece, drawn with the real classes, and the rules for
 * using them. Swatches read their values from the live CSS, so this page can't drift from the site.
 */
export function DesignApp() {
  const init = useAuth((s) => s.init);
  const [dialog, setDialog] = useState<PageDialog>(null);
  const [theme, setTheme] = useState<Theme>(() => (document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light"));
  useEffect(init, [init]);

  // Preview a theme on this page only; the site's saved choice isn't touched.
  useEffect(() => {
    const root = document.documentElement;
    const before = [root.getAttribute("data-theme"), root.getAttribute("data-dark")] as const;
    root.setAttribute("data-theme", theme === "light" ? "light" : "dark");
    if (theme === "oled") root.setAttribute("data-dark", "oled");
    else root.removeAttribute("data-dark");
    return () => {
      if (before[0]) root.setAttribute("data-theme", before[0]);
      else root.removeAttribute("data-theme");
      if (before[1]) root.setAttribute("data-dark", before[1]);
      else root.removeAttribute("data-dark");
    };
  }, [theme]);

  return (
    <div className="h-dvh overflow-y-auto overscroll-contain bg-page font-sans text-ink">
      <PageHeader current={null} dialog={dialog} setDialog={setDialog} />
      <main id="content" className="page-main isolate mx-auto max-w-[1600px] px-4 pb-24 pt-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-[-0.01em]">Design reference</h1>
            <p className="mt-1 max-w-2xl text-sm text-ink-muted">
              The shared pieces of Pedal Playground and the rules for using them. Flat but crisp: color, type and space do the work, and shadows are saved for
              what floats.
            </p>
          </div>
          <div className="w-64">
            <Segmented
              label="Theme"
              wide
              value={theme}
              onChange={setTheme}
              options={[
                ["light", "Light"],
                ["dark", "Dark"],
                ["oled", "OLED"],
              ]}
            />
          </div>
        </div>

        <nav aria-label="Sections" className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-[13px] font-semibold">
          {SECTIONS.map(([id, label]) => (
            <a key={id} href={`#${id}`} className="text-brand hover:underline">
              {label}
            </a>
          ))}
        </nav>

        <Section id="color" title="Color" lead="A small, fixed set. Grays carry a little of the brand's blue-violet; #fff and #000 are the only fully neutral colors.">
          <Group title="Surfaces" note="Back to front. Cards sit on page; the board and photo wells use canvas.">
            <Swatch token="page" use="Behind Explore, Gear and this page" />
            <Swatch token="card" use="Cards on those pages" />
            <Swatch token="canvas" use="The board area and photo wells" />
            <Swatch token="surface" use="Cards, panels, dialogs, menus" />
            <Swatch token="surface-hover" use="Hover rows and quiet fields" />
            <Swatch token="chrome" use="Header and toolbars" />
          </Group>
          <Group title="Text and icons" note="Three steps of emphasis. Never lighter than ink-muted for text people need to read.">
            <Swatch token="ink" use="Titles, body text, primary icons" />
            <Swatch token="ink-muted" use="Secondary text, meta, placeholders" />
            <Swatch token="icon-solo" use="Icons on their own" />
            <Swatch token="icon" use="Icons beside a label" />
          </Group>
          <Group title="Lines and fills">
            <Swatch token="chrome-line" use="Hairline edge, only where contrast is missing" />
            <Swatch token="line" use="Dividers between rows and sections" />
            <Swatch token="grid" use="The board's dot grid" />
            <Swatch token="soft" use="Quiet buttons, switch tracks, selected rows" />
            <Swatch token="soft-hover" use="Their hover" />
          </Group>
          <Group title="Brand">
            <Swatch token="brand" use="Primary actions, focus, selection, links" />
            <Swatch token="brand-hover" use="Primary hover" />
          </Group>
          <Group title="Status" note="Meaning first: pair the color with an icon or words, never color alone.">
            <Swatch token="positive" name="Positive" hue="Jade" use="Saved, passed, approved" />
            <Swatch token="danger" name="Negative" hue="Rose vermilion" use="Errors, delete, rejections" />
            <Swatch token="warning" name="Warning" hue="Marigold" use="Needs a look, not broken" />
            <Swatch token="neutral" name="Neutral" hue="Harbor blue" use="Notices and tips" />
          </Group>
          <Group title="Accents" note="Specific jobs only. Don't reach for them to decorate.">
            <Swatch token="group" name="Orchid" use="Group halos on the board" />
            <Swatch token="guide" name="Flamingo" use="Snap and size guides" />
            <Swatch token="tangerine" name="Tangerine" use="Reserved: highlights and charts" />
            <Swatch token="lagoon" name="Lagoon" use="Reserved: highlights and charts" />
          </Group>
          <Group title="Status in use">
            <div className="col-span-full grid gap-2 sm:grid-cols-2">
              <Notice tone="positive" icon={<Check size={15} />} text="Saved to your account." />
              <Notice tone="danger" icon={<X size={15} />} text="That name is taken." />
              <Notice tone="warning" icon={<TriangleAlert size={15} />} text="The photo is a little small." />
              <Notice tone="neutral" icon={<Info size={15} />} text="Buy links open our retail partners." />
            </div>
          </Group>
        </Section>

        <Section id="type" title="Type" lead="DM Sans throughout. Hierarchy comes from size, weight and shade, not from boxes or rules.">
          <div className="grid gap-px overflow-hidden rounded-panel bg-line">
            {TYPE.map(([name, cls, spec, use]) => (
              <div key={name} className="grid items-baseline gap-2 bg-card px-4 py-3 sm:grid-cols-[10rem_minmax(0,1fr)_14rem]">
                <span className="text-xs font-semibold text-ink-muted">{name}</span>
                <span className={cls}>Pedals, boards and the space between</span>
                <span className="text-xs text-ink-muted">
                  <Meta parts={[spec, use]} />
                </span>
              </div>
            ))}
          </div>
          <Rules
            items={[
              "One title per view. Below it, step down in size or weight, and use ink-muted for anything secondary.",
              "Semibold (600) for labels and buttons, bold (700) for page and section titles only.",
              "Tight tracking (-0.01em) on 13px and up; numbers that line up use tabular figures.",
              "Body text stays at 14px. 12px is the floor for anything people need to read; 11px is for badges only.",
            ]}
          />
        </Section>

        <Section id="shape" title="Shape" lead="Corners grow with the thing. Small pieces get small corners; the bigger the container, the softer it gets.">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {RADII.map(([token, px, use]) => (
              <div key={token} className="rounded-panel bg-card p-4">
                <div className={`h-16 bg-brand/15 ${RADIUS_CLASS[token]}`} />
                <p className="mt-3 text-[13px] font-semibold">{token === "full" ? "Pill" : token}</p>
                <p className="text-xs text-ink-muted">
                  <Meta parts={[px, use]} />
                </p>
              </div>
            ))}
          </div>
        </Section>

        <Section id="depth" title="Depth" lead="Flat by default. Shadows only lift what floats above the page, and stay soft.">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <DepthSample label="Flat" note="Cards, chips, fields. Edges come from the tinted card against the white page." className="bg-card" />
            <DepthSample label="Hairline" note="Only where contrast is missing: a white chip, field or form on the white page." className="bg-surface shadow-chip" />
            <DepthSample label="Float" note="Menus, popovers, tooltips, docked panels, floating bars." className="bg-surface shadow-float" />
            <DepthSample label="Modal" note="Dialogs and sheets, over a dimmed backdrop." className="bg-surface shadow-modal" />
            <DepthSample label="Pop" note="Reserved for a button that should stand out, like Add Gear on the board. Use rarely." className="btn-primary shadow-pop" />
          </div>
          <Rules
            items={[
              "No borders on cards, fields or photos unless something disappears without one. When you need one, use chrome-line: felt, not noticed.",
              "Dividers (line) separate rows inside a panel. Don't box things that spacing can separate.",
              "Catalog photos keep their drop shadow on the board and in Gear. It follows each photo's outline and is exempt from these rules.",
              "Stacking, low to high: page content (isolated, so it never covers the header), the sticky header, docked panels and sheets, then menus, dialogs and tooltips. Dialogs render on the page body.",
              "Anything that scrolls leaves a few pixels of room so focus rings and edges inside it are never cut off.",
            ]}
          />
        </Section>

        <Section id="components" title="Components" lead="Built from the tokens above. Use these before making something new.">
          <Group title="Buttons" note="One primary action per view. Labels are a verb or a short noun, in title case on the board, sentence case on pages.">
            <Demo label="Primary" code="btn-primary / primaryButton">
              <button type="button" className={`${primaryButton} inline-flex items-center gap-1.5`}>
                <Plus size={16} strokeWidth={2.5} />
                Add Gear
              </button>
            </Demo>
            <Demo label="Secondary" code="secondaryButton">
              <button type="button" className={secondaryButton}>
                Cancel
              </button>
            </Demo>
            <Demo label="Soft" code="barSoftButton">
              <button type="button" className={barSoftButton}>
                Arrange
              </button>
            </Demo>
            <Demo label="Ghost" code="barGhostButton">
              <button type="button" className={barGhostButton}>
                <Share2 size={14} />
                Share
              </button>
            </Demo>
            <Demo label="Danger" code="barSoftDangerButton">
              <button type="button" className={barSoftDangerButton}>
                <Trash2 size={14} />
                Delete
              </button>
            </Demo>
            <Demo label="Icon" code="barIconButton">
              <div className={`${barPanel} inline-flex`}>
                <button type="button" aria-label="Share" className={`${barIconButton} ${barIconIdle}`}>
                  <Share2 size={16} />
                </button>
              </div>
            </Demo>
          </Group>

          <Group title="Fields" note="Label above, help (rarely) under the label, error under the field. Units sit inside the field.">
            <div className="col-span-full grid gap-4 rounded-panel bg-surface p-5 shadow-chip sm:grid-cols-3">
              <label className="block">
                <span className={fieldLabel}>Name</span>
                <input className={fieldInput} placeholder="Main board" />
              </label>
              <label className="block">
                <span className={fieldLabel}>Width</span>
                <span className={fieldWithUnit}>
                  <input className={fieldWithUnitInput} defaultValue="24" aria-label="Width in inches" />
                  <span className={fieldUnit} aria-hidden>
                    in
                  </span>
                </span>
              </label>
              <label className="block">
                <span className={fieldLabel}>Voltage</span>
                <select className={fieldInput} defaultValue="9V DC">
                  <option>9V DC</option>
                  <option>18V DC</option>
                </select>
              </label>
              <label className="block">
                <span className={fieldLabel}>Username</span>
                <span className={fieldHelp}>Shown on boards you share.</span>
                <input className={fieldInput} defaultValue="tone chaser" />
                <span className={fieldError}>Letters, numbers and underscores only.</span>
              </label>
              <label className="block sm:col-span-2">
                <span className={fieldLabel}>On the page</span>
                <span className={fieldHelp}>A field straight on the page is white with a hairline, since gray fields vanish there.</span>
                <input className="h-9 w-full rounded-control border border-chrome-line bg-surface px-3 text-sm outline-none focus:ring-2 focus:ring-brand" placeholder="Search pedals" />
              </label>
            </div>
          </Group>

          <Group title="Choosing">
            <Demo label="Segmented" code="Segmented">
              <SegmentedDemo />
            </Demo>
            <Demo label="Card size" code="DensitySwitch">
              <DensityDemo />
            </Demo>
            <Demo label="Chips" code="chip on / off">
              <ChipsDemo />
            </Demo>
          </Group>

          <Group title="Floating" note="Menus and popovers are the only things that cast a shadow, and only while open.">
            <Demo label="Menu" code="menuContentClass, rowClass">
              <div className="w-52 rounded-panel bg-surface p-1 shadow-float">
                <div className={`${rowClass} hover:bg-surface-hover`}>Duplicate</div>
                <div className={`${rowClass} bg-surface-hover`}>Rotate</div>
                <div className="my-1 h-px bg-line" />
                <div className={`${rowClass} text-danger`}>Delete</div>
              </div>
            </Demo>
            <Demo label="Tooltip" code="tip()">
              <span className="rounded-control bg-tip px-2 py-1 text-xs font-medium text-tip-ink shadow-float">Rotate 90°</span>
            </Demo>
            <Demo label="Toolbar" code="barPanel">
              <div className={`${barPanel} inline-flex gap-1`}>
                <button type="button" className={barSoftButton}>
                  Arrange
                </button>
                <button type="button" className={barGhostButton}>
                  Share
                </button>
              </div>
            </Demo>
          </Group>

          <Group title="Cards" note="Tinted card on the white page, one shade throughout, with a hairline under the photo. Hover adds a hairline edge; keyboard focus adds the brand ring.">
            <div className="col-span-full grid max-w-2xl grid-cols-2 gap-3 sm:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <a
                  key={i}
                  href="#components"
                  className="group flex flex-col overflow-hidden rounded-panel bg-card ring-chrome-line outline-none transition-shadow hover:ring-1 focus-visible:ring-2 focus-visible:ring-brand"
                >
                  <span className="aspect-[4/3] border-b border-chrome-line" />
                  <span className="px-3 pb-3 pt-2.5">
                    <span className="block text-[13px] font-semibold">{["DS-1 Distortion", "BD-2 Blues Driver", "TU-3 Tuner"][i]}</span>
                    <span className="mt-0.5 block text-xs font-medium text-ink-muted">BOSS</span>
                    <span className="block pt-1 text-xs tabular-nums text-ink-muted">2.88″ × 5.13″</span>
                  </span>
                </a>
              ))}
            </div>
          </Group>

          <Group title="People" note="Name first, then who made it: a board's title, then its author; a pedal's name, then its brand. Labels after a username say who's speaking.">
            <Demo label="Builder" code="RoleBadges builder">
              <span className="flex items-center gap-2 text-xs">
                <a href="#components" className={`font-semibold ${nameLink}`}>tonechaser</a>
                <RoleBadges username="tonechaser" builder />
              </span>
            </Demo>
            <Demo label="Creator" code="RoleBadges, TEAM (brand check)">
              <span className="flex items-center gap-2 text-xs">
                <a href="#components" className={`font-semibold ${nameLink}`}>trav</a>
                <RoleBadges username="trav" />
              </span>
            </Demo>
          </Group>

          <Group title="The squiggle" note="A wavy underline, used sparingly so it stays a treat: on hover for linked names, and always on for the New badge and Back links.">
            <Demo label="Name link" code="nameLink (hover)">
              <a href="#components" className={`text-sm font-medium text-ink-muted hover:text-ink ${nameLink}`}>
                BOSS
              </a>
            </Demo>
            <Demo label="Back link" code="squiggle">
              <a href="#components" className="flex items-center gap-1 text-[13px] font-semibold text-brand">
                <ArrowLeft size={14} strokeWidth={2.5} />
                <span className={squiggle}>Back to Gear</span>
              </a>
            </Demo>
          </Group>

          <Group title="Badges">
            <Demo label="New" code="bg-brand text-brand-ink">
              <span className="rounded-full bg-brand px-2 pb-1 pt-0.5 text-[11px] font-semibold leading-3 text-brand-ink">
                <span className={`${squiggle} [--squiggle-offset:0px]`}>New</span>
              </span>
            </Demo>
            <Demo label="Count" code="Filters badge">
              <span className="grid size-5 place-items-center rounded-full bg-brand text-[11px] font-semibold text-brand-ink">2</span>
            </Demo>
            <Demo label="Tag" code="surface-hover">
              <span className="rounded-full bg-surface-hover px-2 py-0.5 text-xs text-ink-muted">Guitar</span>
            </Demo>
          </Group>
        </Section>

        <Section id="writing" title="Writing" lead="Friendly but calculated. Confident, never pretentious. Say it once, in as few words as it takes.">
          <div className="grid gap-3 md:grid-cols-2">
            <Example good="Saved" bad="Your changes have been saved successfully!" />
            <Example good="No boards yet. Turn on Show in Public Gallery to share yours." bad="Oops! Looks like there's nothing here — why not add something?" />
            <Example good="BOSS   2.8″ × 5.1″   Pedalboard" bad="BOSS · 2.8″ × 5.1″ | Pedalboard" note="Set facts apart with space, not dots, bars, dashes or arrows." />
            <Example good="Delete board" bad="Click here to permanently delete this board" />
          </div>
          <Rules
            items={[
              "Help text earns its place: explain what isn't obvious or what can't be undone. Skip it when the label already says it.",
              "Punctuation sparingly. No exclamation marks in UI, no ellipses except for actions that open a dialog (Copy From…).",
              "Name things the way players do: pedal, board, playground, signal path.",
              "Errors say what happened and what to do next, in one line.",
            ]}
          />
        </Section>

        <Section id="access" title="Access" lead="Everything works from the keyboard and reads correctly to a screen reader.">
          <Rules
            items={[
              "Tab moves through controls in reading order. Every focusable thing shows the same 2px brand focus ring; never remove it without a replacement.",
              "Escape closes the top dialog, menu or sheet. Enter and Space press buttons. Arrow keys move within menus.",
              "Pages start with a Skip to content link, and each page has one main landmark (id content).",
              "Icon-only buttons have a name (aria-label) and a tooltip. Toggles and switches report their state (aria-pressed, aria-checked).",
              "Text contrast is at least 4.5:1, including placeholders and muted text. Color never carries meaning alone.",
              "Motion is short and skippable: reduced-motion settings turn animations off.",
              "Touch targets are at least 40px on touch screens (pointer-coarse sizes).",
            ]}
          />
        </Section>
      </main>
    </div>
  );
}

const SECTIONS = [
  ["color", "Color"],
  ["type", "Type"],
  ["shape", "Shape"],
  ["depth", "Depth"],
  ["components", "Components"],
  ["writing", "Writing"],
  ["access", "Access"],
] as const;

const TYPE: [string, string, string, string][] = [
  ["Page title", "text-2xl font-bold tracking-[-0.01em]", "24 bold", "Top of a page"],
  ["Section", "text-lg font-bold tracking-[-0.01em]", "18 bold", "Sections, panel titles"],
  ["Dialog title", "text-base font-semibold", "16 semibold", "Dialogs and sheets"],
  ["Body", "text-sm", "14 regular", "Default text"],
  ["Emphasis", "text-sm font-semibold", "14 semibold", "Names, buttons"],
  ["Label", "text-[13px] font-semibold text-ink/80", "13 semibold", "Field labels, card titles"],
  ["Meta", "text-xs text-ink-muted", "12 muted", "Sizes, dates, counts"],
  ["Badge", "text-[11px] font-semibold", "11 semibold", "Badges only"],
];

/** Written out in full so Tailwind sees each class. */
const RADIUS_CLASS: Record<string, string> = {
  inner: "rounded-inner",
  control: "rounded-control",
  panel: "rounded-panel",
  container: "rounded-container",
  full: "rounded-full",
};

const RADII: [string, string, string][] = [
  ["inner", "4px", "Pieces inside a control"],
  ["control", "6px", "Fields, buttons, menu rows"],
  ["panel", "10px", "Cards, panels, menus"],
  ["container", "16px", "Dialogs, sheets, big photos"],
  ["full", "Round", "Chips, pills, badges"],
];

function Section({ id, title, lead, children }: { id: string; title: string; lead: string; children: ReactNode }) {
  return (
    <section id={id} className="mt-14 scroll-mt-20">
      <h2 className="text-lg font-bold tracking-[-0.01em]">{title}</h2>
      <p className="mt-1 max-w-2xl text-sm text-ink-muted">{lead}</p>
      <div className="mt-5 grid gap-8">{children}</div>
    </section>
  );
}

function Group({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="text-sm font-semibold">{title}</h3>
      {note && <p className="mt-0.5 text-xs text-ink-muted">{note}</p>}
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">{children}</div>
    </div>
  );
}

/** A color token's swatch with its live value (read from the page's CSS, so it follows the theme switch). */
function Swatch({ token, name, hue, use }: { token: string; name?: string; hue?: string; use: string }) {
  const [value, setValue] = useState("");
  useEffect(() => {
    const read = () => setValue(getComputedStyle(document.documentElement).getPropertyValue(`--color-${token}`).trim());
    read();
    const obs = new MutationObserver(read);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "data-dark"] });
    return () => obs.disconnect();
  }, [token]);
  return (
    <div className="overflow-hidden rounded-panel bg-card">
      <div className="h-16 shadow-[inset_0_-1px_0_var(--color-chrome-line)]" style={{ background: `var(--color-${token})` }} />
      <div className="px-3 pb-3 pt-2">
        <p className="text-[13px] font-semibold">
          {name ?? token}
          {hue && <span className="ml-2 font-normal text-ink-muted">{hue}</span>}
        </p>
        <p className="font-mono text-[11px] text-ink-muted">{name ? `${token}  ${value}` : value}</p>
        <p className="mt-1 text-xs text-ink-muted">{use}</p>
      </div>
    </div>
  );
}

function Notice({ tone, icon, text }: { tone: "positive" | "danger" | "warning" | "neutral"; icon: ReactNode; text: string }) {
  const color = { positive: "text-positive bg-positive/10", danger: "text-danger bg-danger/10", warning: "text-warning bg-warning/10", neutral: "text-neutral bg-neutral/10" }[tone];
  return (
    <p className={`flex items-center gap-2 rounded-control px-3 py-2 text-[13px] font-medium ${color}`}>
      {icon}
      <span className="text-ink">{text}</span>
    </p>
  );
}

function Demo({ label, code, children }: { label: string; code: string; children: ReactNode }) {
  return (
    <div className="flex flex-col overflow-hidden rounded-panel bg-card">
      <div className="flex min-h-24 flex-1 items-center justify-center bg-canvas p-4">{children}</div>
      <div className="px-3 pb-3 pt-2">
        <p className="text-[13px] font-semibold">{label}</p>
        <p className="font-mono text-[11px] text-ink-muted">{code}</p>
      </div>
    </div>
  );
}

function DepthSample({ label, note, className }: { label: string; note: string; className: string }) {
  return (
    <div className="rounded-container bg-page p-6 shadow-chip">
      <div className={`grid h-20 place-items-center rounded-panel text-[13px] font-semibold ${className}`}>{label}</div>
      <p className="mt-3 text-xs text-ink-muted">{note}</p>
    </div>
  );
}

function Rules({ items }: { items: string[] }) {
  return (
    <ul className="grid max-w-3xl gap-2 text-sm">
      {items.map((t) => (
        <li key={t} className="flex gap-2.5">
          <Check size={16} className="mt-0.5 shrink-0 text-positive" aria-hidden />
          <span>{t}</span>
        </li>
      ))}
    </ul>
  );
}

function Example({ good, bad, note }: { good: string; bad: string; note?: string }) {
  return (
    <div className="grid gap-2 rounded-panel bg-card p-4">
      <p className="flex items-start gap-2 text-sm">
        <Check size={16} className="mt-0.5 shrink-0 text-positive" aria-label="Do" />
        <span className="whitespace-pre">{good}</span>
      </p>
      <p className="flex items-start gap-2 text-sm text-ink-muted">
        <X size={16} className="mt-0.5 shrink-0 text-danger" aria-label="Don't" />
        <span>{bad}</span>
      </p>
      {note && <p className="text-xs text-ink-muted">{note}</p>}
    </div>
  );
}

function SegmentedDemo() {
  const [v, setV] = useState<"in" | "mm">("in");
  return (
    <Segmented
      label="Units"
      value={v}
      onChange={setV}
      options={[
        ["in", "Inches"],
        ["mm", "Millimeters"],
      ]}
    />
  );
}

function DensityDemo() {
  const [d, setD] = useState<Density>("medium");
  return <DensitySwitch value={d} onChange={setD} />;
}

function ChipsDemo() {
  const [on, setOn] = useState("Guitar");
  return (
    <div className="flex gap-2">
      {["All", "Guitar", "Bass"].map((t) => (
        <button
          key={t}
          type="button"
          aria-pressed={on === t}
          onClick={() => setOn(t)}
          className={`press h-8 rounded-full px-3 text-[13px] font-semibold transition-colors ${on === t ? "bg-ink text-surface" : "bg-surface text-ink-muted shadow-chip hover:text-ink"}`}
        >
          {t}
        </button>
      ))}
    </div>
  );
}
