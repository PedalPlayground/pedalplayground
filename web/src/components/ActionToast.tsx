import { useEffect, useState } from "react";
import { useToast } from "../store/toast";

/** A line of quiet text on the canvas confirming the last action (a faint canvas-colored backing keeps it readable over gear). It replays its entrance for each action and fades out after a moment. */
export function ActionToast({ className = "" }: { className?: string }) {
  const { id, msg } = useToast();
  const [leaving, setLeaving] = useState(false);
  const [gone, setGone] = useState(true);

  useEffect(() => {
    if (!id) return;
    setGone(false);
    setLeaving(false);
    const out = setTimeout(() => setLeaving(true), 1300);
    const hide = setTimeout(() => setGone(true), 1500);
    return () => {
      clearTimeout(out);
      clearTimeout(hide);
    };
  }, [id]);

  if (gone || !msg) return null;
  return (
    <div role="status" className={`pointer-events-none z-20 ${className}`}>
      <div
        key={id}
        className={`max-w-[80vw] truncate rounded-full bg-canvas/70 px-3 py-1 text-[13px] font-medium tracking-[-0.01em] text-ink-muted backdrop-blur-sm ${leaving ? "animate-exit" : "animate-enter"}`}
      >
        {msg}
      </div>
    </div>
  );
}
