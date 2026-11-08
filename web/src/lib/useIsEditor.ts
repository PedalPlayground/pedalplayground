import { useEffect, useState } from "react";
import { useAuth } from "../store/auth";
import { isEditor, isModerator } from "./editorApi";

let cache: { userId: string; result: Promise<boolean> } | null = null;

/** True when the signed-in account is a catalog editor. Checked once per account and shared by everything that asks. */
export function useIsEditor(): boolean {
  const userId = useAuth((s) => s.user?.id ?? null);
  const [editor, setEditor] = useState(false);
  useEffect(() => {
    if (!userId) return setEditor(false);
    if (cache?.userId !== userId) cache = { userId, result: isEditor().catch(() => false) };
    let live = true;
    void cache.result.then((v) => live && setEditor(v));
    return () => {
      live = false;
    };
  }, [userId]);
  return !!userId && editor;
}

let modCache: { userId: string; result: Promise<boolean> } | null = null;

/** True for moderators and catalog editors (they can do everything moderators can). Checked once per account. */
export function useIsModerator(): boolean {
  const userId = useAuth((s) => s.user?.id ?? null);
  const [mod, setMod] = useState(false);
  useEffect(() => {
    if (!userId) return setMod(false);
    if (modCache?.userId !== userId) modCache = { userId, result: isModerator().catch(() => false) };
    let live = true;
    void modCache.result.then((v) => live && setMod(v));
    return () => {
      live = false;
    };
  }, [userId]);
  return !!userId && mod;
}
