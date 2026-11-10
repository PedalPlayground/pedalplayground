/**
 * A random id (UUID v4). `crypto.randomUUID` only exists on https and localhost, so opening the dev server from a
 * phone at the Mac's network address (http://192.168…) would leave a blank page; this falls back to
 * `crypto.getRandomValues`, which works everywhere.
 */
export function uid(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
