import { create } from "zustand";
import {
  createPlayground,
  deletePlayground,
  deleteShareImage,
  renamePlayground,
  setInGallery as setPlaygroundInGallery,
  DuplicateNameError,
  fetchLatestDocument,
  fetchShared,
  insertVersion,
  PlaygroundLimitError,
  listPlaygrounds,
  setThumbnail,
  sharePlayground,
  touchPlayground,
  unsharePlayground,
  updateDetails,
  uploadBoardThumbnail,
  uploadShareImage,
  type PlaygroundDetails,
  type PlaygroundSummary,
} from "../lib/cloud";
import { boardViewFrom, track } from "../lib/analytics";
import { renderThumbnail, renderThumbnailFile } from "../lib/thumbnail";
import { renderShareImage } from "../lib/shareImage";
import { supabase } from "../lib/supabase";
import { useAuth } from "./auth";
import { useBilling } from "./billing";
import { DEFAULT_NAME, restorePlayground, usePlayground } from "./playground";
import { useUi } from "./ui";

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
  /** Type and genres picked in the New Playground dialog, stored with the playground when its first save creates it. */
  pendingDetails: PlaygroundDetails | null;
}

const EMPTY_META: Meta = { cloudId: null, ownerId: null, slug: null, isPublic: false, forkedFromId: null, pendingDetails: null };

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
  /** Starts a fresh playground, optionally named and described from the New Playground dialog. */
  newPlayground: (start?: { name: string; details: PlaygroundDetails }) => void;
  /** Renames the open playground, or another saved one when `id` is given. Returns an error message or null. */
  rename: (name: string, id?: string) => Promise<string | null>;
  share: () => Promise<string>;
  stopSharing: () => Promise<void>;
  remove: (id: string) => Promise<void>;
  /** Shares a saved playground (the open one or another) and returns its link's slug. */
  shareById: (id: string) => Promise<string>;
  /** Adds a saved playground to the public gallery (sharing it too) or takes it out (any share link keeps working). */
  setInGallery: (id: string, inGallery: boolean) => Promise<void>;
  /** Opens a shared playground view-only (or the user's own, normally). False when the link isn't shared. */
  openShared: (slug: string) => Promise<boolean>;
  /** Closes the shared playground and brings back the user's own board. */
  leaveShared: () => void;
  /** Turns the shared playground being viewed into the user's own copy (Pro; the caller checks). */
  copyShared: () => void;
}

/** Removes `?p=` once the shared playground is copied or left, so a reload doesn't reopen it. */
function clearSharedParam() {
  const params = new URLSearchParams(window.location.search);
  if (!params.has("p")) return;
  params.delete("p");
  const qs = params.toString();
  window.history.replaceState(null, "", window.location.pathname + (qs ? `?${qs}` : ""));
}

/** Opening or starting another playground leaves the shared one without restoring the old board first. */
function endViewing() {
  if (!useUi.getState().viewing) return;
  useUi.getState().setViewing(null);
  clearSharedParam();
}

/**
 * How long a shared playground's edits settle before its link preview is redrawn. Long enough that a board being
 * worked on isn't re-uploaded over and over; leaving the page or switching boards redraws it right away.
 */
const SHARE_IMAGE_DEBOUNCE_MS = 120_000;
let shareImageTimer: ReturnType<typeof setTimeout> | undefined;
let shareImageKey = "";
/** The slug whose preview is waiting on the timer, if any. */
let shareImagePending: string | null = null;

/**
 * Redraws the open playground's link preview (the image social sites and chat apps show for its share link) and
 * uploads it. Best effort: a failure just leaves the previous image, or the site's default one.
 */
async function updateShareImage(slug: string) {
  clearTimeout(shareImageTimer);
  shareImagePending = null;
  // The canvas must still hold this playground (not another one opened since, or someone else's shared board).
  const { slug: openSlug, isPublic, cloudId } = useCloud.getState();
  if (openSlug !== slug || !isPublic || useUi.getState().viewing) return;
  const { items } = usePlayground.getState();
  if (!cloudId || !inCloud(cloudId, items)) return;
  const key = `${slug}:${contentKey()}`;
  if (key === shareImageKey) return;
  try {
    const image = await renderShareImage(items);
    if (!image) return;
    await uploadShareImage(slug, image);
    shareImageKey = key;
  } catch (e) {
    console.warn("Could not update the share preview image.", e);
  }
}

/** After a save of a shared playground, redraws its preview once the edits settle. */
function scheduleShareImage(slug: string) {
  clearTimeout(shareImageTimer);
  shareImagePending = slug;
  shareImageTimer = setTimeout(() => void updateShareImage(slug), SHARE_IMAGE_DEBOUNCE_MS);
}

