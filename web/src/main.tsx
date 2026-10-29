import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import "./store/actionToasts";
import { App } from "./App";
import { startAnalytics } from "./lib/analytics";

startAnalytics();

// iOS Safari pinches the whole page with gesture events, which touch-action doesn't stop. The canvas does its own pinch zoom.
for (const type of ["gesturestart", "gesturechange", "gestureend"]) {
  document.addEventListener(type, (e) => e.preventDefault(), { passive: false });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Dev only: expose the stores so flows (billing, sign-in) can be exercised without real accounts.
if (import.meta.env.DEV) {
  void Promise.all([
    import("./store/auth"),
    import("./store/billing"),
    import("./store/cloud"),
    import("./store/playground"),
    import("./store/ui"),
  ]).then(([auth, billing, cloud, playground, ui]) => {
    (window as unknown as { __pp: unknown }).__pp = {
      auth: auth.useAuth,
      billing: billing.useBilling,
      cloud: cloud.useCloud,
      playground: playground.usePlayground,
      ui: ui.useUi,
    };
  });
}
