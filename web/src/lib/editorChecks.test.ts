import { describe, expect, it } from "vitest";
import { brandSizes, brandSpelling, brandSuggestions, catalogBrands, copiedFields, copySources, fieldProblems, possibleDuplicates, runChecks, sameBrand, type Fields } from "./editorChecks";
import type { CatalogItem } from "./types";

const item = (brand: string, name: string, image: string, width = 2.9, height = 5.1): CatalogItem => ({ brand, name, image, width, height });
const catalog = [
  item("BOSS", "DS-1", "boss-ds1"),
  item("BOSS", "DS-1 Keeley Mod", "boss-ds-1-keeley"),
  item("BOSS", "RC-500", "boss-rc500", 6.8, 5.6),
  item("Ibanez", "TS9", "ibanez-ts9", 2.8, 4.9),
];
const ds1: Fields = { kind: "pedal", brand: "Boss", name: "DS-1", width: 2.9, height: 5.1 };

describe("possibleDuplicates", () => {
  it("matches the same brand when one name contains the other, ignoring case and punctuation", () => {
    expect(possibleDuplicates(ds1, catalog).map((d) => d.image)).toEqual(["boss-ds1", "boss-ds-1-keeley"]);
    expect(possibleDuplicates({ brand: "Ibanez", name: "DS-1" }, catalog)).toEqual([]);
  });

  it("leaves out the item being edited", () => {
    expect(possibleDuplicates(ds1, catalog, "boss-ds1").map((d) => d.image)).toEqual(["boss-ds-1-keeley"]);
  });
});

describe("sameBrand", () => {
  it("picks the closest sizes first", () => {
    expect(sameBrand(catalog, { brand: "boss", width: 6.5, height: 5.5 }, 2).map((d) => d.image)).toEqual(["boss-rc500", "boss-ds1"]);
  });
});

describe("runChecks", () => {
  it("passes a sharp, cut-out photo of the right shape", () => {
    const checks = runChecks({ ...ds1, name: "DS-2" }, { width: 580, height: 1020, hasAlpha: true }, catalog);
    expect(checks.every((c) => c.ok)).toBe(true);
  });

  it("flags low resolution, a wrong shape, a solid background and duplicates", () => {
    const checks = runChecks(ds1, { width: 200, height: 200, hasAlpha: false }, catalog);
    expect(checks.filter((c) => !c.ok).map((c) => c.text.split(":")[0])).toEqual([
      "Low resolution",
      "Photo shape doesn't match the size",
      "No transparent background",
      "Possible duplicate",
    ]);
  });
});

describe("fieldProblems", () => {
  it("requires a brand, a name and a sensible size", () => {
    expect(fieldProblems(ds1)).toEqual([]);
    expect(fieldProblems({ ...ds1, brand: " ", width: 0 })).toHaveLength(2);
    expect(fieldProblems({ ...ds1, ma: 1.5 })).toEqual(["Current draw must be 0 to 10,000 mA."]);
  });
});

describe("brands", () => {
  const items = [
    { brand: "Electro-Harmonix" },
    { brand: "Electro-Harmonix" },
    { brand: "electro harmonix" },
    { brand: "BOSS" },
    { brand: "Walrus Audio" },
    { brand: "JHS" },
  ];
  const brands = catalogBrands(items);

  it("lists each brand once, spelled the way most of its items are, most items first", () => {
    expect(brands).toEqual(["Electro-Harmonix", "BOSS", "JHS", "Walrus Audio"]);
  });

  it("suggests brands ignoring case, spaces and punctuation, starts-with first", () => {
    expect(brandSuggestions("electroh", brands)).toEqual(["Electro-Harmonix"]);
    expect(brandSuggestions("audio", brands)).toEqual(["Walrus Audio"]);
    expect(brandSuggestions("  ", brands)).toEqual([]);
  });

  it("points out a brand that's already in the catalog with another spelling", () => {
    expect(brandSpelling("Electro Harmonix", brands)).toBe("Electro-Harmonix");
    expect(brandSpelling("Electro-Harmonix", brands)).toBeNull();
    expect(brandSpelling("Chase Bliss", brands)).toBeNull();
  });
});

describe("copying sizes", () => {
  const walrus = (name: string, width: number, height: number, image = name.toLowerCase()): CatalogItem => ({ brand: "Walrus Audio", name, image, width, height, ma: 100, voltage: "9V DC", type: "Reverb" });
  const items = [
    walrus("Julia", 2.6, 4.8),
    walrus("Slö", 2.62, 4.81),
    walrus("Fable", 2.6, 4.8),
    walrus("ACS1", 4.8, 4.7),
    walrus("MAKO R1", 4.8, 4.7),
    walrus("Big One", 9, 9),
    item("BOSS", "DS-1", "boss-ds1"),
  ];

  it("groups a brand's sizes, most used first, leaving out one-offs", () => {
    expect(brandSizes(items, "walrus audio").map((s) => [s.width, s.height, s.count])).toEqual([
      [2.6, 4.8, 3],
      [4.8, 4.7, 2],
    ]);
    expect(brandSizes(items, "")).toEqual([]);
  });

  it("shows each size with its most used item, or the first by name without usage data", () => {
    expect(brandSizes(items, "walrus audio").map((s) => s.example.name)).toEqual(["Fable", "ACS1"]);
    const usage = (i: CatalogItem) => (i.name === "Julia" ? 12 : i.name === "MAKO R1" ? 3 : 0);
    expect(brandSizes(items, "walrus audio", 6, usage).map((s) => s.example.name)).toEqual(["Julia", "MAKO R1"]);
  });

  it("puts the most used items first in Copy From, after the brand's own", () => {
    const usage = (i: CatalogItem) => (i.name === "MAKO R1" ? 5 : 0);
    expect(copySources(items, "", "Walrus Audio", 2, usage).map((i) => i.name)).toEqual(["MAKO R1", "ACS1"]);
  });

  it("finds items to copy from, the brand's own first", () => {
    expect(copySources(items, "", "Walrus Audio").length).toBe(6);
    expect(copySources(items, "ds", "Walrus Audio").map((i) => i.image)).toEqual(["boss-ds1"]);
    expect(copySources(items, "julia", "")[0].name).toBe("Julia");
  });

  it("copies brand and size, and power and type only when asked", () => {
    expect(copiedFields(items[0], false)).toEqual({ brand: "Walrus Audio", width: 2.6, height: 4.8 });
    expect(copiedFields(items[0], true)).toMatchObject({ ma: 100, voltage: "9V DC", type: "Reverb" });
  });
});