/** Redraws a waiting link preview now (before the canvas changes to another board, or the page is left). */
function flushShareImage(): Promise<void> {
  return shareImagePending ? updateShareImage(shareImagePending) : Promise.resolve();
}

/**
 * The list thumbnail is the largest thing a save writes (and every list load reads), so it's sent at most once a
 * minute while editing, plus whenever the user leaves the page or switches boards.
 */
const THUMBNAIL_INTERVAL_MS = 60_000;
/** Which playground and layout the stored thumbnail shows, and when it was sent. */
let thumbSent: { id: string; key: string } | null = null;
let thumbSentAt = 0;
let thumbTimer: ReturnType<typeof setTimeout> | undefined;

const itemsKey = (items: unknown) => JSON.stringify(items);

/**
 * The layout last saved to (or loaded from) a cloud playground. A thumbnail or link preview is only ever drawn from
 * the layout stored in that same playground, so a board that isn't the user's (a shared board, or a stale copy left
 * in this device's storage) can never become another playground's picture.
 */
let cloudCopy: { id: string; key: string } | null = null;
const inCloud = (id: string, items: unknown) => cloudCopy?.id === id && cloudCopy.key === itemsKey(items);

/** Records that the stored thumbnail matches this layout (after a send, or when a saved board is opened). */
function markThumbnail(id: string, items: unknown, sentNow: boolean) {
  thumbSent = { id, key: itemsKey(items) };
  if (sentNow) thumbSentAt = Date.now();
  clearTimeout(thumbTimer);
  thumbTimer = undefined;
}

/**
 * A playground's thumbnail for its row: the 2× file's URL once uploaded, or the small inline picture if the upload
 * fails (say, before the board_thumbnails migration). Null when there's nothing to draw.
 */
async function boardThumbnail(id: string, items: Parameters<typeof renderThumbnail>[0]): Promise<string | null> {
  try {
    const file = await renderThumbnailFile(items);
    if (file) return await uploadBoardThumbnail(id, file);
  } catch (e) {
    console.warn("Could not upload the playground thumbnail; storing the small one.", e);
  }
  return renderThumbnail(items);
}

/**
 * For a save of playground `id`: the thumbnail to send with it, or undefined to leave the stored one alone, either
 * because the layout looks the same or one was sent less than a minute ago (then a send is scheduled for later).
 */
async function thumbnailIfDue(id: string, items: Parameters<typeof renderThumbnail>[0]): Promise<string | null | undefined> {
  if (thumbSent?.id === id && thumbSent.key === itemsKey(items)) return undefined;
  const wait = thumbSent?.id === id ? thumbSentAt + THUMBNAIL_INTERVAL_MS - Date.now() : 0;
  if (wait > 0) {
    thumbTimer ??= setTimeout(() => void flushThumbnail(), wait);
    return undefined;
  }
  markThumbnail(id, items, true);
  return boardThumbnail(id, items);
}

/** Sends the open playground's thumbnail now if the stored one is out of date. Best effort. */
async function flushThumbnail(): Promise<void> {
  clearTimeout(thumbTimer);
  thumbTimer = undefined;
  const user = useAuth.getState().user;
  const { cloudId, ownerId } = useCloud.getState();
  if (!supabase || !user || !cloudId || ownerId !== user.id || useUi.getState().viewing) return;
  const { items } = usePlayground.getState();
  if (thumbSent?.id === cloudId && thumbSent.key === itemsKey(items)) return;
  // Not saved to this playground yet: the next save sends the thumbnail with the layout.
  if (!inCloud(cloudId, items)) return;
  markThumbnail(cloudId, items, true);
  try {
    const thumbnail = await boardThumbnail(cloudId, items);
    await setThumbnail(cloudId, thumbnail);
    useCloud.setState((s) => ({ list: s.list.map((p) => (p.id === cloudId ? { ...p, thumbnail } : p)) }));
  } catch (e) {
    thumbSent = null; // try again with the next save
    console.warn("Could not update the playground thumbnail.", e);
  }
}

/** Sends anything that was waiting (thumbnail, link preview) before the canvas changes to another board. */
function flushPending(): Promise<void> {
  return Promise.all([flushThumbnail(), flushShareImage()]).then(() => undefined);
}

