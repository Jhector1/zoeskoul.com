import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { zoeSkoulApps } from "@zoeskoul/app-config";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: zoeSkoulApps.student.localPort,
    strictPort: true,
  },
  preview: {
    host: "127.0.0.1",
    port: zoeSkoulApps.student.localPort,
    strictPort: true,
  },
});
