import { describe, expect, it } from "vitest";

import {
  assertWorkspaceRelativePath,
  binaryWorkspaceFileEntrySchema,
  isSafeWorkspaceRelativePath,
  normalizeWorkspaceBase64,
  resolveWorkspaceEditorLanguage,
  resolveWorkspaceFileCapability,
  workspaceBase64DecodedByteLength,
} from "./workspaceFiles.js";

describe("workspace file capabilities", () => {
  it("routes source and configuration files to Monaco with useful language ids", () => {
    expect(resolveWorkspaceFileCapability("site/index.html")).toMatchObject({
      storage: "text",
      viewer: "editor",
      mimeType: "text/html",
      editable: true,
    });
    expect(resolveWorkspaceEditorLanguage("components/App.tsx")).toBe(
      "typescript",
    );
    expect(resolveWorkspaceEditorLanguage("styles/theme.scss")).toBe("scss");
    expect(resolveWorkspaceEditorLanguage("Dockerfile")).toBe("dockerfile");
  });

  it("routes major binary formats to dedicated viewers or safe details", () => {
    expect(resolveWorkspaceFileCapability("assets/photo.png")).toMatchObject({
      storage: "binary",
      viewer: "image",
      mimeType: "image/png",
    });
    expect(resolveWorkspaceFileCapability("handout.pdf")?.viewer).toBe("pdf");
    expect(resolveWorkspaceFileCapability("voice.mp3")?.viewer).toBe("audio");
    expect(resolveWorkspaceFileCapability("demo.mp4")?.viewer).toBe("video");
    expect(resolveWorkspaceFileCapability("font.woff2")?.viewer).toBe("font");
    expect(resolveWorkspaceFileCapability("starter.zip")?.viewer).toBe(
      "archive",
    );
    expect(resolveWorkspaceFileCapability("brief.docx")?.viewer).toBe(
      "details",
    );
    expect(resolveWorkspaceFileCapability("data.sqlite")?.viewer).toBe(
      "details",
    );
  });

  it("rejects absolute, traversal, and drive-qualified workspace paths", () => {
    expect(isSafeWorkspaceRelativePath("assets/photo.png")).toBe(true);
    expect(isSafeWorkspaceRelativePath("../photo.png")).toBe(false);
    expect(isSafeWorkspaceRelativePath("/tmp/photo.png")).toBe(false);
    expect(isSafeWorkspaceRelativePath("C:\\tmp\\photo.png")).toBe(false);
    expect(resolveWorkspaceFileCapability("../photo.png")).toBeNull();
    expect(() => assertWorkspaceRelativePath("../photo.png")).toThrow(
      /unsafe workspace path/i,
    );
  });

  it("rejects secrets, executables, and unknown formats", () => {
    expect(resolveWorkspaceFileCapability(".env")).toBeNull();
    expect(resolveWorkspaceFileCapability(".env.local")).toBeNull();
    expect(resolveWorkspaceFileCapability("program.exe")).toBeNull();
    expect(resolveWorkspaceFileCapability("payload.dll")).toBeNull();
    expect(resolveWorkspaceFileCapability("mystery.unknown")).toBeNull();
  });

  it("rejects control-plane, credential, and traversal paths", () => {
    expect(resolveWorkspaceFileCapability(".git/config")).toBeNull();
    expect(resolveWorkspaceFileCapability("project/.git/README.md")).toBeNull();
    expect(resolveWorkspaceFileCapability(".ssh/config")).toBeNull();
    expect(resolveWorkspaceFileCapability(".env")).toBeNull();
    expect(resolveWorkspaceFileCapability(".env.local")).toBeNull();
    expect(resolveWorkspaceFileCapability("../secret.txt")).toBeNull();
    expect(resolveWorkspaceFileCapability(".zoeskoul/setup.sh")).toMatchObject({
      storage: "text",
      viewer: "editor",
    });
  });

});

describe("workspace binary payloads", () => {
  it("normalizes canonical base64 and reports its exact decoded size", () => {
    expect(normalizeWorkspaceBase64("AAEC\nAw==")).toBe("AAECAw==");
    expect(workspaceBase64DecodedByteLength("AAECAw==")).toBe(4);
  });

  it("rejects malformed base64", () => {
    expect(normalizeWorkspaceBase64("%%%=")).toBeNull();
    expect(workspaceBase64DecodedByteLength("abc")).toBeNull();
  });

  it("accepts a size-matched binary entry", () => {
    expect(
      binaryWorkspaceFileEntrySchema.parse({
        kind: "file",
        path: "assets/pixel.png",
        encoding: "base64",
        data: "AAECAw==",
        mimeType: "image/png",
        sizeBytes: 4,
        checksum:
          "sha256:054edec1d0211f624fed0cbca9d4f9400b0e491c43742af2c5b0abebf0c990d8",
      }),
    ).toMatchObject({ sizeBytes: 4, encoding: "base64" });
  });

  it("rejects a declared size that does not match the payload", () => {
    expect(() =>
      binaryWorkspaceFileEntrySchema.parse({
        kind: "file",
        path: "assets/pixel.png",
        encoding: "base64",
        data: "AAECAw==",
        mimeType: "image/png",
        sizeBytes: 3,
      }),
    ).toThrow();
  });
});
