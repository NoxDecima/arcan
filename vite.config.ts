import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  server: {
    proxy: {
      // Better Auth router: dev auth-server runs on :4300, proxied so
      // the browser sees same-origin cookies (Better Auth requires that).
      "/api/auth": "http://localhost:4300",
      // Jazz sync WebSocket: dev sync server runs on :4200.
      "/sync": { target: "ws://localhost:4200", ws: true },
    },
  },
});