/** Leaves a shared playground for the board kept in this device's storage (signed out, or not saved to the cloud). */
function restoreLocal() {
  if (!useUi.getState().viewing) return;
  useUi.getState().setViewing(null);
  clearSharedParam();
  usePlayground.getState().reset();
  restorePlayground();
  // Undo shouldn't step back into the shared board.
  usePlayground.setState({ past: [], future: [] });
  usePlayground.getState().fitToContent();
  lastSavedKey = contentKey();
  void reconcileWithCloud();
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
    const { cloudId, ownerId, slug, isPublic, forkedFromId, pendingDetails } = get();
    try {
      localStorage.setItem(META_KEY, JSON.stringify({ cloudId, ownerId, slug, isPublic, forkedFromId, pendingDetails }));
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
      if (!supabase || !user || useUi.getState().viewing) return;
      if (saving) {
        saveAgain = true;
        return;
      }
      const key = contentKey();
      if (key === lastSavedKey) return;
      // At the plan's limit, a new board can't be created, so don't retry on every edit. Freeing a slot or upgrading
      // retries it (see startCloudSync).
      if (get().status === "limit" && !get().cloudId) return;

      saving = true;
      set({ status: "saving", error: null });
      try {
        const pg = usePlayground.getState();
        const doc = pg.toDocument();
        const meta = get();
        let id = meta.ownerId === user.id ? meta.cloudId : null;
        let created = false;
        let sentThumbnail: string | null | undefined;

        if (!id) {
          const thumbnail = await renderThumbnail(pg.items);
          const row = await createPlayground(user.id, pg.name, meta.forkedFromId, thumbnail);
          id = row.id;
          created = true;
          markThumbnail(id, pg.items, true);
          // The row starts with the small inline picture (the file needs the new id); swap in the sharp one.
          const newId = id;
          void boardThumbnail(newId, pg.items)
            .then(async (t) => {
              if (!t || t.startsWith("data:")) return;
              await setThumbnail(newId, t);
              useCloud.setState((s) => ({ list: s.list.map((p) => (p.id === newId ? { ...p, thumbnail: t } : p)) }));
            })
            .catch(() => undefined);
          if (row.name !== pg.name) usePlayground.getState().setName(row.name);
          const { pendingDetails } = meta;
          setMeta({ cloudId: id, ownerId: user.id, forkedFromId: null, slug: null, isPublic: false, pendingDetails: null });
          void useBilling.getState().refresh(); // the playground count changed
          // Best effort: the playground is saved either way, and the details can be set again from Edit Playground.
          if (pendingDetails) {
            await updateDetails(id, pendingDetails).catch((e: unknown) => console.warn("Could not save the playground's details.", e));
          }
        } else {
          sentThumbnail = await thumbnailIfDue(id, pg.items);
          // Saving the version marks the playground as just edited, so the row only needs writing for a rename or
          // a new thumbnail. Unknown (list not loaded yet) counts as a rename.
          const listed = get().list.find((p) => p.id === id);
          if (sentThumbnail !== undefined || listed?.name !== pg.name) await touchPlayground(id, pg.name, sentThumbnail);
        }
        await insertVersion(id, doc);
        cloudCopy = { id, key: itemsKey(doc.items) };

        lastSavedKey = contentKey();
        set({ status: "saved" });
        const { isPublic, slug } = get();
        if (isPublic && slug) scheduleShareImage(slug);
        if (created) {
          void get().refreshList();
        } else {
          // Update the open board's entry here instead of reloading the whole list (with every thumbnail) per save.
          const savedId = id;
          set((s) => {
            const old = s.list.find((p) => p.id === savedId);
            if (!old) return {};
            const entry = {
              ...old,
              name: pg.name,
              updated_at: new Date().toISOString(),
              ...(sentThumbnail !== undefined && { thumbnail: sentThumbnail }),
            };
            return { list: [entry, ...s.list.filter((p) => p.id !== savedId)] };
          });
        }
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
      await flushPending();
      const doc = await fetchLatestDocument(id);
      endViewing();
      const row = get().list.find((p) => p.id === id);
      usePlayground.getState().loadDocument(doc, { undoable: true });
      // The stored thumbnail was drawn from this layout, so it isn't resent until the board changes.
      markThumbnail(id, usePlayground.getState().items, false);
      cloudCopy = { id, key: itemsKey(usePlayground.getState().items) };
      if (row) usePlayground.getState().setName(row.name);
      lastSavedKey = contentKey();
      // Reopening the same playground before the list has loaded keeps what's known about its sharing.
      const same = get().cloudId === id;
      setMeta({
        cloudId: id,
        ownerId: useAuth.getState().user?.id ?? null,
        slug: row ? row.slug : same ? get().slug : null,
        isPublic: row ? row.is_public : same ? get().isPublic : false,
        forkedFromId: null,
        pendingDetails: null,
      });
      set({ status: "idle" });
      // Boards shared before link previews existed get theirs the next time they're opened.
      if (row?.is_public && row.slug) scheduleShareImage(row.slug);
    },

    newPlayground: (start) => {
      void flushPending();
      endViewing();
      usePlayground.getState().reset();
      lastSavedKey = contentKey();
      setMeta({ ...EMPTY_META, pendingDetails: start?.details ?? null });
      set({ status: "idle" });
      // A new name differs from what was just marked saved, so autosave creates the playground in the account right away.
      if (start?.name.trim()) usePlayground.getState().setName(start.name.trim());
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
          await touchPlayground(cloudId, trimmed);
        } catch (e) {
          return e instanceof DuplicateNameError ? e.message : "Could not rename in the cloud.";
        }
        void get().refreshList();
      }
      usePlayground.getState().setName(trimmed);
      return null;
    },

    share: async () => {
      // Shares what's on the screen: save it first if this playground in the cloud might hold something else.
      const open = get().cloudId;
      if (open && !inCloud(open, usePlayground.getState().items)) lastSavedKey = "";
      await get().saveNow();
      const { cloudId } = get();
      if (!cloudId) throw new Error("Sign in to share a playground.");
      const slug = await sharePlayground(cloudId);
      track("share_link_created");
      setMeta({ slug, isPublic: true });
      // Ready before the link is pasted anywhere, since previewers fetch the image as soon as they see the link.
      await updateShareImage(slug);
      void get().refreshList();
      return slug;
    },

    stopSharing: async () => {
      const { cloudId, slug } = get();
      if (!cloudId) return;
      await unsharePlayground(cloudId);
      setMeta({ isPublic: false });
      clearTimeout(shareImageTimer);
      shareImageKey = "";
      if (slug) void deleteShareImage(slug).catch(() => undefined);
      void get().refreshList();
    },

    shareById: async (id) => {
      if (id === get().cloudId) return get().share();
      const slug = await sharePlayground(id);
      // Not on the canvas, so draw its preview from its latest saved version.
      try {
        const doc = await fetchLatestDocument(id);
        const image = await renderShareImage(doc.items);
        if (image) await uploadShareImage(slug, image);
      } catch (e) {
        console.warn("Could not create the share preview image.", e);
      }
      await get().refreshList();
      return slug;
    },

    setInGallery: async (id, inGallery) => {
      // The open playground shares through share(), which saves it first and keeps its share state in step.
      if (inGallery && id === get().cloudId) await get().share();
      await setPlaygroundInGallery(id, inGallery);
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
      // Your own shared link just opens your playground.
      if (shared.ownerId === useAuth.getState().user?.id) {
        clearSharedParam();
        await get().openPlayground(shared.id);
        return true;
      }
      // View-only: the user's own board stays in storage and in the cloud, untouched, until they leave or copy.
      useUi.getState().setViewing({ id: shared.id, slug, name: shared.name, ownerId: shared.ownerId, ownerName: shared.ownerName });
      // Board popularity in GA: the slug (the ?p= in its link), never its name.
      track("board_view", { board_id: slug, from: boardViewFrom() });
      usePlayground.getState().loadDocument(shared.doc);
      usePlayground.getState().setName(shared.name);
      usePlayground.getState().fitToContent();
      // The canvas is still settling (side column, window size): keep it fitted until the viewer pans or zooms.
      usePlayground.getState().setAutoFit(true);
      return true;
    },

    leaveShared: () => {
      if (!useUi.getState().viewing) return;
      // Signed in with a saved playground open: bring it back from the cloud. This device's storage can hold another
      // board by now (another tab, or a local save that landed just as the shared board opened), and treating that
      // as this playground would save it, or its picture, over the user's own.
      const user = useAuth.getState().user;
      const { cloudId, ownerId } = get();
      if (supabase && user && cloudId && ownerId === user.id) {
        void get()
          .openPlayground(cloudId)
          // Undo shouldn't step back into the shared board.
          .then(() => usePlayground.setState({ past: [], future: [] }))
          .catch((e: unknown) => {
            console.warn("Could not reopen the playground.", e);
            restoreLocal();
          });
        return;
      }
      restoreLocal();
    },

    copyShared: () => {
      const viewing = useUi.getState().viewing;
      if (!viewing) return;
      track("shared_board_copied", { board_id: viewing.slug });
      useUi.getState().setViewing(null);
      clearSharedParam();
      // The copy becomes the open playground; the first save creates it and records where it came from.
      setMeta({ ...EMPTY_META, forkedFromId: viewing.id });
      usePlayground.getState().setName(`${viewing.name} (Copy)`);
      lastSavedKey = "";
      set({ status: "idle" });
      void get().saveNow();
    },
  };
});

