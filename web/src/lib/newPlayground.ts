import { atLimit } from "./billing";
import { supabase } from "./supabase";
import { useAuth } from "../store/auth";
import { useBilling } from "../store/billing";
import { useCloud } from "../store/cloud";
import { usePlayground } from "../store/playground";
import { useUi } from "../store/ui";

/**
 * Starts a fresh playground, unless the signed-in user's plan has no room for another one,
 * in which case the upgrade dialog opens (it offers an unsaved canvas as the alternative).
 * Signed in, the New Playground dialog comes first to name and categorize it. Guests just get a fresh canvas,
 * since their board stays "Untitled Playground" until they sign in.
 */
export function requestNewPlayground() {
  const { user } = useAuth.getState();
  const { entitlements, billingEnabled } = useBilling.getState();
  if (user && billingEnabled && atLimit(entitlements)) {
    useUi.getState().openUpgrade("limit");
    return;
  }
  // Signed in, the open board is saved to the account, so the dialog's Cancel is confirmation enough. A board the
  // account couldn't save (plan limit or an error) would be lost, so that still asks first.
  const { cloudId, status } = useCloud.getState();
  const saved = !!user && !!supabase && !!cloudId && status !== "limit" && status !== "error";
  if (!saved && usePlayground.getState().items.length && !window.confirm("Start a fresh playground? This clears the canvas.")) return;
  if (user && supabase) useUi.getState().setNewPlaygroundOpen(true);
  else useCloud.getState().newPlayground();
}
