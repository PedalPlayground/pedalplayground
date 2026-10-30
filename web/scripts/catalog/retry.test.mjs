import { describe, expect, it } from "vitest";
import { withRetry } from "./retry.mjs";

const noWait = { sleep: async () => {} };

describe("withRetry", () => {
  it("returns the first success", async () => {
    let calls = 0;
    const r = await withRetry(async () => (++calls < 3 ? { error: { message: "busy" } } : { data: "ok", error: null }), noWait);
    expect(r).toEqual({ data: "ok", error: null });
    expect(calls).toBe(3);
  });

  it("gives up after the last try and returns its error", async () => {
    let calls = 0;
    const waits = [];
    const r = await withRetry(async () => (calls++, { error: { message: "busy" } }), { tries: 3, delayMs: 10, sleep: async (ms) => waits.push(ms) });
    expect(r.error.message).toBe("busy");
    expect(calls).toBe(3);
    expect(waits).toEqual([10, 20]);
  });
});