/**
 * Signed out: an account's board doesn't stay on the screen (it's saved in the account, and the device may be
 * shared), and a guest's board is always "Untitled Playground", so the playground menu is where they go to save it.
 */
function settleGuestBoard() {
  if (useUi.getState().viewing) return;
  if (useCloud.getState().cloudId) {
    useCloud.getState().newPlayground();
    usePlayground.setState({ past: [], future: [] });
  } else if (usePlayground.getState().name !== DEFAULT_NAME) {
    usePlayground.getState().setName(DEFAULT_NAME);
  }
}

/** A board picked in another page's My Playgrounds menu: it opens in place of "pick up where they left off". */
let handoffOpen: string | null = null;
export function openAfterSignIn(id: string) {
  handoffOpen = id;
}

/**
 * After sign-in (or leaving a shared playground): open the account's latest playground on a new device, or upload
 * local work from before sign-in. Waits while a shared playground is being viewed, since that board isn't theirs.
 */
async function reconcileWithCloud() {
  if (!useAuth.getState().user || useUi.getState().viewing) return;
  if (handoffOpen) {
    const id = handoffOpen;
    handoffOpen = null;
    if (id !== useCloud.getState().cloudId) return useCloud.getState().openPlayground(id);
    return;
  }
  const { cloudId, list } = useCloud.getState();
  const { items } = usePlayground.getState();
  if (cloudId) return;
  if (items.length === 0 && list.length > 0) {
    await useCloud.getState().openPlayground(list[0].id); // new device: pick up where they left off
  } else if (items.length > 0) {
    lastSavedKey = ""; // local work from before sign-in: upload it
    void useCloud.getState().saveNow();
  }
}

