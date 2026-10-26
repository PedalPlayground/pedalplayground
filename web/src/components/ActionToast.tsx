import { useEffect, useState } from "react";
import { useToast } from "../store/toast";

/** A small pill confirming the last canvas action. It replays its entrance for each action and fades out after a moment. */
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
        className={`max-w-[80vw] truncate rounded-full bg-tip px-3 py-1 text-[13px] font-semibold tracking-[-0.01em] text-tip-ink shadow-[0_2px_12px_rgb(0_0_0/0.15)] ${leaving ? "animate-exit" : "animate-enter"}`}
      >
        {msg}
      </div>
    </div>
  );
}
