import { useMemo } from "react";
import { useCatalog } from "../store/catalog";
import { allowedPedalNames } from "./profanity";

/** Real pedal names the curse-word check lets through (some pedals have rude names), from the loaded catalog. */
export function useAllowedNames(): string[] {
  const manifest = useCatalog((s) => s.manifest);
  return useMemo(() => (manifest ? allowedPedalNames([...manifest.pedals, ...manifest.pedalboards]) : []), [manifest]);
}
