import { useEffect, useState } from "react";
import { useAuth } from "../store/auth";
import { isAdmin, isEditor } from "./editorApi";

let cache: { userId: string; result: Promise<boolean> } | null = null;

/** True when the signed-in account is an editor (admins are editors too). Checked once per account and shared by everything that asks. */
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

let adminCache: { userId: string; result: Promise<boolean> } | null = null;

/** True for admins (they change permissions and post What's New). Checked once per account. */
export function useIsAdmin(): boolean {
  const userId = useAuth((s) => s.user?.id ?? null);
  const [admin, setAdmin] = useState(false);
  useEffect(() => {
    if (!userId) return setAdmin(false);
    if (adminCache?.userId !== userId) adminCache = { userId, result: isAdmin().catch(() => false) };
    let live = true;
    void adminCache.result.then((v) => live && setAdmin(v));
    return () => {
      live = false;
    };
  }, [userId]);
  return !!userId && admin;
}
