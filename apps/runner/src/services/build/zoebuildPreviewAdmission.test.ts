import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, unlinkSync, symlinkSync, linkSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertZoebuildPreviewAdmissionOpen as admit, ZoebuildPreviewMaintenanceError } from "./zoebuildPreviewAdmission.js";

afterEach(() => vi.unstubAllEnvs());
describe("ZoeBuild operator-managed preview admission", () => {
  it("preserves legacy default and rejects malformed managed configuration", () => {
    vi.stubEnv("ZOEBUILD_PREVIEW_MANAGED_ADMISSION_ENABLED", undefined);
    expect(() => admit()).not.toThrow();
    expect(() => admit("false", "/nonexistent")).not.toThrow();
    for (const value of ["", "TRUE", "1", "no"])
      expect(() => admit(value)).toThrow(ZoebuildPreviewMaintenanceError);
  });
  it("observes marker creation/removal without restarting the process", () => {
    const dir = mkdtempSync(join(tmpdir(), "zoebuild-admission-"));
    const marker = join(dir, "open");
    try {
      expect(() => admit("true", marker)).toThrow(ZoebuildPreviewMaintenanceError);
      writeFileSync(marker, "");
      expect(() => admit("true", marker)).not.toThrow();
      unlinkSync(marker);
      expect(() => admit("true", marker)).toThrow(ZoebuildPreviewMaintenanceError);
      writeFileSync(marker, "");
      expect(() => admit("true", marker)).not.toThrow();
    } finally { rmSync(dir, { recursive: true, force: true }); }
    expect(() => admit("true", marker)).toThrow(ZoebuildPreviewMaintenanceError);
  });
  it("rejects nonempty files, symlink, directory and multiply-linked marker", () => {
    const dir = mkdtempSync(join(tmpdir(), "zoebuild-admission-"));
    const marker = join(dir, "open"), other = join(dir, "other");
    try {
      writeFileSync(other, ""); writeFileSync(marker, "unexpected");
      expect(() => admit("true", marker)).toThrow(ZoebuildPreviewMaintenanceError);
      unlinkSync(marker); symlinkSync(other, marker);
      expect(() => admit("true", marker)).toThrow(ZoebuildPreviewMaintenanceError);
      unlinkSync(marker); linkSync(other, marker);
      expect(() => admit("true", marker)).toThrow(ZoebuildPreviewMaintenanceError);
      unlinkSync(marker); mkdirSync(marker);
      expect(() => admit("true", marker)).toThrow(ZoebuildPreviewMaintenanceError);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
