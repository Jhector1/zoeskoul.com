import { fileURLToPath, URL } from "node:url";

import { zoeSkoulApps } from "@zoeskoul/app-config";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    host: "localhost",
    port: zoeSkoulApps.admin.localPort,
    strictPort: true,
  },
  preview: {
    host: "localhost",
    port: zoeSkoulApps.admin.localPort,
    strictPort: true,
  },
});
