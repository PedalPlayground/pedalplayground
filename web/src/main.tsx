import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { App } from "./App";

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
