import { useEffect, useState } from "react";
import { useAuth } from "../store/auth";
import { isEditor } from "./editorApi";

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
