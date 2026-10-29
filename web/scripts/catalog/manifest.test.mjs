import { describe, expect, it } from "vitest";
import { manifestFromRows } from "./manifest.mjs";

const row = (over = {}) => ({
  kind: "pedal",
  key: "boss-ds1",
  brand: "BOSS",
  name: "DS-1",
  width_in: "2.875",
  height_in: "5.125",
  current_ma: null,
  voltage: null,
  type: null,
  status: "live",
  added_on: "2019-04-02",
  thumb_path: "thumb/boss-ds1.abcd1234.webp",
  img_path: "img/boss-ds1.abcd1234.webp",
  ...over,
});

describe("manifestFromRows", () => {
  it("matches the shape build.mjs writes", () => {
    const m = manifestFromRows([row({ current_ma: 10, voltage: "9V DC", type: "Distortion" })], "t");
    expect(m).toEqual({
      schema: 1,
      generatedAt: "t",
      pedals: [{ brand: "BOSS", name: "DS-1", width: 2.875, height: 5.125, image: "boss-ds1", ma: 10, voltage: "9V DC", type: "Distortion", added: "2019-04-02" }],
      pedalboards: [],
      assets: { pedals: { "boss-ds1": { thumb: "thumb/boss-ds1.abcd1234.webp", img: "img/boss-ds1.abcd1234.webp" } }, pedalboards: {} },
    });
  });

  it("leaves out optional specs that aren't set", () => {
    const [p] = manifestFromRows([row()]).pedals;
    expect(p).not.toHaveProperty("ma");
    expect(p).not.toHaveProperty("voltage");
    expect(p).not.toHaveProperty("type");
  });

  it("keeps retired items' images but drops them from search", () => {
    const m = manifestFromRows([row({ status: "retired" })]);
    expect(m.pedals).toEqual([]);
    expect(m.assets.pedals["boss-ds1"]).toBeDefined();
  });

  it("skips items that haven't been built yet", () => {
    const m = manifestFromRows([row({ img_path: null })]);
    expect(m.pedals).toEqual([]);
    expect(m.assets.pedals).toEqual({});
  });

  it("files pedalboards separately", () => {
    const m = manifestFromRows([row({ kind: "pedalboard", key: "pedaltrain-classic-2" })]);
    expect(m.pedals).toEqual([]);
    expect(m.pedalboards.map((p) => p.image)).toEqual(["pedaltrain-classic-2"]);
  });
});
