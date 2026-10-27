import { create } from "zustand";
import {
  createPlayground,
  deletePlayground,
  renamePlayground,
  DuplicateNameError,
  fetchLatestDocument,
  fetchShared,
  insertVersion,
  PlaygroundLimitError,
  listPlaygrounds,
  sharePlayground,
  touchPlayground,
  unsharePlayground,
  type PlaygroundSummary,
} from "../lib/cloud";
import { renderThumbnail } from "../lib/thumbnail";
import { supabase } from "../lib/supabase";
import { useAuth } from "./auth";
import { useBilling } from "./billing";
import { usePlayground } from "./playground";

const META_KEY = "pp:cloud-meta";
const AUTOSAVE_DEBOUNCE_MS = 1500;

/** "limit": the plan has no room for another playground, so this board is saved on this device only. */
export type SaveStatus = "idle" | "saving" | "saved" | "error" | "limit";

interface Meta {
  /** Cloud row for the playground on the canvas, once it has been saved. */
  cloudId: string | null;
  /** Who `cloudId` belongs to, so a different account never writes to it. */
  ownerId: string | null;
  slug: string | null;
  isPublic: boolean;
  /** Set when the canvas was opened from a shared link; the first save records the fork. */
  forkedFromId: string | null;
}

const EMPTY_META: Meta = { cloudId: null, ownerId: null, slug: null, isPublic: false, forkedFromId: null };

const readMeta = (): Meta => {
  try {
    return { ...EMPTY_META, ...JSON.parse(localStorage.getItem(META_KEY) ?? "{}") };
  } catch {
    return EMPTY_META;
  }
};

interface CloudState extends Meta {
  status: SaveStatus;
  error: string | null;
  list: PlaygroundSummary[];

  refreshList: () => Promise<void>;
  saveNow: () => Promise<void>;
  openPlayground: (id: string) => Promise<void>;
  newPlayground: () => void;
  /** Renames the open playground, or another saved one when `id` is given. Returns an error message or null. */
  rename: (name: string, id?: string) => Promise<string | null>;
  share: () => Promise<string>;
  stopSharing: () => Promise<void>;
  remove: (id: string) => Promise<void>;
  /** Makes a saved playground public (anyone with the link can open a copy) or private again. */
  setVisibility: (id: string, isPublic: boolean) => Promise<void>;
  openShared: (slug: string) => Promise<boolean>;
}

/** What was last persisted (or loaded), so we only save real changes. */
let lastSavedKey = "";
let saving = false;
let saveAgain = false;

const contentKey = () => {
  const { name, items, signal } = usePlayground.getState();
  return JSON.stringify({ name, items, signal });
};

