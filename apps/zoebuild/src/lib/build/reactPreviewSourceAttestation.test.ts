import { describe, expect, it } from "vitest";
import { matchesSavedTanstackPreviewRequest } from "./reactPreviewSourceAttestation";

const saved = {
  protocolVersion: 1 as const,
  operation: "production-build" as const,
  buildProjectId: "project-1",
  sourceVersion: 8,
  stackId: "tanstack-start-v1",
  templateId: "tanstack-start-v1",
  files: [
    { path: "package.json", content: "{}" },
    { path: "pnpm-lock.yaml", content: "lock-content" },
    { path: "src/routes/index.tsx", content: "saved source" },
  ],
};

describe("Phase 4B exact-source attestation", () => {
  it("accepts precisely equal saved request, regardless of file order", () => {
    expect(matchesSavedTanstackPreviewRequest(saved, saved)).toBe(true);
    expect(matchesSavedTanstackPreviewRequest({ ...saved, files: [...saved.files].reverse() }, saved)).toBe(true);
  });
  it("rejects stale and future versions, including an unchanged file set", () => {
    for (const sourceVersion of [7, 9, "8", 8.5])
      expect(matchesSavedTanstackPreviewRequest({ ...saved, sourceVersion }, saved)).toBe(false);
  });
  it("rejects changed bytes, missing files, extra files and different paths", () => {
    expect(matchesSavedTanstackPreviewRequest({ ...saved, files: saved.files.map(f => f.path.startsWith("src/") ? { ...f, content: "attacker" } : f) }, saved)).toBe(false);
    expect(matchesSavedTanstackPreviewRequest({ ...saved, files: saved.files.slice(0, -1) }, saved)).toBe(false);
    expect(matchesSavedTanstackPreviewRequest({ ...saved, files: [...saved.files, { path: "src/extra.ts", content: "x" }] }, saved)).toBe(false);
    expect(matchesSavedTanstackPreviewRequest({ ...saved, files: saved.files.map(f => f.path.startsWith("src/") ? { ...f, path: "src/other.tsx" } : f) }, saved)).toBe(false);
  });
  it("rejects other projects, stacks, templates, operations or protocol versions", () => {
    for (const field of ["buildProjectId", "stackId", "templateId", "operation", "protocolVersion"] as const) {
      expect(matchesSavedTanstackPreviewRequest({ ...saved, [field]: "wrong" }, saved)).toBe(false);
    }
  });
  it("rejects unsafe paths, duplicate paths and extra body fields", () => {
    expect(matchesSavedTanstackPreviewRequest({ ...saved, files: [...saved.files, { path: "../escape.ts", content: "x" }] }, saved)).toBe(false);
    expect(matchesSavedTanstackPreviewRequest({ ...saved, files: [...saved.files, { path: "SRC/ROUTES/INDEX.TSX", content: "x" }] }, saved)).toBe(false);
    expect(matchesSavedTanstackPreviewRequest({ ...saved, ownerId: "attacker" }, saved)).toBe(false);
  });
});
