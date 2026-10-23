import { useEffect, useState } from "react";
import { useAuth } from "../store/auth";
import { useCloud } from "../store/cloud";
import { useUi } from "../store/ui";

/** Brief "Saving… / Saved!" feedback in the header, for signed-in users. */
export function SaveStatus() {
  const user = useAuth((s) => s.user);
  const { status, error } = useCloud();
  const [showSaved, setShowSaved] = useState(false);

  useEffect(() => {
    if (status !== "saved") return;
    setShowSaved(true);
    const t = setTimeout(() => setShowSaved(false), 1800);
    return () => clearTimeout(t);
  }, [status]);

  if (!user) return null;
  if (status === "limit") {
    return (
      <button onClick={() => useUi.getState().openUpgrade("save")} className="text-sm text-danger hover:underline">
        Not saved to your account · Upgrade
      </button>
    );
  }
  if (status === "saving") return <span className="text-sm text-ink-muted">Saving…</span>;
  if (status === "error") return <span className="text-sm text-danger" title={error ?? ""}>Saved locally only</span>;
  if (status === "saved" && showSaved) return <span className="text-sm text-ink-muted">Saved!</span>;
  return null;
}
