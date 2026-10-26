import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // host: true also serves on your local network, so a phone on the same Wi-Fi can open the dev server.
  server: { port: 5173, host: true, fs: { allow: [".."] } },
});
