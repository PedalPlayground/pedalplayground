import { Fragment } from "react";

/** Web addresses in free text: http(s) links, and bare www. ones. Trailing punctuation stays outside the link. */
const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>"']+[^\s<>"'.,;:!?)\]}]/gi;

/** Splits text into plain parts and links (exported for tests). */
export function linkParts(text: string): { text: string; href?: string }[] {
  const out: { text: string; href?: string }[] = [];
  let last = 0;
  for (const m of text.matchAll(URL_RE)) {
    const i = m.index ?? 0;
    if (i > last) out.push({ text: text.slice(last, i) });
    out.push({ text: m[0], href: m[0].startsWith("www.") ? `https://${m[0]}` : m[0] });
    last = i + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}

/**
 * Text people typed, with any web addresses turned into links that open in a new tab (Admin: submitters' notes and
 * bug reports). Links are underlined in the brand color so they read as links inside muted text.
 */
export function Linkified({ text }: { text: string }) {
  return (
    <>
      {linkParts(text).map((p, i) =>
        p.href ? (
          <a key={i} href={p.href} target="_blank" rel="noreferrer noopener nofollow" className="break-all text-brand underline underline-offset-2 hover:no-underline">
            {p.text}
          </a>
        ) : (
          <Fragment key={i}>{p.text}</Fragment>
        ),
      )}
    </>
  );
}
