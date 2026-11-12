import { describe, expect, it } from "vitest";
import { jackLabel, jacksFor, matchingJack } from "./jacks";

describe("jack labels", () => {
  it("flattens the tree with roles and kinds", () => {
    expect(jackLabel("output.stereo.y")).toMatchObject({ group: "Output", label: "Stereo · TRS to dual Mono (Y-split)", role: "out", kinds: ["stereo"] });
    expect(jackLabel("send.mono.left")?.role).toBe("out");
    expect(jackLabel("exp.in")).toMatchObject({ role: "in", kinds: ["exp"] });
    expect(jackLabel("power.out")?.role).toBe("out");
  });

  it("offers the labels that fit a cable type", () => {
    const power = jacksFor("power").map((j) => j.id);
    expect(power).toEqual(["power.out", "power.in", "power.4-24v"]);
    expect(jacksFor("mono").some((j) => j.id === "output.wet")).toBe(true);
    expect(jacksFor("mono").some((j) => j.id.includes("stereo"))).toBe(false);
  });

  it("pairs an end with its usual other end", () => {
    expect(matchingJack("output.mono.left")).toBe("input.mono.left");
    expect(matchingJack("output.wet")).toBe("input");
    expect(matchingJack("midi-thru")).toBe("midi-in");
    expect(matchingJack("exp.out")).toBe("exp.in");
    expect(matchingJack("tap")).toBeUndefined();
  });
});
