import { useState } from "react";
import { useCloud } from "../store/cloud";

/** The builder's saved board in this browser (store/playground.ts). */
const LOCAL_BOARD_KEY = "pp:playground:v3";

/**
 * Whether this visitor has a board of their own: one saved in this browser with gear on it, or any on their
 * account. New visitors (no board yet) see "Start Building" in the header instead of My Boards.
 */
export function useHasBoards(): boolean {
  const [local] = useState(() => {
    try {
      const doc = JSON.parse(localStorage.getItem(LOCAL_BOARD_KEY) ?? "null") as { items?: unknown[] } | null;
      return !!doc?.items?.length;
    } catch {
      return false;
    }
  });
  const cloud = useCloud((s) => s.list.length > 0 || !!s.cloudId);
  return local || cloud;
}
