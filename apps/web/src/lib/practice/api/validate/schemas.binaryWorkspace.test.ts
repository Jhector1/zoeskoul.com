import { describe, expect, it } from "vitest";

import { BodySchema } from "./schemas";

describe("practice validate schema: web binary workspaces", () => {
  it("accepts the canonical HTML FullIDE submission shape", () => {
    const parsed = BodySchema.safeParse({
      key: "draftqa.web-binary-workspace",
      answer: {
        kind: "code_input",
        language: "web",
        code: "<!doctype html><html><body>Profile</body></html>",
        entry: "index.html",
        files: [
          {
            kind: "file",
            path: "index.html",
            content: "<!doctype html><html><body>Profile</body></html>",
          },
          {
            kind: "file",
            path: "about.html",
            content: "<!doctype html><html><body>About</body></html>",
          },
          {
            kind: "directory",
            path: "images",
          },
          {
            kind: "file",
            path: "images/profile.png",
            encoding: "base64",
            data: "AAECAwQ=",
            mimeType: "image/png",
            sizeBytes: 5,
          },
        ],
      },
    });

    expect(parsed.success).toBe(true);
  });

  it("still rejects a file entry that is neither text nor binary", () => {
    const parsed = BodySchema.safeParse({
      key: "draftqa.invalid-workspace-file",
      answer: {
        kind: "code_input",
        language: "web",
        entry: "index.html",
        files: [
          {
            kind: "file",
            path: "index.html",
          },
        ],
      },
    });

    expect(parsed.success).toBe(false);
  });

  it("preserves existing single-file programming submissions", () => {
    const parsed = BodySchema.safeParse({
      key: "practice.python-single-file",
      answer: {
        kind: "code_input",
        language: "python",
        code: 'print("hello")',
      },
    });

    expect(parsed.success).toBe(true);
  });
});
