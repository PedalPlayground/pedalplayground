import type { Entitlements } from "./billing";
import { supabase } from "./supabase";
import { useAuth } from "../store/auth";
import { useUi } from "../store/ui";

/** Searching the whole catalog for an avatar is a Pro perk. Set to false to open it to everyone. */
export const AVATAR_SEARCH_REQUIRES_PRO = true;

export function canSearchAvatars(billingEnabled: boolean, entitlements: Entitlements | null): boolean {
  if (!AVATAR_SEARCH_REQUIRES_PRO || !billingEnabled) return true;
  return entitlements?.plan === "pro";
}

/** Uses `key` as the avatar on this device and, when signed in, on the account (user metadata). */
export function chooseAvatar(key: string) {
  useUi.getState().setAvatar(key);
  if (supabase && useAuth.getState().user) {
    void supabase.auth.updateUser({ data: { avatar_pedal: key } }).catch(() => {
      /* the local choice still applies; it will sync next time */
    });
  }
}

/** Adopts the account's saved avatar whenever the signed-in user changes. Returns an unsubscribe. */
export function startAvatarSync() {
  const adopt = () => {
    const saved = useAuth.getState().user?.user_metadata?.avatar_pedal;
    if (typeof saved === "string" && saved && saved !== useUi.getState().avatar) useUi.getState().setAvatar(saved);
  };
  adopt();
  return useAuth.subscribe(adopt);
}
