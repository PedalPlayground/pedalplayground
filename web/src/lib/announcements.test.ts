import { describe, expect, it } from "vitest";
import { buildFeed, isUnread, pedalEntries, weekStart, type Post } from "./announcements";
import type { CatalogItem } from "./types";

const pedal = (name: string, added?: string): CatalogItem => ({ brand: "Boss", name, width: 2.8, height: 5, image: `${name}.png`, added });
const now = new Date("2026-10-31T12:00:00Z");

describe("weekStart", () => {
  it("returns the Monday of the week", () => {
    expect(weekStart("2026-10-31")).toBe("2026-10-26"); // Saturday
    expect(weekStart("2026-10-26")).toBe("2026-10-26"); // Monday
    expect(weekStart("2026-11-01")).toBe("2026-10-26"); // Sunday
  });
});

describe("pedalEntries", () => {
  it("groups recent pedals by week and skips old or undated ones", () => {
    const entries = pedalEntries([pedal("DS-1", "2026-10-30"), pedal("SD-1", "2026-10-27"), pedal("RC-5", "2026-10-20"), pedal("Old", "2025-01-01"), pedal("None")], now);
    expect(entries).toHaveLength(2);
    const thisWeek = entries.find((e) => e.id.startsWith("pedals-2026-10-26"))!;
    expect(thisWeek).toMatchObject({ kind: "pedals", count: 2, names: ["Boss DS-1", "Boss SD-1"], date: "2026-10-30T12:00:00Z" });
  });

  it("changes the id when more pedals land in the same week", () => {
    const a = pedalEntries([pedal("DS-1", "2026-10-27")], now)[0].id;
    const b = pedalEntries([pedal("DS-1", "2026-10-27"), pedal("SD-1", "2026-10-29")], now)[0].id;
    expect(a).not.toBe(b);
  });
});

describe("buildFeed and isUnread", () => {
  const post: Post = { id: "p1", title: "Gallery is live", body: "", link_url: null, link_label: null, published_at: "2026-10-31T09:00:00Z" };
  const manifest = { schema: 1, pedals: [pedal("DS-1", "2026-10-29")], pedalboards: [], assets: { pedals: {}, pedalboards: {} } };

  it("mixes posts and pedal weeks, newest first", () => {
    const feed = buildFeed([post], manifest, now);
    expect(feed.map((e) => e.kind)).toEqual(["post", "pedals"]);
  });

  it("counts unseen recent entries only", () => {
    const [entry] = buildFeed([post], null, now);
    expect(isUnread(entry, new Set(), now)).toBe(true);
    expect(isUnread(entry, new Set([entry.id]), now)).toBe(false);
    expect(isUnread(entry, new Set(), new Date("2027-01-01T00:00:00Z"))).toBe(false);
  });
});
