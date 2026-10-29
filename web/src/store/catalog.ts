import { create } from "zustand";
import { fetchManifest, type Manifest } from "../lib/catalog";

interface CatalogState {
  manifest: Manifest | null;
  error: string | null;
  /** Loads the manifest once; later calls return the same promise. */
  load: () => Promise<Manifest | null>;
}

let loading: Promise<Manifest | null> | null = null;

export const useCatalog = create<CatalogState>((set) => ({
  manifest: null,
  error: null,
  load: () =>
    (loading ??= fetchManifest()
      .then((manifest) => {
        set({ manifest });
        return manifest;
      })
      .catch((e: unknown) => {
        set({ error: e instanceof Error ? e.message : "Could not load the catalog." });
        loading = null; // allow a retry
        return null;
      })),
}));
