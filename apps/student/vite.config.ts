import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import {
  getLocalAppOrigin,
  zoeSkoulApps,
} from "@zoeskoul/app-config";

const here = fileURLToPath(new URL(".", import.meta.url));
const source = (path: string) =>
  fileURLToPath(new URL(path, import.meta.url));

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  resolve: {
    alias: [
      {
        find: /^@\/components\/practice\/kinds\/KindHelper$/,
        replacement: source(
          "./src/compat/practice-kind-helper.tsx",
        ),
      },
      {
        find: /^@\/lib\/auth$/,
        replacement: source(
          "./src/compat/server-auth.ts",
        ),
      },
      {
        find: /^@\/lib\/prisma$/,
        replacement: source(
          "./src/compat/server-prisma.ts",
        ),
      },
      {
        find: /^@\/lib\/practice\/actor$/,
        replacement: source(
          "./src/compat/server-practice-actor.ts",
        ),
      },
      {
        find: /^@\/lib\/learningAssignments\/assignmentAccessServer$/,
        replacement: source(
          "./src/compat/server-assignment-access.ts",
        ),
      },
      {
        find: "@zoeskoul-code-input-expected",
        replacement: source(
          "../../packages/curriculum-profiles/src/base/codeInputExpected.ts",
        ),
      },
      {
        find: "@zoeskoul/db",
        replacement: source(
          "./src/compat/zoeskoul-db-browser.ts",
        ),
      },
      {
        find: "next/dynamic",
        replacement: source(
          "./src/compat/next-dynamic.tsx",
        ),
      },
      {
        find: "next/server",
        replacement: source(
          "./src/compat/next-server.ts",
        ),
      },
      {
        find: "next/headers",
        replacement: source(
          "./src/compat/next-headers.ts",
        ),
      },
      {
        find: "next-intl/server",
        replacement: source(
          "./src/compat/next-intl-server.ts",
        ),
      },
      {
        find: "next-auth/providers/google",
        replacement: source(
          "./src/compat/next-auth-provider-google.ts",
        ),
      },
      {
        find: "next-auth/providers/keycloak",
        replacement: source(
          "./src/compat/next-auth-provider-keycloak.ts",
        ),
      },
      {
        find: "@auth/prisma-adapter",
        replacement: source(
          "./src/compat/auth-prisma-adapter.ts",
        ),
      },
      {
        find: "server-only",
        replacement: source(
          "./src/compat/server-only.ts",
        ),
      },
      {
        find: /^@\/(.*)$/,
        replacement: `${here}src/legacy-web/$1`,
      },
      {
        find: "next/navigation",
        replacement: source(
          "./src/compat/next-navigation.ts",
        ),
      },
      {
        find: "next/image",
        replacement: source(
          "./src/compat/next-image.tsx",
        ),
      },
      {
        find: "next/link",
        replacement: source(
          "./src/compat/next-link.tsx",
        ),
      },
      {
        find: "next-auth/react",
        replacement: source(
          "./src/compat/next-auth-react.tsx",
        ),
      },
      {
        find: "next-auth",
        replacement: source(
          "./src/compat/next-auth.ts",
        ),
      },
      {
        find: "next-intl/navigation",
        replacement: source(
          "./src/compat/next-intl-navigation.tsx",
        ),
      },
      {
        find: "next-intl",
        replacement: source(
          "./src/compat/next-intl.tsx",
        ),
      },
    ],
  },
  define: {
    "process.env.NODE_ENV": JSON.stringify(mode),
    "process.env.NEXT_PUBLIC_APP_NAME":
      JSON.stringify("ZoeSkoul"),
  },
  server: {
    host: "localhost",
    port: zoeSkoulApps.student.localPort,
    strictPort: true,
    proxy: {
      "/api": {
        target: getLocalAppOrigin("website"),
        changeOrigin: true,
        secure: false,
      },
    },
  },
  preview: {
    host: "localhost",
    port: zoeSkoulApps.student.localPort,
    strictPort: true,
  },
}));
