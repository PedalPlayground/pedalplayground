import * as Dropdown from "@radix-ui/react-dropdown-menu";
import { Check, ChevronDown, Plus, Share2 } from "lucide-react";
import { useEffect, useState } from "react";
import { renderThumbnail } from "../lib/thumbnail";
import { requestNewPlayground } from "../lib/newPlayground";
import { useAuth } from "../store/auth";
import { useCloud } from "../store/cloud";
import { usePlayground } from "../store/playground";

const item =
  "flex cursor-pointer select-none items-center gap-3 rounded-control px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-surface-hover";

function Thumb({ src }: { src: string | null | undefined }) {
  return src ? (
    <img src={src} alt="" className="size-8 shrink-0 rounded object-cover ring-1 ring-line" />
  ) : (
    <span className="size-8 shrink-0 rounded bg-canvas ring-1 ring-line" />
  );
}

/** A thumbnail of the canvas as it is right now (re-rendered shortly after each edit), so it never lags a cloud save. */
function useLiveThumbnail() {
  const items = usePlayground((s) => s.items);
  const [thumb, setThumb] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => {
      void renderThumbnail(items).then((url) => {
        if (!cancelled) setThumb(url);
      });
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [items]);
  return items.length ? thumb : null;
}

type MenuProps = { onRename: () => void; onAll: () => void; onSignIn: () => void };

/** The playground menu's items: the user's playgrounds, rename, new, and (signed out) sign in. */
function MenuContent({ onRename, onAll, onSignIn, side }: MenuProps & { side: "top" | "bottom" }) {
  const name = usePlayground((s) => s.name);
  const user = useAuth((s) => s.user);
  const cloudEnabled = useAuth((s) => s.cloudEnabled);
  const { list, cloudId, openPlayground } = useCloud();
  return (
    <Dropdown.Portal>
      <Dropdown.Content
        side={side}
        align={side === "bottom" ? "center" : "start"}
        sideOffset={8}
        className="z-50 w-72 rounded-panel bg-surface p-1.5 shadow-panel"
      >
        <Dropdown.Label className="truncate px-2 pb-1 pt-1.5 text-sm font-medium">{name}</Dropdown.Label>
        <Dropdown.Separator className="my-1 h-px bg-line" />
        {user && list.length > 0 && (
          <>
            <Dropdown.Label className="px-2 py-1 text-xs text-ink-muted">Your playgrounds</Dropdown.Label>
            {list.slice(0, 6).map((p) => (
              <Dropdown.Item key={p.id} className={item} onSelect={() => void openPlayground(p.id)}>
                <Thumb src={p.thumbnail} />
                <span className="min-w-0 flex-1 truncate">{p.name}</span>
                {p.id === cloudId && <Check size={14} className="text-brand" />}
              </Dropdown.Item>
            ))}
            <Dropdown.Item className={item} onSelect={onAll}>
              All playgrounds…
            </Dropdown.Item>
            <Dropdown.Separator className="my-1 h-px bg-line" />
          </>
        )}
        <Dropdown.Item className={item} onSelect={onRename}>
          Rename…
        </Dropdown.Item>
        <Dropdown.Item className={item} onSelect={requestNewPlayground}>
          New playground
        </Dropdown.Item>
        {cloudEnabled && !user && (
          <>
            <Dropdown.Separator className="my-1 h-px bg-line" />
            <Dropdown.Item className={`${item} text-brand`} onSelect={onSignIn}>
              Sign in to save across devices
            </Dropdown.Item>
          </>
        )}
      </Dropdown.Content>
    </Dropdown.Portal>
  );
}

/** Header breadcrumb: "PedalPlayground / [thumbnail] Playground name ⌄", which opens the playground menu. */
export function PlaygroundBreadcrumb(props: MenuProps) {
  const live = useLiveThumbnail();
  const name = usePlayground((s) => s.name);
  const { list, cloudId } = useCloud();
  const thumb = live ?? list.find((p) => p.id === cloudId)?.thumbnail;
  return (
    <div className="flex min-w-0 items-center gap-3 text-sm/4 font-semibold tracking-[-0.01em]">
      <span className="shrink-0 max-md:hidden">PedalPlayground</span>
      <span className="shrink-0 text-base/4 font-light opacity-30 max-md:hidden">/</span>
      <Dropdown.Root>
        <Dropdown.Trigger
          aria-label={`Playground: ${name}`}
          title={name}
          className="-mx-1.5 flex min-w-0 items-center gap-2 rounded-control px-1.5 py-1 outline-none hover:bg-ink/5 focus-visible:ring-2 focus-visible:ring-brand data-[state=open]:bg-ink/5"
        >
          {thumb ? (
            <img src={thumb} alt="" className="size-6 shrink-0 rounded-[3px] border-[0.5px] border-[#d9d9d9] bg-white object-cover" />
          ) : (
            <span className="size-6 shrink-0 rounded-[3px] border-[0.5px] border-[#d9d9d9] bg-white" />
          )}
          <span className="truncate">{name}</span>
          <ChevronDown size={12} strokeWidth={2.5} className="shrink-0" />
        </Dropdown.Trigger>
        <MenuContent {...props} side="bottom" />
      </Dropdown.Root>
    </div>
  );
}

/**
 * Floating playground controls for phones (switch, new, share), which have no header. Larger screens use the header
 * breadcrumb and the toolbar's Share button instead.
 */
export function PlaygroundSwitcher({ onShare, ...props }: MenuProps & { onShare: () => void }) {
  const live = useLiveThumbnail();
  const name = usePlayground((s) => s.name);
  const { list, cloudId } = useCloud();
  const current = list.find((p) => p.id === cloudId);

  return (
    <div className="absolute left-4 top-4 flex max-w-[calc(100%-2rem)] items-center gap-1 rounded-panel bg-surface p-1.5 shadow-panel sm:hidden">
      <span className="contents">
        <Dropdown.Root>
          <Dropdown.Trigger
            aria-label={`Playground: ${name}`}
            title={name}
            className="flex h-9 items-center gap-1.5 rounded-control px-1.5 outline-none hover:bg-surface-hover data-[state=open]:bg-surface-hover"
          >
            <Thumb src={live ?? current?.thumbnail} />
            <ChevronDown size={14} className="shrink-0 text-ink-muted" />
          </Dropdown.Trigger>
          <MenuContent {...props} side="top" />
        </Dropdown.Root>
        <span className="h-5 w-px bg-line" />
        <button
          aria-label="New playground"
          title="New playground"
          onClick={requestNewPlayground}
          className="grid size-9 shrink-0 place-items-center rounded-control text-ink-muted hover:bg-surface-hover"
        >
          <Plus size={16} />
        </button>
      </span>
      <button onClick={onShare} aria-label="Share" className="btn-primary ml-0.5 flex h-9 items-center gap-1.5 px-2.5">
        <Share2 size={16} />
      </button>
    </div>
  );
}
