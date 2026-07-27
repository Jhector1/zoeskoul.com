import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { zoeSkoulApps } from "@zoeskoul/app-config";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "localhost",
    port: zoeSkoulApps.student.localPort,
    strictPort: true,
  },
  preview: {
    host: "localhost",
    port: zoeSkoulApps.student.localPort,
    strictPort: true,
  },
});
