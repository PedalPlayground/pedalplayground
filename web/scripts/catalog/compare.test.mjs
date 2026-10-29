import { describe, expect, it } from "vitest";
import { compareManifests, report } from "./compare.mjs";

const e = (brand, name, image, width = 2.5, height = 4.5) => ({ brand, name, image, width, height });
const manifest = (pedals, keys) => ({
  schema: 1,
  pedals,
  pedalboards: [],
  assets: { pedals: Object.fromEntries(keys.map((k) => [k, { thumb: `thumb/${k}.webp`, img: `img/${k}.webp` }])), pedalboards: {} },
});

describe("compareManifests", () => {
  it("finds nothing wrong when only rounding and moved keys differ", () => {
    const oldM = manifest([e("BOSS", "DS-1", "ds1"), e("BOSS", "DS-1 Mod", "ds1"), e("BOSS", "CE-20", "ce20", 6.8125, 6.1)], ["ds1", "ce20"]);
    const newM = manifest([e("BOSS", "DS-1", "ds1"), e("BOSS", "DS-1 Mod", "boss-ds-1-mod"), e("BOSS", "CE-20", "ce20", 6.813, 6.1)], [
      "ds1",
      "boss-ds-1-mod",
      "ce20",
    ]);
    const cmp = compareManifests(oldM, newM);
    expect(cmp.lostImages).toEqual([]);
    expect(cmp.missingEntries).toEqual([]);
    expect(cmp.changedEntries).toEqual([{ list: "pedals", image: "ds1", name: "BOSS DS-1 Mod", diffs: ["key ds1 -> boss-ds-1-mod"] }]);
    expect(cmp.newEntries).toEqual([]);
  });

  it("reports lost images, missing entries, size changes and new entries", () => {
    const oldM = manifest([e("A", "One", "a"), e("B", "Two", "b")], ["a", "b", "retired"]);
    const newM = manifest([e("A", "One", "a", 3, 4.5), e("C", "Three", "c")], ["a", "c"]);
    const cmp = compareManifests(oldM, newM);
    expect(cmp.lostImages.map((x) => x.key)).toEqual(["b", "retired"]);
    expect(cmp.missingEntries.map((x) => x.image)).toEqual(["b"]);
    expect(cmp.changedEntries[0].diffs).toEqual(["size 2.5x4.5 -> 3x4.5"]);
    expect(cmp.newEntries.map((x) => x.image)).toEqual(["c"]);
    expect(report(cmp, [{ list: "pedals", key: "a", diff: 1, oldEdge: 500, newEdge: 1200 }])).toMatch(/1 sharper/);
  });
});
