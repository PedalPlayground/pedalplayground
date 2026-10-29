import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { publishCatalog } from "./publish.mjs";

/** A stand-in for the parts of supabase-js the publisher uses, backed by arrays and maps. */
function fakeDb(items, sources, { failDownload = [] } = {}) {
  const uploads = new Map();
  const query = (rows) => {
    let filters = [];
    let patch = null;
    const run = () => rows.filter((r) => filters.every((f) => f(r)));
    const q = {
      select: () => q,
      order: () => q,
      eq: (col, val) => ((filters = [...filters, (r) => r[col] === val]), q),
      not: (col, op, val) => ((filters = [...filters, (r) => r[col] !== val && r[col] !== undefined]), q),
      range: async (a, b) => ({ data: run().slice(a, b + 1).map((r) => ({ ...r })), error: null }),
      update: (p) => ((patch = p), q),
      then: (resolve) => {
        for (const r of run()) Object.assign(r, patch);
        resolve({ error: null });
      },
    };
    return q;
  };
  return {
    uploads,
    from: () => query(items),
    storage: {
      from: (bucket) => ({
        download: async (path) =>
          failDownload.includes(path) || !sources.has(path)
            ? { data: null, error: { message: "not found" } }
            : { data: new Blob([sources.get(path)]), error: null },
        upload: async (path, body, opts) => (uploads.set(`${bucket}/${path}`, { body, opts }), { error: null }),
      }),
    },
  };
}

const png = (w, h) => sharp({ create: { width: w, height: h, channels: 4, background: { r: 200, g: 0, b: 0, alpha: 1 } } }).png().toBuffer();
const quiet = { log: () => {}, error: () => {} };

const item = (over) => ({
  id: 1, kind: "pedal", key: "boss-ds1", brand: "BOSS", name: "DS-1", width_in: "2.875", height_in: "5.125",
  current_ma: null, voltage: null, type: null, status: "live", added_on: "2026-10-29",
  source_path: "submissions/u/a.png", needs_render: true, thumb_path: null, img_path: null, ...over,
});

describe("publishCatalog", () => {
  it("builds pending items, uploads images before the manifest, and clears the flag", async () => {
    const items = [item(), item({ id: 2, key: "old-one", needs_render: false, thumb_path: "thumb/old-one.1.webp", img_path: "img/old-one.1.webp" })];
    const db = fakeDb(items, new Map([["submissions/u/a.png", await png(300, 540)]]));
    const { built, failures, manifest } = await publishCatalog(db, { log: quiet });

    expect(built).toEqual(["boss-ds1"]);
    expect(failures).toEqual([]);
    expect(items[0].needs_render).toBe(false);
    expect(items[0].img_path).toMatch(/^img\/boss-ds1\.[0-9a-f]{8}\.webp$/);
    const order = [...db.uploads.keys()];
    expect(order.at(-1)).toBe("catalog-public/catalog.json");
    expect(order).toContain(`catalog-public/${items[0].img_path}`);
    expect(db.uploads.get("catalog-public/catalog.json").opts.cacheControl).toBe("300");
    expect(manifest.pedals.map((p) => p.image).sort()).toEqual(["boss-ds1", "old-one"]);

    const img = await sharp(db.uploads.get(`catalog-public/${items[0].img_path}`).body).metadata();
    expect(img.format).toBe("webp");
    expect([img.width, img.height]).toEqual([300, 540]); // never upscaled
  });

  it("keeps a failed item marked and still writes the manifest for the rest", async () => {
    const items = [item(), item({ id: 2, key: "missing", source_path: "submissions/u/gone.png" })];
    const db = fakeDb(items, new Map([["submissions/u/a.png", await png(100, 180)]]));
    const { built, failures, manifest } = await publishCatalog(db, { log: quiet });

    expect(built).toEqual(["boss-ds1"]);
    expect(failures.map((f) => f.key)).toEqual(["missing"]);
    expect(items[1].needs_render).toBe(true);
    expect(manifest.pedals.map((p) => p.image)).toEqual(["boss-ds1"]);
  });

  it("doesn't clear the flag when the source changed during the build", async () => {
    const items = [item()];
    const sources = new Map([["submissions/u/a.png", await png(100, 180)]]);
    const db = fakeDb(items, sources);
    const download = db.storage.from("catalog-sources").download;
    db.storage.from = ((orig) => (bucket) => {
      const b = orig(bucket);
      if (bucket === "catalog-sources") b.download = async (p) => ((items[0].source_path = "submissions/u/b.png"), download(p));
      return b;
    })(db.storage.from);
    await publishCatalog(db, { log: quiet });
    expect(items[0].needs_render).toBe(true);
  });

  it("uploads nothing on a dry run", async () => {
    const db = fakeDb([item()], new Map([["submissions/u/a.png", await png(100, 180)]]));
    await publishCatalog(db, { dryRun: true, log: quiet });
    expect(db.uploads.size).toBe(0);
  });
});
