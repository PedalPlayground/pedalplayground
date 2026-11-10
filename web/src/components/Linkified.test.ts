import { describe, expect, it } from "vitest";
import { linkParts } from "./Linkified";

describe("linkParts", () => {
  it("links http(s) and www addresses, leaving trailing punctuation out", () => {
    expect(linkParts("See https://boss.info/ds-1. Also www.example.com/x, ok")).toEqual([
      { text: "See " },
      { text: "https://boss.info/ds-1", href: "https://boss.info/ds-1" },
      { text: ". Also " },
      { text: "www.example.com/x", href: "https://www.example.com/x" },
      { text: ", ok" },
    ]);
  });
  it("leaves text without links alone", () => {
    expect(linkParts("no links here")).toEqual([{ text: "no links here" }]);
  });
  it("doesn't link other schemes", () => {
    expect(linkParts("javascript:alert(1)")).toEqual([{ text: "javascript:alert(1)" }]);
  });
});
