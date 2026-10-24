import type { Manifest } from "./catalog";

/**
 * Popular pedals with portrait proportions (the classics, shoegaze/Reddit favorites, TGP staples); one is
 * picked per visit to sit in the logo's icon.
 */
export const FEATURED_PEDALS = [
  "boss-ds1",
  "boss-bd2",
  "boss-sd1",
  "boss-dd3",
  "boss-ce2",
  "boss-bf2",
  "boss-ch1",
  "boss-dm2",
  "boss-tu3",
  "ibanez-ts9",
  "ibanez-ts808",
  "mxr-m101",
  "mxr-m102",
  "mxr-m169",
  "fulltone-ocd",
  "wampler-tumnus-deluxe",
  "ehx-green-russian",
  "ehx-nano-big-muff-pi",
  // Shoegaze / Reddit favorites
  "earthquaker-hizumitas",
  "earthquaker-afterneath-v3",
  "ehx-freeze",
  "ehx-nano-deluxe-memory-man",
  "ehx-holy-grail-neo",
  "walrus-julia2",
  "walrus-voyager-mk2",
  "chasebliss-mood-mk2",
  "chasebliss-generation-loss-mk2",
  "catalinbread-belle",
  "jhs-morning-glory-v4",
  "deathbyaudio-fuzz-war",
  "deathbyaudio-reverberation-machine",
  "zvex-fuzzfactory-vertical",
  // TGP staples
  "klon-ktr",
  "vemuram-janray",
  "xotic-bb",
  "wampler-pinnacle",
  "wayhuge-overratedspecial",
  "keeley-compressor",
  "mad-professor-forest-green",
];

/** The featured pedals present in the manifest with portrait proportions, in list order. */
export function usableFeaturedPedals(manifest: Manifest): string[] {
  return FEATURED_PEDALS.filter((key) => {
    const p = manifest.pedals.find((i) => i.image === key);
    return !!p && p.height > p.width && !!manifest.assets.pedals[key];
  });
}