/**
 * Wires cloud sync: autosave on edits, and reconciles local vs cloud state when the user signs in.
 * Call after restorePlayground(). Returns a cleanup function.
 */
export function startCloudSync() {
  lastSavedKey = contentKey();
  let timer: ReturnType<typeof setTimeout> | undefined;

  const unsubPlayground = usePlayground.subscribe((s, prev) => {
    if (s.items === prev.items && s.signal === prev.signal && s.name === prev.name) return;
    if (!useAuth.getState().user || useUi.getState().viewing) return;
    clearTimeout(timer);
    timer = setTimeout(() => void useCloud.getState().saveNow(), AUTOSAVE_DEBOUNCE_MS);
  });

  let lastUserId: string | null = null;
  const onAuth = async () => {
    const user = useAuth.getState().user;
    if (!user || user.id === lastUserId) {
      if (!user) {
        const signedOut = lastUserId !== null;
        lastUserId = null;
        useCloud.setState({ list: [] });
        useBilling.getState().clear();
        if (signedOut || useAuth.getState().ready) settleGuestBoard();
      }
      return;
    }
    lastUserId = user.id;

    const cloud = useCloud.getState();
    if (cloud.ownerId && cloud.ownerId !== user.id) {
      useCloud.setState({ ...EMPTY_META });
    }
    await Promise.all([useCloud.getState().refreshList(), useBilling.getState().refresh()]);
    await reconcileWithCloud();
  };

  const unsubAuth = useAuth.subscribe(() => void onAuth());
  void onAuth();

  // A board that couldn't be created at the plan's limit is saved once there's room (a board deleted, or an upgrade).
  const unsubBilling = useBilling.subscribe((s, prev) => {
    const e = s.entitlements;
    if (!e || e === prev.entitlements || useCloud.getState().status !== "limit") return;
    if (e.maxPlaygrounds !== null && e.playgroundCount >= e.maxPlaygrounds) return;
    useCloud.setState({ status: "idle", error: null });
    void useCloud.getState().saveNow();
  });

  // Leaving or hiding the page sends a waiting thumbnail or link preview, so they don't stay out of date.
  const onHide = () => {
    if (document.visibilityState !== "hidden") return;
    // Save a waiting edit first, so the thumbnail sent after it shows the saved layout.
    clearTimeout(timer);
    void useCloud.getState().saveNow().finally(() => void flushPending());
  };
  document.addEventListener("visibilitychange", onHide);

  return () => {
    clearTimeout(timer);
    unsubPlayground();
    unsubAuth();
    unsubBilling();
    document.removeEventListener("visibilitychange", onHide);
  };
}
