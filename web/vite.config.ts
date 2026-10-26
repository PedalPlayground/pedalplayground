import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

/**
 * Home screen and tab icons, picked per environment so prod, beta and local copies can sit side by side on one
 * home screen: the dev server (localhost or your network IP) is "local", `--mode beta` builds are "beta", and
 * any other build is "prod". Icons live in public/icons/<env>/; their SVG sources are in scripts/icons/.
 */
function appIcons(): Plugin {
  const titles = { prod: "Pedal Playground", beta: "PP Beta", local: "PP Local" };
  let env: keyof typeof titles = "prod";
  return {
    name: "app-icons",
    configResolved(config) {
      env = config.command === "serve" ? "local" : config.mode === "beta" ? "beta" : "prod";
    },
    transformIndexHtml() {
      const dir = `/icons/${env}`;
      return [
        { tag: "link", attrs: { rel: "icon", type: "image/png", sizes: "32x32", href: `${dir}/favicon-32.png` }, injectTo: "head" },
        { tag: "link", attrs: { rel: "apple-touch-icon", href: `${dir}/apple-touch-icon.png` }, injectTo: "head" },
        { tag: "link", attrs: { rel: "manifest", href: `${dir}/manifest.webmanifest` }, injectTo: "head" },
        { tag: "meta", attrs: { name: "apple-mobile-web-app-title", content: titles[env] }, injectTo: "head" },
      ];
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), appIcons()],
  // host: true also serves on your local network, so a phone on the same Wi-Fi can open the dev server.
  server: { port: 5173, host: true, fs: { allow: [".."] } },
});
