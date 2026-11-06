/**
 * Flags (warnings, timeouts, bans) and reports. The database side is supabase/migrations/20261106000000_moderation.sql;
 * until it's applied, everything here quietly reports "nothing" so the site works as before.
 */
import { supabase } from "./supabase";

/** Why something was reported or flagged. Codes match the database's checks. */
export const REASONS = [
  { code: "spam", label: "Spam or advertising", hint: "Ads, scams, or the same thing posted over and over" },
  { code: "harassment", label: "Harassment or hate", hint: "Insults, threats, or attacks on someone's identity" },
  { code: "sexual", label: "Sexual or violent content", hint: "Explicit, graphic or shocking images or words" },
  { code: "offensive_name", label: "Offensive name or language", hint: "Slurs or curse words in a username, board name or comment" },
  { code: "impersonation", label: "Impersonation", hint: "Pretending to be another person, artist or brand" },
  { code: "other", label: "Something else", hint: "Tell us what's wrong" },
] as const;
export type Reason = (typeof REASONS)[number]["code"];
export const reasonLabel = (code: string) => REASONS.find((r) => r.code === code)?.label ?? code;

export type FlagAction = "warning" | "timeout" | "ban";

export interface Flag {
  id: string;
  reason: Reason;
  note: string;
  action: FlagAction;
  ends_at: string | null;
  created_at: string;
  seen_at?: string | null;
  lifted_at?: string | null;
  issued_by?: string | null;
}

export interface Standing {
  banned: boolean;
  /** When a timeout ends (ISO), or null. */
  restricted_until: string | null;
  /** Flags the person hasn't seen yet, newest first. */
  unseen: Flag[];
}

export const NO_STANDING: Standing = { banned: false, restricted_until: null, unseen: [] };

const isMissing = (code?: string) => code === "42P01" || code === "PGRST205" || code === "PGRST202" || code === "42883";

/** "Nov 12" (with the year when it isn't this year). */
export const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: new Date(iso).getFullYear() === new Date().getFullYear() ? undefined : "numeric" });

/** The signed-in person's standing. Nothing flagged when it can't be checked. */
export async function fetchStanding(): Promise<Standing> {
  if (!supabase) return NO_STANDING;
  const { data, error } = await supabase.rpc("my_standing");
  if (error || !data) return NO_STANDING;
  return { ...NO_STANDING, ...(data as Standing) };
}

export async function markFlagsSeen(ids: string[]): Promise<void> {
  if (!supabase || !ids.length) return;
  await supabase.rpc("flags_seen", { ids });
}

/** A friendly message for the database's refusals, or the original one. */
export function moderationError(message: string, until?: string | null): string {
  if (/account_restricted/.test(message)) return until ? `Your account is in a timeout until ${shortDate(until)}.` : "Your account is in a timeout.";
  if (/username_not_allowed/.test(message)) return "Please pick a different username.";
  if (/slow_down/.test(message)) return "You've sent a lot of reports today. Try again tomorrow.";
  if (/own_content/.test(message)) return "That's yours, so it can't be reported.";
  if (/not_found/.test(message)) return "That can't be found any more.";
  if (/sign_in_required/.test(message)) return "Sign in to report something.";
  return message;
}

export type ReportKind = "comment" | "board" | "user";

/** Sends a report. Resolves to null when it went through (or was already reported), or an error message. */
export async function reportContent(kind: ReportKind, target: string, reason: Reason, details: string): Promise<string | null> {
  if (!supabase) return "Accounts aren't set up on this build.";
  const { error } = await supabase.rpc("report_content", { kind, target, reason, details });
  if (!error) return null;
  if (isMissing(error.code)) return "Reports aren't set up yet.";
  return moderationError(error.message);
}

// Editors ----------------------------------------------------------------------------------------------------------

