import * as Dropdown from "@radix-ui/react-dropdown-menu";
import { SlidersHorizontal } from "lucide-react";
import { useRef } from "react";
import { importAny } from "../lib/importers";
import { requestNewPlayground } from "../lib/newPlayground";
import { usePlayground } from "../store/playground";
import { useUi, type Theme } from "../store/ui";

export const menuItem =
  "flex cursor-pointer select-none items-center justify-between gap-6 rounded-control px-3 py-2 text-sm outline-none data-[highlighted]:bg-surface-hover";

export function SettingsMenu() {
  const { units, setUnits, theme, setTheme } = useUi();
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
      <Dropdown.Trigger
        aria-label="Settings"
        className="grid size-9 place-items-center rounded-control text-ink-muted outline-none hover:bg-surface-hover data-[state=open]:bg-surface-hover"
      >
        <SlidersHorizontal size={18} />
      </Dropdown.Trigger>
      <Dropdown.Portal>
        <Dropdown.Content
          align="end"
          sideOffset={6}
          className="z-50 min-w-48 rounded-panel bg-surface p-1.5 shadow-panel"
        >
          <Dropdown.Item className={menuItem} onSelect={requestNewPlayground}>
            New playground
          </Dropdown.Item>
          <Dropdown.Separator className="my-1 h-px bg-line" />
          <Dropdown.Item className={menuItem} onSelect={exportFile}>
            Export file
          </Dropdown.Item>
          <Dropdown.Item className={menuItem} onSelect={() => fileInput.current?.click()}>
            Import file…
          </Dropdown.Item>
          <Dropdown.Separator className="my-1 h-px bg-line" />
          <Dropdown.CheckboxItem
            className={menuItem}
            checked={units === "mm"}
            onCheckedChange={(on) => setUnits(on ? "mm" : "in")}
          >
            Use millimeters
            <Dropdown.ItemIndicator className="text-brand">✓</Dropdown.ItemIndicator>
          </Dropdown.CheckboxItem>
          <Dropdown.Separator className="my-1 h-px bg-line" />
          <Dropdown.Label className="px-3 pb-1 pt-1.5 text-xs text-ink-muted">Appearance</Dropdown.Label>
          <Dropdown.RadioGroup value={theme} onValueChange={(v) => setTheme(v as Theme)}>
            {(["system", "light", "dark"] as const).map((t) => (
              <Dropdown.RadioItem key={t} value={t} className={menuItem}>
                <span className="capitalize">{t}</span>
                <Dropdown.ItemIndicator className="text-brand">✓</Dropdown.ItemIndicator>
              </Dropdown.RadioItem>
            ))}
          </Dropdown.RadioGroup>
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
    </>
  );
}
