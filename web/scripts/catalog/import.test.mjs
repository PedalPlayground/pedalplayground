import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chooseSource, importCatalog, planImport, sourcePath, summarize } from "./import.mjs";

const entry = (Brand, Name, Image, Width = 2.5, Height = 4.5) => ({ Brand, Name, Width, Height, Image });

describe("planImport", () => {
  it("keeps image keys, and gives later entries that share an image their own key", () => {
    const plan = planImport([
      entry("BOSS", "DS-1", "boss-ds1.png"),
      entry("BOSS", "DS-1 Keeley Mod", "boss-ds1.png"),
      entry("Ibanez", "TS9", "ibanez-ts9"),
    ]);
    expect(plan.map((p) => [p.key, p.imageKey])).toEqual([
      ["boss-ds1", "boss-ds1"],
      ["boss-ds-1-keeley-mod", "boss-ds1"],
      ["ibanez-ts9", "ibanez-ts9"],
    ]);
  });

  it("never hands out a key another entry's image already uses", () => {
    const plan = planImport([
      entry("BOSS", "DS-1", "boss-ds-1.png"),
      entry("BOSS", "DS-1", "boss-ds-1.png"),
      entry("BOSS", "DS-1 Black", "boss-ds-1-2.png"),
    ]);
    expect(plan.map((p) => p.key)).toEqual(["boss-ds-1", "boss-ds-1-3", "boss-ds-1-2"]);
  });

  it("takes each entry's date from the same line of git blame", () => {
    const plan = planImport([entry("A", "One", "a.png"), entry("B", "Two", "b.png")], [
      { key: "a", date: "2020-01-02" },
      { key: "wrong", date: "2021-01-01" },
    ]);
    expect(plan.map((p) => p.added_on)).toEqual(["2020-01-02", null]);
  });
});

describe("sourcePath", () => {
  it("is stable and keeps keys that slugify alike apart", () => {
    expect(sourcePath("pedal", "boss-ds1")).toBe(sourcePath("pedal", "boss-ds1"));
    expect(sourcePath("pedal", "Boss_DS1")).not.toBe(sourcePath("pedal", "boss-ds1"));
    expect(sourcePath("pedal", "boss-ds1")).toMatch(/^import\/pedal\/boss-ds1-[0-9a-f]{6}\.webp$/);
  });
});

// A test photo: a coloured block on transparency, so "same photo" and "different photo" are easy to make.
const photo = (w, h, { r = 200, g = 0, b = 0, flip = false } = {}) =>
  sharp({ create: { width: w, height: h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([
      {
        input: { create: { width: Math.round(w / 2), height: h, channels: 4, background: { r, g, b, alpha: 1 } } },
        left: flip ? w - Math.round(w / 2) : 0,
        top: 0,
      },
    ])
    .png()
    .toBuffer();

let tmp;
const write = async (rel, buf) => {
  const p = path.join(tmp, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, await buf);
  return p;
};

beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "catalog-import-"));
});
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe("chooseSource", () => {
  it("uses the app/ original when it's bigger and the same photo", async () => {
    const a = await write("c1/a.png", photo(100, 180));
    const b = await write("c1/b.png", photo(400, 720));
    expect(await chooseSource(a, b)).toEqual({ file: b, from: "app" });
  });

  it("keeps the repo image when the original is smaller, missing, a different shape or a different photo", async () => {
    const a = await write("c2/a.png", photo(200, 360));
    expect((await chooseSource(a, await write("c2/small.png", photo(100, 180)))).from).toBe("public");
    expect((await chooseSource(a, path.join(tmp, "c2/none.png"))).from).toBe("public");
    expect((await chooseSource(a, null)).from).toBe("public");
    const wide = await chooseSource(a, await write("c2/wide.png", photo(400, 400)));
    expect(wide).toMatchObject({ from: "public", reason: expect.stringMatching(/shape/) });
    const other = await chooseSource(a, await write("c2/other.png", photo(400, 720, { flip: true })));
    expect(other).toMatchObject({ from: "public", reason: expect.stringMatching(/looks different/) });
  });
});

