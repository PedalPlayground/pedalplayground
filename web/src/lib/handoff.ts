/**
 * The My Playgrounds menu works on other pages (the gallery) by sending you to the playground with what you picked in
 * the URL hash. The playground reads it once on load and clears it.
 */
export type Handoff =
  | { kind: "open"; id: string }
  | { kind: "edit"; id: string }
  | { kind: "new" }
  | { kind: "playgrounds" }
  /** The Gear page's Add to My Playground: `id` is "pedal:<image key>" or "pedalboard:<image key>". */
  | { kind: "add"; id: string };

export function handoffHref(h: Handoff): string {
  if (h.kind === "open" || h.kind === "edit" || h.kind === "add") return `/#pp-${h.kind}=${encodeURIComponent(h.id)}`;
  return `/#pp-${h.kind}`;
}

/** The handoff in this page's URL, if any. Removes it from the URL so a reload doesn't repeat it. */
export function takeHandoff(): Handoff | null {
  const m = /^#pp-(open|edit|add|new|playgrounds)(?:=(.+))?$/.exec(window.location.hash);
  if (!m) return null;
  history.replaceState(null, "", window.location.pathname + window.location.search);
  const [, kind, id] = m;
  if (kind === "open" || kind === "edit" || kind === "add") return id ? { kind, id: decodeURIComponent(id) } : null;
  return { kind: kind as "new" | "playgrounds" };
}
