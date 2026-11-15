import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sourceBase, sourcePath, uploadNamedSource } from "./sourceNames";

describe("sourceBase", () => {
  it("joins brand and name, lowercase and hyphenated", () => {
    expect(sourceBase("Electro-Harmonix", "Big Muff Pi")).toBe("electro-harmonix-big-muff-pi");
  });
  it("drops accents, apostrophes and punctuation and collapses hyphens", () => {
    expect(sourceBase("Pédales  Ölé!", "Fuzz -- (V2)")).toBe("pedales-ole-fuzz-v2");
    expect(sourceBase("Devi Ever’s", "Soda Meiser")).toBe("devi-evers-soda-meiser");
  });
  it("falls back when nothing is left", () => {
    expect(sourceBase("", "???")).toBe("photo");
  });
});

describe("uploadNamedSource", () => {
  const client = (taken: Set<string>) => {
    const upload = vi.fn(async (path: string, _file?: Blob, _opts?: { upsert: boolean }) =>
      taken.has(path) ? { error: { message: "The resource already exists", statusCode: "409" } } : { error: null },
    );
    return { db: { storage: { from: () => ({ upload }) } } as unknown as SupabaseClient, upload };
  };
  const png = new Blob(["x"], { type: "image/png" });

  it("uses the plain name when it's free", async () => {
    const { db } = client(new Set());
    expect(await uploadNamedSource(db, png, "u1", "Boss", "DS-1")).toBe("submissions/u1/boss-ds-1.png");
  });
  it("adds a number instead of replacing a photo", async () => {
    const { db, upload } = client(new Set([sourcePath("u1", "boss-ds-1", "png"), sourcePath("u1", "boss-ds-1", "png", 2)]));
    expect(await uploadNamedSource(db, png, "u1", "Boss", "DS-1")).toBe("submissions/u1/boss-ds-1-3.png");
    expect(upload.mock.calls.every((c) => c[2]?.upsert === false)).toBe(true);
  });
  it("passes other errors through", async () => {
    const upload = vi.fn(async () => ({ error: { message: "Payload too large", statusCode: "413" } }));
    const db = { storage: { from: () => ({ upload }) } } as unknown as SupabaseClient;
    await expect(uploadNamedSource(db, png, "u1", "Boss", "DS-1")).rejects.toThrow("Payload too large");
  });
});
