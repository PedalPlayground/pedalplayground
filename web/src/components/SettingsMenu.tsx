import * as Dropdown from "@radix-ui/react-dropdown-menu";
import { Settings } from "lucide-react";
import { useRef } from "react";
import { importAny } from "../lib/importers";
import { usePlayground } from "../store/playground";
import { requestNewPlayground } from "../lib/newPlayground";
import { BETA, FEEDBACK_URL } from "../lib/beta";
import { useAuth } from "../store/auth";
import { useUi } from "../store/ui";
import { tip } from "./Tooltip";
import { CreditMenuItems } from "./MadeBy";
import { barIconButton } from "./toolbarStyles";

/** Import/export of playground files is archived for now. Flip this to bring the menu items back. */
const SHOW_FILE_IO = false;

export const menuItem =
  "flex cursor-pointer select-none items-center justify-between gap-6 rounded-control px-3 py-2 text-sm outline-none data-[highlighted]:bg-surface-hover";

/** A small on/off switch. Display only: the menu row around it handles the click. */
function Switch({ on, label }: { on: boolean; label: string }) {
  return (
    <span
      role="switch"
      aria-checked={on}
      aria-label={label}
      className={`relative inline-flex h-[18px] w-8 shrink-0 rounded-full transition-colors duration-200 ${on ? "bg-brand" : "bg-ink/15"}`}
    >
      <span
        className={`absolute left-0.5 top-0.5 size-3.5 rounded-full bg-white shadow-sm transition-transform duration-200 ease-out ${on ? "translate-x-3.5" : ""}`}
      />
    </span>
  );
}

/** A compact segmented control; the highlight slides to the chosen option. */
export function Segmented<T extends string>({
  label,
  value,
  onChange,
  options,
  wide = false,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: readonly (readonly [T, string])[];
  /** Fills its container, with equal-width options (for longer labels). */
  wide?: boolean;
}) {
  const index = Math.max(0, options.findIndex(([v]) => v === value));
  return (
    <div role="radiogroup" aria-label={label} className={`relative flex rounded-control bg-surface-hover p-0.5 ${wide ? "w-full" : ""}`}>
      <span
        aria-hidden
        className="absolute bottom-0.5 left-0.5 top-0.5 rounded-[3px] bg-surface shadow-sm transition-transform duration-200 ease-out"
        style={{ width: `calc((100% - 4px) / ${options.length})`, transform: `translateX(${index * 100}%)` }}
      />
      {options.map(([v, text]) => (
        <button
          key={v}
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className={`relative rounded-[3px] outline-none ${wide ? "h-7 flex-1 text-sm" : "h-6 w-12 text-xs"} transition-colors focus-visible:ring-2 focus-visible:ring-brand ${
            value === v ? "font-medium text-ink" : "text-ink-muted hover:text-ink"
          }`}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

/** The cog in the canvas's lower-right corner. `className` positions its floating panel. */
export function SettingsMenu({ className = "" }: { className?: string }) {
  const { units, setUnits, theme, setTheme, darkStyle, setDarkStyle, snapping, setSnapping, startTour } = useUi();
  const signedIn = useAuth((s) => !!s.user);
  const fileInput = useRef<HTMLInputElement>(null);

  const exportFile = () => {
    const doc = usePlayground.getState().toDocument();
    const url = URL.createObjectURL(new Blob([JSON.stringify(doc, null, 2)], { type: "application/json" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `${doc.name || "playground"}.json` });
    a.click();
    URL.revokeObjectURL(url);
  };

  const importFile = async (file: File) => {
    try {
      usePlayground.getState().loadDocument(importAny(JSON.parse(await file.text())), { undoable: true });
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Could not import that file.");
    }
  };

  return (
    <>
    <input
      ref={fileInput}
      type="file"
      accept="application/json,.json"
      hidden
      onChange={(e) => {
        const f = e.target.files?.[0];
        if (f) void importFile(f);
        e.target.value = "";
      }}
    />
    <Dropdown.Root>
      <div className={className}>
      <Dropdown.Trigger
        aria-label="Settings"
        {...tip("Settings", { side: "top" })}
        className={`${barIconButton} text-ink-muted hover:bg-surface-hover hover:text-ink active:bg-chrome-line data-[state=open]:bg-surface-hover data-[state=open]:text-ink`}
      >
        <Settings size={18} />
      </Dropdown.Trigger>
      </div>
      <Dropdown.Portal>
        <Dropdown.Content
          side="top"
          align="end"
          sideOffset={6}
          className="animate-menu z-50 min-w-48 rounded-panel bg-surface p-1.5 shadow-panel"
        >
          {!signedIn && (
            <>
              <Dropdown.Item className={menuItem} onSelect={requestNewPlayground}>
                New Playground
              </Dropdown.Item>
              <Dropdown.Separator className="my-1 h-px bg-line" />
            </>
          )}
          <Dropdown.Item className={menuItem} onSelect={startTour}>
            Show tutorial again…
          </Dropdown.Item>
          <Dropdown.Separator className="my-1 h-px bg-line" />
          {SHOW_FILE_IO && (
            <>
              <Dropdown.Item className={menuItem} onSelect={exportFile}>
                Export File
              </Dropdown.Item>
              <Dropdown.Item className={menuItem} onSelect={() => fileInput.current?.click()}>
                Import File…
              </Dropdown.Item>
              <Dropdown.Separator className="my-1 h-px bg-line" />
            </>
          )}
          <Dropdown.Item className={menuItem} onSelect={(e) => (e.preventDefault(), setSnapping(!snapping))}>
            Snapping
            <Switch on={snapping} label="Snapping" />
          </Dropdown.Item>
          <div className="flex items-center justify-between gap-6 px-3 py-1.5 text-sm">
            Units
            <Segmented label="Units" value={units} onChange={setUnits} options={[["in", "in"], ["mm", "mm"]]} />
          </div>
          <div className="flex items-center justify-between gap-6 px-3 py-1.5 text-sm">
            Appearance
            <Segmented
              label="Appearance"
              value={theme}
              onChange={setTheme}
              options={[["light", "Light"], ["dark", "Dark"], ["system", "Auto"]]}
            />
          </div>
          <div className="flex items-center justify-between gap-6 px-3 py-1.5 text-sm">
            Dark Mode
            <Segmented label="Dark Mode" value={darkStyle} onChange={setDarkStyle} options={[["dark", "Dark"], ["oled", "OLED"]]} />
          </div>
          {/* Small screens have no room for the credit line in the corner, so it lives here. */}
          <div className="md:hidden">
            <Dropdown.Separator className="my-1 h-px bg-line" />
            <Dropdown.Label className="px-3 py-1.5 text-xs text-ink-muted">Made with love by @tehtrav</Dropdown.Label>
            <CreditMenuItems />
          </div>
          {BETA && (
            <>
              <Dropdown.Separator className="my-1 h-px bg-line" />
              <Dropdown.Label className="px-3 py-1.5 text-xs text-ink-muted">Pedal Playground Beta</Dropdown.Label>
              {FEEDBACK_URL && (
                <Dropdown.Item className={menuItem} onSelect={() => window.open(FEEDBACK_URL, "_blank", "noopener")}>
                  Send Feedback
                </Dropdown.Item>
              )}
            </>
          )}
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
    </>
  );
}