export interface Report {
  id: string;
  target_kind: ReportKind;
  target_id: string;
  target_text: string | null;
  target_user_id: string | null;
  target_username: string | null;
  reason: Reason;
  details: string;
  status: "open" | "resolved" | "dismissed";
  created_at: string;
  reporter_username: string | null;
  open_against: number;
  flags_against: number;
  board_slug: string | null;
}

export interface ModUser {
  user_id: string;
  username: string;
  joined: string;
  banned: boolean;
  restricted_until: string | null;
  open_reports: number;
  flags: Flag[];
}

function db() {
  if (!supabase) throw new Error("Accounts aren't set up on this build.");
  return supabase;
}
const fail = (error: { message: string; code?: string } | null) => {
  if (!error) return;
  if (isMissing(error.code)) throw new Error("Moderation isn't set up on the database yet.");
  throw new Error(moderationError(error.message));
};

export async function fetchReports(includeClosed = false): Promise<Report[]> {
  const { data, error } = await db().rpc("moderation_reports", { include_closed: includeClosed });
  fail(error);
  return (data ?? []) as Report[];
}

/** A board hidden from the gallery, by an editor or by a ban. */
export interface HiddenBoard {
  playground_id: string;
  slug: string | null;
  name: string;
  owner_user_id: string;
  owner_username: string | null;
  hidden_by_username: string | null;
  hidden_at: string;
  by_ban: boolean;
}

export async function fetchHiddenBoards(): Promise<HiddenBoard[]> {
  const { data, error } = await db().rpc("moderation_hidden_boards");
  fail(error);
  return (data ?? []) as HiddenBoard[];
}

/** One thing an account did, for its activity history. */
export interface Activity {
  kind: "joined" | "signed_in" | "board_created" | "board_updated" | "comment" | "like" | "report_sent" | "reported" | "suggestion";
  happened_at: string;
  title: string;
  detail: string | null;
  board_slug: string | null;
}

/** An account's activity, newest first (moderation_activity migration). Empty until that migration is applied. */
export async function fetchActivity(userId: string): Promise<Activity[] | null> {
  const { data, error } = await db().rpc("moderation_activity", { target: userId, max_items: 150 });
  if (error) {
    if (isMissing(error.code)) return null;
    fail(error);
  }
  return (data ?? []) as Activity[];
}

/** An account by username, or null when there's no such username. */
export async function lookupUser(name: string): Promise<ModUser | null> {
  const { data, error } = await db().rpc("moderation_user", { name });
  fail(error);
  return (data as ModUser | null) ?? null;
}

export async function flagUser(f: { userId: string; reason: Reason; note: string; action: FlagAction; days?: number; reportId?: string }): Promise<void> {
  const { error } = await db().rpc("moderation_flag", {
    target: f.userId,
    reason: f.reason,
    note: f.note,
    action: f.action,
    days: f.action === "timeout" ? (f.days ?? 7) : null,
    report: f.reportId ?? null,
  });
  fail(error);
}

export async function liftFlag(id: string): Promise<void> {
  const { error } = await db().rpc("moderation_lift", { flag: id });
  fail(error);
}

export async function closeReport(id: string, outcome: "resolved" | "dismissed"): Promise<void> {
  const { error } = await db().rpc("moderation_close_report", { report: id, outcome });
  fail(error);
}

/** Timeout lengths an editor can pick (days). */
export const TIMEOUT_DAYS = [1, 7, 30] as const;

/**
 * The suggested next step from someone's history: flags not lifted in the last 90 days. None: a warning; one: a 7-day
 * timeout; two or more: a ban. The editor can always pick something else.
 */
export function suggestedAction(flags: Flag[], now = Date.now()): { action: FlagAction; days?: number } {
  const recent = flags.filter((f) => !f.lifted_at && now - new Date(f.created_at).getTime() < 90 * 24 * 3600 * 1000).length;
  if (recent === 0) return { action: "warning" };
  if (recent === 1) return { action: "timeout", days: 7 };
  return { action: "ban" };
}
