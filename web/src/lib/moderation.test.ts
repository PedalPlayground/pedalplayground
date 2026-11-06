import { describe, expect, it } from "vitest";
import { moderationError, suggestedAction, type Flag } from "./moderation";

const day = 24 * 3600 * 1000;
const now = Date.UTC(2026, 10, 6);
const flag = (daysAgo: number, lifted = false): Flag => ({
  id: String(daysAgo),
  reason: "spam",
  note: "",
  action: "warning",
  ends_at: null,
  created_at: new Date(now - daysAgo * day).toISOString(),
  lifted_at: lifted ? new Date(now).toISOString() : null,
});

describe("suggestedAction", () => {
  it("steps up from a warning to a 7-day timeout to a ban", () => {
    expect(suggestedAction([], now)).toEqual({ action: "warning" });
    expect(suggestedAction([flag(10)], now)).toEqual({ action: "timeout", days: 7 });
    expect(suggestedAction([flag(10), flag(40)], now)).toEqual({ action: "ban" });
  });

  it("only counts flags from the last 90 days that weren't lifted", () => {
    expect(suggestedAction([flag(120), flag(5, true)], now)).toEqual({ action: "warning" });
  });
});

describe("moderationError", () => {
  it("turns the database's codes into plain messages", () => {
    expect(moderationError("account_restricted")).toBe("Your account is in a timeout.");
    expect(moderationError("username_not_allowed")).toBe("Please pick a different username.");
  });
});