/** A stand-in for the parts of supabase-js the importer uses. */
function fakeDb(existing = []) {
  const rows = [...existing];
  const events = [];
  return {
    rows,
    events,
    from: () => {
      let filters = [];
      const q = {
        select: () => q,
        order: () => q,
        eq: (col, val) => ((filters = [...filters, (r) => r[col] === val]), q),
        range: async (a, b) => ({ data: rows.filter((r) => filters.every((f) => f(r))).slice(a, b + 1), error: null }),
        upsert: async (batch, { ignoreDuplicates }) => {
          for (const r of batch) {
            const i = rows.findIndex((x) => x.kind === r.kind && x.key === r.key);
            if (i < 0) rows.push(r);
            else if (!ignoreDuplicates) rows[i] = { ...rows[i], ...r };
            events.push(`row ${r.kind}/${r.key}`);
          }
          return { error: null };
        },
      };
      return q;
    },
    storage: {
      from: (bucket) => ({
        upload: async (p, body, opts) => (events.push(`upload ${bucket}/${p}`), (fakeDb.bodies[p] = { body, opts }), { error: null }),
      }),
    },
  };
}
fakeDb.bodies = {};

describe("importCatalog", () => {
  let src;
  let app;
  beforeAll(async () => {
    src = path.join(tmp, "public");
    app = path.join(tmp, "app");
    const pedals = [
      entry("BOSS", "DS-1", "boss-ds1.png"),
      entry("BOSS", "DS-1 Keeley", "boss-ds1.png"),
      entry("Gone", "Pedal", "gone.png"),
      entry("Ibanez", "TS9", "ibanez-ts9.png", 2.8125, 4.9),
    ];
    await write("public/data/pedals.json", JSON.stringify(pedals));
    await write("public/data/pedalboards.json", JSON.stringify([entry("Pedaltrain", "Nano", "pt-nano.png", 14, 5.5)]));
    await write("public/images/pedals/boss-ds1.png", photo(100, 180));
    await write("public/images/pedals/ibanez-ts9.png", photo(100, 180, { g: 200 }));
    await write("public/images/pedalboards/pt-nano.png", photo(280, 110));
    await write("app/boss-ds1.png", photo(2000, 3600)); // sharper, bigger than the canvas
  });

  it("imports every entry, one source per image, rows after their sources", async () => {
    const db = fakeDb();
    const report = await importCatalog(db, { src, app, log: { log() {}, error() {} } });

    expect(report.imported).toEqual({ pedal: 4, pedalboard: 1 });
    expect(report.fromApp).toBe(1);
    expect(report.missingImage.map((m) => m.key)).toEqual(["gone"]);
    expect(report.renamed.map((m) => m.key)).toEqual(["boss-ds-1-keeley"]);
    expect(report.failed).toEqual([]);

    const ds1 = db.rows.find((r) => r.key === "boss-ds1");
    const keeley = db.rows.find((r) => r.key === "boss-ds-1-keeley");
    expect(keeley.source_path).toBe(ds1.source_path);
    expect(db.events.filter((e) => e.startsWith("upload")).length).toBe(3);
    expect(db.events.indexOf(`upload catalog-sources/${ds1.source_path}`)).toBeLessThan(db.events.indexOf("row pedal/boss-ds1"));

    const gone = db.rows.find((r) => r.key === "gone");
    expect(gone).toMatchObject({ source_path: null, needs_render: false });
    expect(db.rows.find((r) => r.key === "ibanez-ts9")).toMatchObject({ width_in: 2.8125, needs_render: true });

    // The sharper original, shrunk to the canvas size and stored losslessly.
    const meta = await sharp(fakeDb.bodies[ds1.source_path].body).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(["webp", 667, 1200]);
    expect(summarize(report)).toMatch(/Imported 4 pedals and 1 pedalboards/);
  });

  it("skips items already imported, and respects the limit", async () => {
    const db = fakeDb([{ kind: "pedal", key: "boss-ds1", brand: "edited" }]);
    const report = await importCatalog(db, { src, app, limit: 2, log: { log() {}, error() {} } });
    expect(report.skippedExisting).toBe(1);
    expect(report.imported).toEqual({ pedal: 2, pedalboard: 0 });
    expect(db.rows.find((r) => r.key === "boss-ds1").brand).toBe("edited");
  });

  it("writes nothing on a dry run", async () => {
    const db = fakeDb();
    const report = await importCatalog(db, { src, app, dryRun: true, log: { log() {}, error() {} } });
    expect(db.events).toEqual([]);
    expect(report.imported.pedal).toBe(4);
  });
});
