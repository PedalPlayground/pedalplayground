import { BadgeCheck } from "lucide-react";
import { tip } from "./Tooltip";

/**
 * A username that links somewhere (their boards in Explore, or moderation): a soft squiggly underline that firms up
 * on hover. Usernames are shown without an @.
 */
export const userLink =
  "underline decoration-wavy decoration-1 underline-offset-[1px] decoration-ink-muted/45 transition-colors hover:decoration-current";

/** Accounts that speak for Pedal Playground, by username (lowercase), and the label their posts carry. */
const TEAM: Record<string, string> = { trav: "Creator" };

/** The team label for a username ("Creator"), or null for everyone else. */
export const teamRole = (username: string | null | undefined) => (username ? (TEAM[username.toLowerCase()] ?? null) : null);

const pill = "inline-flex h-[18px] shrink-0 items-center rounded-full px-1.5 text-[11px] font-semibold leading-none";

/**
 * Small marks after a username: a Builder pill when it's the board's owner talking, and a brand check for Pedal
 * Playground's own accounts (its tooltip and accessible name say Creator). Renders nothing for anyone else.
 */
export function RoleBadges({ username, builder }: { username: string | null | undefined; builder?: boolean }) {
  const role = teamRole(username);
  if (!role && !builder) return null;
  return (
    <>
      {builder && (
        <span className={`${pill} bg-soft text-ink`} {...tip("Made this board")}>
          Builder
        </span>
      )}
      {/* The team mark: a small brand-colored check, quieter than a pill but easy to spot. */}
      {role && (
        <span role="img" aria-label={role} className="relative inline-flex shrink-0 text-brand" {...tip(`${role} of Pedal Playground`)}>
          <BadgeCheck size={14} strokeWidth={2.25} aria-hidden />
        </span>
      )}
    </>
  );
}
