import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import {
  getLocalAppOrigin,
  zoeSkoulApps,
} from "@zoeskoul/app-config";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "localhost",
    port: zoeSkoulApps.teacher.localPort,
    strictPort: true,
    proxy: {
      "/api": {
        target: getLocalAppOrigin("website"),
        changeOrigin: true,
      },
    },
  },
  preview: {
    host: "localhost",
    port: zoeSkoulApps.teacher.localPort,
    strictPort: true,
  },
});
