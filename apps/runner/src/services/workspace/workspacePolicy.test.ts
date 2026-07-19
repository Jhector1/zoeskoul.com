import { describe, expect, it } from "vitest";
import {
  isAllowedWorkspaceFile,
  normalizeWorkspaceEntries,
} from "./workspacePolicy.js";

const SMALL_PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB";

describe("workspacePolicy", () => {
  it("allows learner text files used by terminal and web projects", () => {
    const paths = [
      "backups/.keep",
      "inbox/temp.tmp",
      "logs/app.log",
      "desk/.locker",
      "desk/.secret-note",
      "site/index.html",
      "site/styles/theme.scss",
      "site/scripts/app.mjs",
      "site/components/App.tsx",
      "site/components/Card.vue",
      "site/components/Nav.svelte",
      "site/pages/index.astro",
      "site/assets/logo.svg",
      "site/site.webmanifest",
      "site/content/guide.mdx",
      "src/main.go",
      "src/lib.rs",
      "src/App.kt",
      "src/page.php",
      "src/query.graphql",
      "prisma/schema.prisma",
      "infra/main.tf",
      "templates/page.ejs",
      "config/app.toml",
      "Dockerfile",
      "Makefile",
      "CODEOWNERS",
      ".gitignore",
      ".editorconfig",
    ];

    for (const path of paths) {
      expect(isAllowedWorkspaceFile(path), path).toBe(true);
    }
  });

  it("allows explicitly supported binary assets and documents", () => {
    const paths = [
      "assets/photo.png",
      "assets/archive.zip",
      "assets/font.woff2",
      "docs/guide.pdf",
      "media/demo.mp4",
      "docs/brief.docx",
      "data/app.sqlite",
      "dist/module.wasm",
    ];

    for (const path of paths) {
      expect(isAllowedWorkspaceFile(path), path).toBe(true);
    }
  });

  it("rejects executables, unknown formats, and sensitive runner metadata", () => {
    const paths = [
      "program.exe",
      "library.dll",
      "mystery.unknown",
      ".bash_history",
      ".env",
      ".env.local",
    ];

    for (const path of paths) {
      expect(isAllowedWorkspaceFile(path), path).toBe(false);
    }
  });

  it("normalizes a multi-file text workspace with authoritative MIME metadata", () => {
    expect(
      normalizeWorkspaceEntries([
        {
          kind: "file",
          path: "site/index.html",
          content: '<link rel="stylesheet" href="styles.css">\n',
        },
        {
          kind: "file",
          path: "site/styles.css",
          content: "body { margin: 0; }\n",
        },
        {
          kind: "file",
          path: "site/app.js",
          content: 'import data from "./data.json" with { type: "json" };\n',
        },
      ]),
    ).toEqual([
      {
        kind: "file",
        storage: "text",
        path: "site/app.js",
        content: 'import data from "./data.json" with { type: "json" };\n',
        mimeType: "text/javascript",
      },
      {
        kind: "file",
        storage: "text",
        path: "site/index.html",
        content: '<link rel="stylesheet" href="styles.css">\n',
        mimeType: "text/html",
      },
      {
        kind: "file",
        storage: "text",
        path: "site/styles.css",
        content: "body { margin: 0; }\n",
        mimeType: "text/css",
      },
    ]);
  });

  it("decodes binary entries exactly and ignores caller-provided MIME labels", () => {
    const normalized = normalizeWorkspaceEntries([
      {
        kind: "file",
        path: "assets/pixel.png",
        encoding: "base64",
        data: SMALL_PNG_BASE64,
        mimeType: "text/plain",
        sizeBytes: 24,
      },
    ]);

    expect(normalized).toHaveLength(1);
    expect(normalized[0]).toMatchObject({
      kind: "file",
      storage: "binary",
      path: "assets/pixel.png",
      mimeType: "image/png",
    });
    expect(normalized[0]?.kind === "file" && normalized[0].storage === "binary"
      ? normalized[0].bytes.toString("base64")
      : null).toBe(SMALL_PNG_BASE64);
  });

  it("rejects invalid binary size, checksum, and storage mismatches", () => {
    expect(() =>
      normalizeWorkspaceEntries([
        {
          kind: "file",
          path: "assets/pixel.png",
          encoding: "base64",
          data: SMALL_PNG_BASE64,
          mimeType: "image/png",
          sizeBytes: 23,
        },
      ]),
    ).toThrow(/size mismatch/i);

    expect(() =>
      normalizeWorkspaceEntries([
        {
          kind: "file",
          path: "assets/pixel.png",
          encoding: "base64",
          data: SMALL_PNG_BASE64,
          mimeType: "image/png",
          sizeBytes: 24,
          checksum: `sha256:${"0".repeat(64)}`,
        },
      ]),
    ).toThrow(/checksum mismatch/i);

    expect(() =>
      normalizeWorkspaceEntries([
        {
          kind: "file",
          path: "README.md",
          encoding: "base64",
          data: "SGVsbG8=",
          mimeType: "text/plain",
          sizeBytes: 5,
        },
      ]),
    ).toThrow(/text workspace file cannot use base64/i);
  });

  it("normalizes and preserves empty directories", () => {
    expect(
      normalizeWorkspaceEntries([
        { kind: "directory", path: "backups" },
        { kind: "file", path: "backups/.keep", content: "" },
      ]),
    ).toEqual([
      { kind: "directory", path: "backups" },
      {
        kind: "file",
        storage: "text",
        path: "backups/.keep",
        content: "",
        mimeType: "text/plain",
      },
    ]);
  });
});
