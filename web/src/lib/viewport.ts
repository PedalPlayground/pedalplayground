import { useEffect, useState } from "react";

/** Tracks a media query, e.g. the phone breakpoint. */
export function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatches(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [query]);
  return matches;
}

export const PHONE_QUERY = "(max-width: 639.98px)";

/**
 * The visible area above the on-screen keyboard. iOS doesn't shrink the layout when the keyboard opens, so
 * anything pinned to the bottom has to lift itself by `keyboard` to stay in view.
 */
export function useVisualViewport() {
  const read = () => {
    const vv = window.visualViewport;
    const height = vv?.height ?? window.innerHeight;
    const keyboard = vv ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop) : 0;
    return { height, keyboard };
  };
  const [state, setState] = useState(read);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const on = () => setState(read());
    vv.addEventListener("resize", on);
    vv.addEventListener("scroll", on);
    return () => {
      vv.removeEventListener("resize", on);
      vv.removeEventListener("scroll", on);
    };
  }, []);
  return state;
}
