import { describe, expect, it } from "vitest";
import { brandSpelling, brandSuggestions, catalogBrands, fieldProblems, possibleDuplicates, runChecks, sameBrand, type Fields } from "./editorChecks";
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