export const useCloud = create<CloudState>((set, get) => {
  const setMeta = (patch: Partial<Meta>) => {
    set(patch);
    const { cloudId, ownerId, slug, isPublic, forkedFromId } = get();
    try {
      localStorage.setItem(META_KEY, JSON.stringify({ cloudId, ownerId, slug, isPublic, forkedFromId }));
    } catch {
      /* storage unavailable */
    }
  };

  return {
    ...readMeta(),
    status: "idle",
    error: null,
    list: [],

    refreshList: async () => {
      const user = useAuth.getState().user;
      if (!supabase || !user) return set({ list: [] });
      try {
        set({ list: await listPlaygrounds(user.id) });
      } catch (e) {
        set({ error: e instanceof Error ? e.message : "Could not load playgrounds." });
      }
    },

    saveNow: async () => {
      const user = useAuth.getState().user;
      if (!supabase || !user) return;
      if (saving) {
        saveAgain = true;
        return;
      }
      const key = contentKey();
      if (key === lastSavedKey) return;

      saving = true;
      set({ status: "saving", error: null });
      try {
        const pg = usePlayground.getState();
        const doc = pg.toDocument();
        const thumbnail = await renderThumbnail(pg.items);
        const meta = get();
        let id = meta.ownerId === user.id ? meta.cloudId : null;

        if (!id) {
          const row = await createPlayground(user.id, pg.name, meta.forkedFromId, thumbnail);
          id = row.id;
          if (row.name !== pg.name) usePlayground.getState().setName(row.name);
          setMeta({ cloudId: id, ownerId: user.id, forkedFromId: null, slug: null, isPublic: false });
          void useBilling.getState().refresh(); // the playground count changed
        } else {
          await touchPlayground(id, pg.name, thumbnail);
        }
        await insertVersion(id, doc);

        lastSavedKey = contentKey();
        set({ status: "saved" });
        void get().refreshList();
      } catch (e) {
        if (e instanceof PlaygroundLimitError) {
          set({ status: "limit", error: e.message });
          void useBilling.getState().refresh();
        } else {
          set({ status: "error", error: e instanceof Error ? e.message : "Cloud save failed." });
        }
      } finally {
        saving = false;
        if (saveAgain) {
          saveAgain = false;
          void get().saveNow();
        }
      }
    },

    openPlayground: async (id) => {
      const doc = await fetchLatestDocument(id);
      const row = get().list.find((p) => p.id === id);
      usePlayground.getState().loadDocument(doc, { undoable: true });
      if (row) usePlayground.getState().setName(row.name);
      lastSavedKey = contentKey();
      setMeta({
        cloudId: id,
        ownerId: useAuth.getState().user?.id ?? null,
        slug: row?.slug ?? null,
        isPublic: row?.is_public ?? false,
        forkedFromId: null,
      });
      set({ status: "idle" });
    },

    newPlayground: () => {
      usePlayground.getState().reset();
      lastSavedKey = contentKey();
      setMeta({ ...EMPTY_META });
      set({ status: "idle" });
    },

    rename: async (name, id) => {
      const trimmed = name.trim();
      if (!trimmed) return "Name can't be empty.";
      const { cloudId, ownerId } = get();
      if (id && id !== cloudId) {
        try {
          await renamePlayground(id, trimmed);
        } catch (e) {
          return e instanceof DuplicateNameError ? e.message : "Could not rename that playground.";
        }
        await get().refreshList();
        return null;
      }
      const user = useAuth.getState().user;
      if (supabase && user && cloudId && ownerId === user.id) {
        try {
          await touchPlayground(cloudId, trimmed, null);
        } catch (e) {
          return e instanceof DuplicateNameError ? e.message : "Could not rename in the cloud.";
        }
        void get().refreshList();
      }
      usePlayground.getState().setName(trimmed);
      return null;
    },

    share: async () => {
      await get().saveNow();
      const { cloudId } = get();
      if (!cloudId) throw new Error("Sign in to share a playground.");
      const slug = await sharePlayground(cloudId);
      setMeta({ slug, isPublic: true });
      void get().refreshList();
      return slug;
    },

    stopSharing: async () => {
      const { cloudId } = get();
      if (!cloudId) return;
      await unsharePlayground(cloudId);
      setMeta({ isPublic: false });
      void get().refreshList();
    },

    setVisibility: async (id, isPublic) => {
      if (id === get().cloudId) {
        if (isPublic) await get().share();
        else await get().stopSharing();
        return;
      }
      if (isPublic) await sharePlayground(id);
      else await unsharePlayground(id);
      await get().refreshList();
    },

    remove: async (id) => {
      await deletePlayground(id);
      // Deleting the open playground also clears the canvas. Leaving its content behind would make the
      // sign-in sync upload it again as a new playground on the next load. (Clearing is undoable until reload.)
      if (get().cloudId === id) get().newPlayground();
      await get().refreshList();
      void useBilling.getState().refresh();
    },

    /** Opens a shared playground as an unsaved fork; the first edit saves it as the viewer's own. */
    openShared: async (slug) => {
      const shared = await fetchShared(slug);
      if (!shared) return false;
      usePlayground.getState().loadDocument(shared.doc, { undoable: true });
      usePlayground.getState().setName(`${shared.name} (fork)`);
      lastSavedKey = contentKey();
      setMeta({ ...EMPTY_META, forkedFromId: shared.id });
      set({ status: "idle" });
      return true;
    },
  };
});

/**
 * Wires cloud sync: autosave on edits, and reconciles local vs cloud state when the user signs in.
 * Call after restorePlayground(). Returns a cleanup function.
 */
export function startCloudSync() {
  lastSavedKey = contentKey();
  let timer: ReturnType<typeof setTimeout> | undefined;

  const unsubPlayground = usePlayground.subscribe((s, prev) => {
    if (s.items === prev.items && s.signal === prev.signal && s.name === prev.name) return;
    if (!useAuth.getState().user) return;
    clearTimeout(timer);
    timer = setTimeout(() => void useCloud.getState().saveNow(), AUTOSAVE_DEBOUNCE_MS);
  });

  let lastUserId: string | null = null;
  const onAuth = async () => {
    const user = useAuth.getState().user;
    if (!user || user.id === lastUserId) {
      if (!user) {
        lastUserId = null;
        useCloud.setState({ list: [] });
        useBilling.getState().clear();
      }
      return;
    }
    lastUserId = user.id;

    const cloud = useCloud.getState();
    if (cloud.ownerId && cloud.ownerId !== user.id) {
      useCloud.setState({ ...EMPTY_META });
    }
    await Promise.all([useCloud.getState().refreshList(), useBilling.getState().refresh()]);

    const { cloudId, list } = useCloud.getState();
    const { items } = usePlayground.getState();
    if (cloudId) return;
    if (items.length === 0 && list.length > 0) {
      await useCloud.getState().openPlayground(list[0].id); // new device: pick up where they left off
    } else if (items.length > 0) {
      lastSavedKey = ""; // local work from before sign-in: upload it
      void useCloud.getState().saveNow();
    }
  };

  const unsubAuth = useAuth.subscribe(() => void onAuth());
  void onAuth();

  return () => {
    clearTimeout(timer);
    unsubPlayground();
    unsubAuth();
  };
}
