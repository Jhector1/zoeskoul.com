import { describe, expect, it } from "vitest";

import { resolveWorkspaceFileIconKind } from "./WorkspaceFileIcon";

describe("workspace file icon resolver", () => {
    it("uses React icons for JSX/TSX and language icons for plain TS/JS", () => {
        expect(resolveWorkspaceFileIconKind("src/App.tsx")).toBe("react");
        expect(resolveWorkspaceFileIconKind("src/Card.jsx")).toBe("react");
        expect(resolveWorkspaceFileIconKind("src/server.ts")).toBe("typescript");
        expect(resolveWorkspaceFileIconKind("src/start.js")).toBe("javascript");
    });

    it("maps common source and content files to real icon categories", () => {
        expect(resolveWorkspaceFileIconKind("src/styles.css")).toBe("css");
        expect(resolveWorkspaceFileIconKind("index.html")).toBe("html");
        expect(resolveWorkspaceFileIconKind("package.json")).toBe("json");
        expect(resolveWorkspaceFileIconKind("README.md")).toBe("markdown");
        expect(resolveWorkspaceFileIconKind("scripts/build.py")).toBe("python");
        expect(resolveWorkspaceFileIconKind("query.sql")).toBe("sql");
        expect(resolveWorkspaceFileIconKind("public/favicon.ico")).toBe("image");
        expect(resolveWorkspaceFileIconKind("public/robots.txt")).toBe("text");
    });

    it("handles special project filenames without fake abbreviation badges", () => {
        expect(resolveWorkspaceFileIconKind(".gitignore")).toBe("git");
        expect(resolveWorkspaceFileIconKind("bun.lock")).toBe("lock");
        expect(resolveWorkspaceFileIconKind("pnpm-lock.yaml")).toBe("lock");
        expect(resolveWorkspaceFileIconKind("Dockerfile")).toBe("docker");
        expect(resolveWorkspaceFileIconKind(".env.local")).toBe("env");
        expect(resolveWorkspaceFileIconKind("vite.config.ts")).toBe("config");
        expect(resolveWorkspaceFileIconKind("tsconfig.json")).toBe("config");
    });

    it("keeps a generic fallback for unknown files", () => {
        expect(resolveWorkspaceFileIconKind("LICENSE")).toBe("generic");
        expect(resolveWorkspaceFileIconKind("asset.unknown")).toBe("generic");
    });
});
