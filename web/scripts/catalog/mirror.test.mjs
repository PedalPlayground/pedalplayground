import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { assetPaths, cdnFetcher, mirrorCatalog } from "./mirror.mjs";

const quiet = { log: () => {}, error: () => {} };
const noWait = { sleep: async () => {} };

const manifest = {
  schema: 1,
  pedals: [{ image: "boss-ds1" }],
  pedalboards: [],
  assets: {
    pedals: { "boss-ds1": { thumb: "thumb/boss-ds1.aa.webp", img: "img/boss-ds1.aa.webp" }, retired: { thumb: "thumb/retired.bb.webp", img: "img/retired.bb.webp" } },
    pedalboards: { "pb-1": { thumb: "thumb/pb-1.cc.webp", img: "img/pb-1.cc.webp" } },
  },
};

/** Storage stand-in: serves files from a map, and can fail a path a given number of times first. */
function fakeDb(files, { flaky = {} } = {}) {
  const calls = [];
  return {
    calls,
    storage: {
      from: () => ({
        download: async (p) => {
          calls.push(p);
          if (flaky[p] > 0) return flaky[p]--, { data: null, error: { message: "Too many connections issued to the database" } };
          return files.has(p) ? { data: new Blob([files.get(p)]), error: null } : { data: null, error: { message: "not found" } };
        },
      }),
    },
  };
}

const filesFor = (m) => new Map([["catalog.json", JSON.stringify(m)], ...assetPaths(m).map((p) => [p, `bytes of ${p}`])]);
const tmp = () => fs.mkdtemp(path.join(os.tmpdir(), "mirror-"));

describe("assetPaths", () => {
  it("lists every image once, retired items included", () => {
    expect(assetPaths(manifest)).toEqual([
      "img/boss-ds1.aa.webp", "img/pb-1.cc.webp", "img/retired.bb.webp",
      "thumb/boss-ds1.aa.webp", "thumb/pb-1.cc.webp", "thumb/retired.bb.webp",
    ]);
  });
});

describe("cdnFetcher", () => {
  it("returns the body on success and null on an error status or network failure", async () => {
    const seen = [];
    const ok = cdnFetcher("https://x.supabase.co/", async (u) => (seen.push(u), new Response("hi")));
    expect((await ok("img/a.webp")).toString()).toBe("hi");
    expect(seen).toEqual(["https://x.supabase.co/storage/v1/object/public/catalog-public/img/a.webp"]);
    expect(await cdnFetcher("https://x", async () => new Response("busy", { status: 544 }))("img/a.webp")).toBeNull();
    expect(await cdnFetcher("https://x", async () => { throw new Error("reset"); })("img/a.webp")).toBeNull();
  });
});

describe("mirrorCatalog", () => {
  it("fetches only images the servers don't have, then writes catalog.json", async () => {
    const out = await tmp();
    const db = fakeDb(filesFor(manifest));
    const have = new Set(["img/boss-ds1.aa.webp", "thumb/boss-ds1.aa.webp"]);
    const { downloaded, failures } = await mirrorCatalog(db, { out, have, log: quiet, retry: noWait });

    expect(failures).toEqual([]);
    expect(downloaded.sort()).toEqual(["img/pb-1.cc.webp", "img/retired.bb.webp", "thumb/pb-1.cc.webp", "thumb/retired.bb.webp"]);
    expect(db.calls).not.toContain("img/boss-ds1.aa.webp");
    expect(await fs.readFile(path.join(out, "img/pb-1.cc.webp"), "utf8")).toBe("bytes of img/pb-1.cc.webp");
    expect(JSON.parse(await fs.readFile(path.join(out, "catalog.json"), "utf8")).pedals).toEqual(manifest.pedals);
  });

  it("retries a busy database", async () => {
    const out = await tmp();
    const db = fakeDb(filesFor(manifest), { flaky: { "img/pb-1.cc.webp": 2 } });
    const { failures } = await mirrorCatalog(db, { out, log: quiet, retry: noWait });
    expect(failures).toEqual([]);
  });

  it("doesn't write catalog.json when an image is missing", async () => {
    const out = await tmp();
    const files = filesFor(manifest);
    files.delete("img/retired.bb.webp");
    const { failures } = await mirrorCatalog(fakeDb(files), { out, log: quiet, retry: noWait });
    expect(failures).toEqual(["img/retired.bb.webp"]);
    await expect(fs.access(path.join(out, "catalog.json"))).rejects.toThrow();
  });

  it("uses the CDN copy when there is one, but always reads catalog.json from Storage", async () => {
    const out = await tmp();
    const db = fakeDb(filesFor(manifest));
    const fromCdn = async (p) => (p.startsWith("img/") ? Buffer.from(`cdn ${p}`) : null);
    const { failures } = await mirrorCatalog(db, { out, fromCdn, log: quiet, retry: noWait });
    expect(failures).toEqual([]);
    expect(db.calls).toContain("catalog.json");
    expect(db.calls.filter((p) => p.startsWith("img/"))).toEqual([]);
    expect(db.calls.filter((p) => p.startsWith("thumb/")).length).toBe(3);
    expect(await fs.readFile(path.join(out, "img/pb-1.cc.webp"), "utf8")).toBe("cdn img/pb-1.cc.webp");
  });

  it("refuses paths that could escape the folder", async () => {
    const bad = { ...manifest, assets: { pedals: { x: { thumb: "../../etc/x.webp", img: "img/x.webp" } }, pedalboards: {} } };
    await expect(mirrorCatalog(fakeDb(filesFor(bad)), { out: await tmp(), log: quiet, retry: noWait })).rejects.toThrow(/unexpected image paths/);
  });
});
