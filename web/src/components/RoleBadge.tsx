import { tip } from "./Tooltip";

/** A name that links somewhere: a username (their boards in Explore) or a brand (its Gear page). Usernames show without an @. */
export const nameLink = "underline-offset-2 hover:underline focus-visible:underline";
/** The squiggle (drawn in index.css), as a rule after section headings. */
export const squiggleRule = "squiggle-rule";

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
          {/* Lucide's badge-check shape, filled in the brand color with the check knocked out in white. */}
          <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden>
            <path
              d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z"
              fill="currentColor"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinejoin="round"
            />
            <path d="m8.5 12 2.5 2.5 4.5-5" fill="none" stroke="var(--color-brand-ink)" strokeWidth="2.75" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      )}
    </>
  );
}
