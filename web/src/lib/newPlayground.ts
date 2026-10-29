import { atLimit } from "./billing";
import { useAuth } from "../store/auth";
import { useBilling } from "../store/billing";
import { useCloud } from "../store/cloud";
import { usePlayground } from "../store/playground";
import { useUi } from "../store/ui";

/**
 * Starts a fresh playground, unless the signed-in user's plan has no room for another one,
 * in which case the upgrade dialog opens (it offers an unsaved canvas as the alternative).
 */
export function requestNewPlayground() {
  const { user } = useAuth.getState();
  const { entitlements, billingEnabled } = useBilling.getState();
  if (user && billingEnabled && atLimit(entitlements)) {
    useUi.getState().openUpgrade("limit");
    return;
  }
  if (!usePlayground.getState().items.length || window.confirm("Start a fresh playground? This clears the canvas.")) {
    useCloud.getState().newPlayground();
  }
}
