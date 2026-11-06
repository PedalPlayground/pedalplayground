import { create } from "zustand";
import { fetchStanding, markFlagsSeen, NO_STANDING, type Standing } from "../lib/moderation";

interface StandingState extends Standing {
  /** Loads the signed-in person's standing (nothing flagged when signed out). */
  load: (signedIn: boolean) => Promise<void>;
  /** "I Understand": marks the unseen flags seen. */
  acknowledge: () => Promise<void>;
}

export const useStanding = create<StandingState>((set, get) => ({
  ...NO_STANDING,
  load: async (signedIn) => set(signedIn ? await fetchStanding() : NO_STANDING),
  acknowledge: async () => {
    const ids = get().unseen.map((f) => f.id);
    set({ unseen: [] });
    await markFlagsSeen(ids);
  },
}));

/** When a timeout ends, while it's on (bans count as restricted with no end). */
export function useRestriction(): { restricted: boolean; until: string | null } {
  const banned = useStanding((s) => s.banned);
  const until = useStanding((s) => s.restricted_until);
  const restricted = banned || (!!until && new Date(until).getTime() > Date.now());
  return { restricted, until: banned ? null : until };
}
