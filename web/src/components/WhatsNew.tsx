import * as Dropdown from "@radix-ui/react-dropdown-menu";
import { Bell, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { buildFeed, fetchPosts, isUnread, markSeen, readSeen, type FeedEntry, type Post } from "../lib/announcements";
import { track } from "../lib/analytics";
import { useCatalog } from "../store/catalog";
import { showNewGear } from "./SearchPanel";
import { tip } from "./Tooltip";

const dateLabel = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: new Date(iso).getFullYear() === new Date().getFullYear() ? undefined : "numeric" });

/** The header bell: a dot when there's something new, and a short feed of posts and new pedals. */
export function WhatsNew() {
  const manifest = useCatalog((s) => s.manifest);
  const [posts, setPosts] = useState<Post[]>([]);
  const [seen, setSeen] = useState(readSeen);
  /** True while the panel is open: the dot goes away, but the "New" labels stay until it closes. */
  const [opened, setOpened] = useState(false);

  // Wait a moment so the feed doesn't compete with the playground loading.
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => void fetchPosts().then((p) => !cancelled && setPosts(p)), 1500);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, []);

  const feed = useMemo(() => buildFeed(posts, manifest), [posts, manifest]);
  const unread = !opened && feed.some((e) => isUnread(e, seen));

  return (
    <Dropdown.Root
      onOpenChange={(open) => {
        setOpened(open);
        if (open) {
          track("whats_new_open", { unread });
          markSeen(feed);
        } else {
          setSeen(readSeen());
        }
      }}
    >
      <Dropdown.Trigger
        aria-label={unread ? "What's new (unread)" : "What's new"}
        {...tip("What's New")}
        className="press relative grid size-9 place-items-center rounded-control text-ink-muted outline-none hover:bg-surface-hover hover:text-ink active:bg-chrome-line focus-visible:ring-2 focus-visible:ring-brand data-[state=open]:bg-surface-hover data-[state=open]:text-ink"
      >
        <Bell size={18} />
        {unread && <span aria-hidden className="absolute right-2 top-2 size-2 rounded-full bg-brand ring-2 ring-chrome" />}
      </Dropdown.Trigger>
      <Dropdown.Portal>
        <Dropdown.Content
          align="end"
          sideOffset={10}
          collisionPadding={12}
          className="animate-menu z-50 flex max-h-[min(32rem,calc(100dvh-5rem))] w-[22rem] max-w-[calc(100vw-1.5rem)] flex-col rounded-panel bg-surface shadow-panel"
        >
          <Dropdown.Label className="border-b border-line px-4 py-3 text-sm font-semibold">What's New</Dropdown.Label>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1.5">
            {feed.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-ink-muted">Nothing new yet. Check back soon.</p>
            ) : (
              feed.map((e) => <Entry key={e.id} entry={e} fresh={isUnread(e, seen)} />)
            )}
          </div>
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
  );
}

const linkClass = "mt-1.5 inline-block text-[13px] font-semibold text-brand hover:underline";

function Entry({ entry, fresh }: { entry: FeedEntry; fresh: boolean }) {
  const meta = (
    <span className="flex items-center gap-2 text-xs text-ink-muted">
      {dateLabel(entry.date)}
      {fresh && <span className="rounded-full bg-brand/10 px-1.5 py-px text-[11px] font-semibold text-brand">New</span>}
    </span>
  );

  if (entry.kind === "pedals") {
    const rest = entry.count - entry.names.length;
    return (
      <Dropdown.Item
        className="block cursor-pointer select-none rounded-control px-3 py-2.5 outline-none data-[highlighted]:bg-surface-hover"
        onSelect={() => {
          track("whats_new_pedals");
          showNewGear();
        }}
      >
        {meta}
        <span className="mt-0.5 flex items-center gap-1.5 text-sm font-semibold">
          <Sparkles size={14} className="shrink-0 text-brand" />
          {entry.count} new {entry.count === 1 ? "pedal" : "pedals"} added
        </span>
        <span className="mt-0.5 block text-[13px] text-ink-muted">
          {entry.names.join(", ")}
          {rest > 0 && ` and ${rest} more`}.
        </span>
        <span className={linkClass}>See what's new</span>
      </Dropdown.Item>
    );
  }

  const { post } = entry;
  const external = post.link_url?.startsWith("https://");
  return (
    <div className="px-3 py-2.5">
      {meta}
      <p className="mt-0.5 text-sm font-semibold">{post.title}</p>
      {post.body && <p className="mt-0.5 whitespace-pre-line text-[13px] text-ink-muted">{post.body}</p>}
      {post.link_url && (
        <a
          href={post.link_url}
          {...(external && { target: "_blank", rel: "noreferrer" })}
          onClick={() => track("whats_new_link")}
          className={linkClass}
        >
          {post.link_label || "Learn more"}
        </a>
      )}
    </div>
  );
}
