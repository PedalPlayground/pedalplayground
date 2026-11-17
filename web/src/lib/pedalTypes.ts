import { create } from "zustand";
import { PEDAL_TYPES } from "./specs";

/**
 * The pedal types, in order. Admins edit them in Admin > Types (the pedal_types table), and the publish copies them
 * into catalog.json, so the list arrives with the catalog. Until it does (or when catalog.json has none), it's the
 * built-in list in specs.ts.
 */
export const usePedalTypes = create<{ types: readonly string[] }>(() => ({ types: PEDAL_TYPES }));

export function setPedalTypes(types: readonly string[] | null | undefined) {
  if (!types?.length) return;
  const now = usePedalTypes.getState().types;
  if (now.length === types.length && now.every((t, i) => t === types[i])) return;
  usePedalTypes.setState({ types: [...types] });
}
