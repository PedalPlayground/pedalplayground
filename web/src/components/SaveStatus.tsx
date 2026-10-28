import { useAuth } from "../store/auth";
import { tip } from "./Tooltip";
import { useCloud } from "../store/cloud";
import { SHOW_PRO, useUi } from "../store/ui";

/** Speaks up only when saving to the account has a problem. Routine saves stay quiet; canvas actions confirm themselves. */
export function SaveStatus() {
  const user = useAuth((s) => s.user);
  const { status, error } = useCloud();

  if (!user) return null;
  if (status === "limit") {
    return (
      SHOW_PRO ? (
        <button onClick={() => useUi.getState().openUpgrade("save")} className="animate-enter text-sm text-danger hover:underline">
          Not saved to your account · Upgrade
        </button>
      ) : (
        <span className="animate-enter text-sm text-danger">Not saved to your account</span>
      )
    );
  }
  if (status === "error") return <span className="animate-enter text-sm text-danger" {...(error ? tip(error) : {})}>Saved locally only</span>;
  return null;
}
