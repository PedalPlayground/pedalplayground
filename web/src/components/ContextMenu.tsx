import * as Dropdown from "@radix-ui/react-dropdown-menu";
import {
  AlignHorizontalSpaceBetween,
  Group,
  Ungroup,
  ArrowDownToLine,
  ArrowUpToLine,
  BringToFront,
  CopyPlus,
  Fullscreen,
  Lock,
  LockOpen,
  Plus,
  Redo2,
  Replace,
  RotateCw,
  SendToBack,
  SquareDashedMousePointer,
  Trash2,
  Undo2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { create } from "zustand";
import { isOneGroup, usePlayground } from "../store/playground";
import { useUi } from "../store/ui";
import { hideTip, platformKeys } from "./Tooltip";
import { itemName } from "../lib/itemName";

type Kind = "canvas" | "object";

interface OpenMenu {
  kind: Kind;
  /** Where it opens, in window coordinates. */
  x: number;
  y: number;
  /** The same point inside the canvas, so zooming from the menu zooms around where it was opened. */
  canvasX: number;
  canvasY: number;
  /** Changes on every open, so opening again somewhere else starts fresh. */
  key: number;
}

export const useContextMenu = create<{ open: OpenMenu | null }>(() => ({ open: null }));

let opens = 0;

export function openContextMenu(menu: Omit<OpenMenu, "key">) {
  hideTip();
  useContextMenu.setState({ open: { ...menu, key: ++opens } });
}

export const closeContextMenu = () => useContextMenu.setState({ open: null });

/** Shared with other popover menus (the search filters) so they all look the same. */
export const menuContentClass = "animate-menu z-50 min-w-48 rounded-[10px] border border-chrome-line bg-surface p-1 shadow-panel";

export const rowClass =
  "group flex h-7 cursor-default select-none items-center gap-2 rounded-[5px] pl-2 pr-2.5 text-[13px] tracking-[-0.01em] outline-none transition-colors duration-100 data-[disabled]:pointer-events-none data-[disabled]:opacity-40 pointer-coarse:h-9";

function Row({
  icon,
  label,
  shortcut,
  onSelect,
  disabled,
  danger,
}: {
  icon: ReactNode;
  label: string;
  shortcut?: string;
  onSelect: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <Dropdown.Item
      disabled={disabled}
      onSelect={onSelect}
      // Radix also picks an item when a press that started elsewhere is released over it. Here that's the right
      // click that opened the menu, so a slight drag would pick the first row; only a full click selects.
      onPointerUp={(e) => e.preventDefault()}
      className={`${rowClass} ${
        danger
          ? "text-danger data-[highlighted]:bg-danger/10 active:bg-danger/20"
          : "text-ink data-[highlighted]:bg-surface-hover active:bg-chrome-line"
      }`}
    >
      <span
        aria-hidden
        className={`grid size-4 shrink-0 place-items-center ${danger ? "" : "text-icon group-data-[highlighted]:text-ink"}`}
      >
        {icon}
      </span>
      <span className="flex-1 whitespace-nowrap">{label}</span>
      {/* Touch screens have no keyboard to speak of, so the shortcuts only take up room there. */}
      {shortcut && (
        <kbd className="ml-6 font-sans text-xs tracking-normal text-ink-muted pointer-coarse:hidden">{platformKeys(shortcut)}</kbd>
      )}
    </Dropdown.Item>
  );
}

const Separator = () => <Dropdown.Separator className="-mx-1 my-1 h-px bg-line" />;

const ICON = { size: 15, strokeWidth: 2 } as const;

/** Actions for the selected object(s), with the same labels as the floating object menu. */
function ObjectItems() {
  const s = usePlayground();
  const setReplacing = useUi((u) => u.setReplacing);
  const selected = s.items.filter((i) => s.selected.includes(i.id));
  if (!selected.length) return null;
  const single = selected.length === 1 ? selected[0] : undefined;
  const locked = selected.every((i) => i.locked);
  return (
    <>
      <Dropdown.Label className="max-w-60 truncate px-2 pb-1 pt-0.5 text-xs font-semibold text-ink-muted">
        {single ? itemName(single) : `${selected.length} selected`}
      </Dropdown.Label>
      <Row
        icon={locked ? <Lock {...ICON} /> : <LockOpen {...ICON} />}
        label={locked ? "Unlock" : "Lock in Place"}
        shortcut="L"
        onSelect={s.toggleLockSelected}
      />
      <Row icon={<RotateCw {...ICON} />} label="Rotate 90°" shortcut="R" onSelect={s.rotateSelected} />
      <Row icon={<CopyPlus {...ICON} />} label="Duplicate" shortcut="⌘D" onSelect={s.duplicateSelected} />
      {selected.length >= 2 && (
        <Row
          icon={isOneGroup(selected) ? <Ungroup {...ICON} /> : <Group {...ICON} />}
          label={isOneGroup(selected) ? "Ungroup" : "Group"}
          shortcut="G"
          onSelect={s.toggleGroupSelected}
        />
      )}
      {selected.length >= 3 && (
        <Row icon={<AlignHorizontalSpaceBetween {...ICON} />} label="Space Evenly" onSelect={s.distributeHorizontally} />
      )}
      <Separator />
      <Row icon={<ArrowUpToLine {...ICON} />} label="Move Forward" shortcut="]" onSelect={s.bringForward} />
      <Row icon={<ArrowDownToLine {...ICON} />} label="Move Back" shortcut="[" onSelect={s.sendBackward} />
      <Row icon={<BringToFront {...ICON} />} label="Move to Front" shortcut="⌘]" onSelect={s.bringToFront} />
      <Row icon={<SendToBack {...ICON} />} label="Move to Back" shortcut="⌘[" onSelect={s.sendToBack} />
      <Separator />
      {single && !single.custom && <Row icon={<Replace {...ICON} />} label="Replace" onSelect={() => setReplacing(true)} />}
      <Row icon={<Trash2 {...ICON} />} label="Remove" shortcut="Delete" onSelect={s.deleteSelected} danger />
    </>
  );
}

/** Actions for the empty canvas, with the same labels as the toolbar. */
function CanvasItems({ canvasX, canvasY }: { canvasX: number; canvasY: number }) {
  const s = usePlayground();
  const empty = !s.items.length;
  return (
    <>
      <Row icon={<Plus {...ICON} />} label="Add Gear" shortcut="+" onSelect={() => useUi.getState().setSearchOpen(true)} />
      <Separator />
      <Row icon={<Undo2 {...ICON} />} label="Undo" shortcut="⌘Z" disabled={!s.past.length} onSelect={s.undo} />
      <Row icon={<Redo2 {...ICON} />} label="Redo" shortcut="⇧⌘Z" disabled={!s.future.length} onSelect={s.redo} />
      <Separator />
      <Row
        icon={<SquareDashedMousePointer {...ICON} />}
        label="Select All"
        shortcut="⌘A"
        disabled={empty}
        onSelect={() => s.selectMany(s.items.map((i) => i.id))}
      />
      <Separator />
      <Row icon={<ZoomIn {...ICON} />} label="Zoom In" shortcut="⌘+" onSelect={() => s.zoomBy(1.25, canvasX, canvasY)} />
      <Row icon={<ZoomOut {...ICON} />} label="Zoom Out" shortcut="⌘−" onSelect={() => s.zoomBy(0.8, canvasX, canvasY)} />
      <Row icon={<Fullscreen {...ICON} />} label="Center & Fit" shortcut="1" disabled={empty} onSelect={s.fitToContent} />
    </>
  );
}

/**
 * The right-click menu for the canvas and the things on it. The canvas decides which one opens and where;
 * Radix handles the keyboard (arrows, typing a letter, Enter, Esc), keeps it on screen, and closes it on an outside click.
 */
export function ContextMenu() {
  const open = useContextMenu((m) => m.open);

  // Scrolling, zooming, or resizing moves the canvas out from under the menu, so it closes.
  useEffect(() => {
    if (!open) return;
    window.addEventListener("wheel", closeContextMenu, { capture: true, passive: true });
    window.addEventListener("resize", closeContextMenu);
    window.addEventListener("blur", closeContextMenu);
    return () => {
      window.removeEventListener("wheel", closeContextMenu, { capture: true });
      window.removeEventListener("resize", closeContextMenu);
      window.removeEventListener("blur", closeContextMenu);
    };
  }, [open]);

  // Leaving the playground (for example, for the Equipment List) closes it.
  useEffect(() => closeContextMenu, []);

  if (!open) return null;
  return (
    <Dropdown.Root key={open.key} open modal={false} onOpenChange={(o) => !o && closeContextMenu()}>
      {/* An invisible point at the click for the menu to open from. */}
      <Dropdown.Trigger asChild>
        <span className="pointer-events-none fixed size-0" style={{ left: open.x, top: open.y }} />
      </Dropdown.Trigger>
      <Dropdown.Portal>
        <Dropdown.Content
          side="bottom"
          align="start"
          sideOffset={2}
          collisionPadding={8}
          onCloseAutoFocus={(e) => e.preventDefault()}
          // Esc only closes the menu; without this the canvas would also take it as "clear the selection".
          onEscapeKeyDown={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.preventDefault()}
          className={menuContentClass}
        >
          {open.kind === "object" ? <ObjectItems /> : <CanvasItems canvasX={open.canvasX} canvasY={open.canvasY} />}
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
  );
}
