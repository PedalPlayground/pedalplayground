import { useEffect, useState } from "react";
import { useAuth } from "../store/auth";
import { useBilling } from "../store/billing";
import { Modal } from "./Modal";

/** Shown after Stripe sends the user back (`?billing=success`). Waits for the webhook to confirm Pro. */
export function BillingReturn({ onDone }: { onDone: () => void }) {
  const ready = useAuth((s) => s.ready);
  const user = useAuth((s) => s.user);
  const waitForPro = useBilling((s) => s.waitForPro);
  const [state, setState] = useState<"waiting" | "pro" | "slow">("waiting");

  useEffect(() => {
    if (!ready) return;
    if (!user) return setState("slow");
    let cancelled = false;
    void waitForPro().then((isPro) => !cancelled && setState(isPro ? "pro" : "slow"));
    return () => {
      cancelled = true;
    };
  }, [ready, user, waitForPro]);

  return (
    <Modal title={state === "pro" ? "You're on Pro" : "Finishing your upgrade"} onClose={onDone}>
      {state === "waiting" && <p className="text-sm text-ink-muted">Confirming your payment…</p>}
      {state === "pro" && <p className="text-sm text-ink-muted">Thanks for supporting Pedal Playground. You can now save as many playgrounds as you like.</p>}
      {state === "slow" && (
        <p className="text-sm text-ink-muted">
          Your payment is still being confirmed. Pro will switch on within a few minutes; there's nothing else you need to do. If it doesn't, sign in and check the Account menu.
        </p>
      )}
      <button onClick={onDone} className="mt-4 h-9 w-full rounded-control bg-brand text-sm font-medium text-brand-ink hover:bg-brand-hover">
        {state === "pro" ? "Start building" : "Close"}
      </button>
    </Modal>
  );
}
