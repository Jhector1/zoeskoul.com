import { describe, it, expect } from "vitest";
import {
  isDevelopmentPreviewCandidate, isTrustedDevelopmentPreviewRoot,
  developmentPreviewDocumentUrl,
} from "./reactDevelopmentPreviewDocumentRoot";
const preview = "preview_11111111-1111-4111-8111-111111111111";
const prefix = `/api/build/projects/project_1/preview/${preview}/development/content/`;
const durable = prefix + "dpg1." + "A".repeat(43) + "/";
const ephemeral = prefix + "dpv1." + "b".repeat(100) + "/";

describe("ZoeBuild-only development document root", () => {
  it("accepts only exact saved-preview read grants, never untrusted origins", () => {
    for (const path of [durable, ephemeral]) {
      expect(isTrustedDevelopmentPreviewRoot(path)).toBe(true);
      expect(developmentPreviewDocumentUrl(path, "/")).toBe(path);
      expect(developmentPreviewDocumentUrl(path, "/about")).toBe(path + "about");
    }
    for (const value of [
      "https://evil.example" + durable, "//evil.example/", "/untrusted/",
      durable + "?x=1", durable + "#hash", durable.slice(0, -1),
      prefix + "dpg1." + "x".repeat(42) + "/",
      prefix + "dpg1." + "x".repeat(44) + "/",
      prefix + "../../", prefix + "dpg1." + "A".repeat(43) + "/%2e/",
    ]) {
      expect(isTrustedDevelopmentPreviewRoot(value)).toBe(false);
    }
  });
  it("never turns browser navigation into external or traversal requests", () => {
    for (const page of ["//evil", "/../x", "/%2e%2e/x", "/x?hi=1", "/x#h", "/a\\b", "http://evil", "/a//b", "/a/."]) {
      expect(() => developmentPreviewDocumentUrl(durable, page)).toThrow();
    }
  });
  it("routes development candidates away from immutable viewer fail-closed", () => {
    expect(isDevelopmentPreviewCandidate(durable)).toBe(true);
    expect(isDevelopmentPreviewCandidate(prefix + "invalid/")).toBe(true);
    expect(isDevelopmentPreviewCandidate("/api/build/projects/p/preview/preview_a/content/immutable/")).toBe(false);
  });
});
