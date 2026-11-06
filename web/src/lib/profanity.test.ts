import { describe, expect, it } from "vitest";
import { allowedPedalNames, hasProfanity, usernameOffensive } from "./profanity";

describe("profanity", () => {
  it("catches curse words, leetspeak and run-together words", () => {
    expect(hasProfanity("my shit board")).toBe(true);
    expect(hasProfanity("Sh1t Show")).toBe(true);
    expect(hasProfanity("fuckingloud")).toBe(true);
  });

  it("leaves ordinary words alone, including ones with short curse words inside", () => {
    expect(hasProfanity("Bass board with a Cocktail Party delay")).toBe(false);
    expect(hasProfanity("Dickens-style tones")).toBe(false);
    expect(hasProfanity("big ass fuzz")).toBe(true);
  });

  it("lets real pedal names through", () => {
    const allowed = allowedPedalNames([{ brand: "Acme", name: "Shit Storm Fuzz" }, { brand: "BOSS", name: "DS-1" }]);
    expect(allowed).toEqual(["acme shit storm fuzz", "shit storm fuzz"]);
    expect(hasProfanity("Running the Shit Storm Fuzz into a DS-1", allowed)).toBe(false);
    expect(hasProfanity("this board is shit", allowed)).toBe(true);
  });

  it("checks usernames like the database does", () => {
    expect(usernameOffensive("tone_sh1t")).toBe(true);
    expect(usernameOffensive("big-dick")).toBe(true);
    expect(usernameOffensive("dickens_fan")).toBe(false);
    expect(usernameOffensive("bassist")).toBe(false);
  });
});
