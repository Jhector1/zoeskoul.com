import { describe, expect, it, vi } from "vitest";
import { constantTimeEqual, handoffBuilderOrigin, isDevelopmentLoopbackHandoffOrigin, isOpaque, isSha256, randomOpaque, safeBuilderPath, sha256 } from "./buildHandoffProtocol";
describe("website handoff boundary", () => {
  it("requires unpredictable opaque tickets and 256-bit challenges", () => {
    const ticket = randomOpaque();
    expect(isOpaque(ticket)).toBe(true);
    expect(isSha256(sha256(ticket))).toBe(true);
    expect(isSha256("bad")).toBe(false);
    expect(constantTimeEqual(sha256(ticket), sha256(ticket))).toBe(true);
  });
  it("rejects open redirects and internal auth endpoints", () => {
    for (const path of ["//evil.example", "https://evil.example", "/api/auth/logout", "/authenticate", "/\\evil.example"]) {
      expect(safeBuilderPath(path)).toBe("/en/projects");
    }
    expect(safeBuilderPath("/fr/projects?tab=source")).toBe("/fr/projects?tab=source");
  });
});

describe("Web Builder handoff local origin", () => {
  it("accepts exact HTTP loopback in development", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("ZOESKOUL_BUILD_HANDOFF_ORIGIN", "http://localhost:3004");
    try {
      expect(handoffBuilderOrigin()).toBe("http://localhost:3004");
      expect(isDevelopmentLoopbackHandoffOrigin(new URL("http://127.0.0.1:3004"))).toBe(true);
    } finally { vi.unstubAllEnvs(); }
  });
  it("rejects public HTTP in development and local HTTP in production", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("ZOESKOUL_BUILD_HANDOFF_ORIGIN", "http://dev-build.zoeskoul.com");
    try { expect(() => handoffBuilderOrigin()).toThrow("Untrusted"); }
    finally { vi.unstubAllEnvs(); }
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ZOESKOUL_BUILD_HANDOFF_ORIGIN", "http://localhost:3004");
    try { expect(() => handoffBuilderOrigin()).toThrow("Untrusted"); }
    finally { vi.unstubAllEnvs(); }
  });
  it("still accepts HTTPS configured Builder handoff", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ZOESKOUL_BUILD_HANDOFF_ORIGIN", "https://dev-build.zoeskoul.com");
    try { expect(handoffBuilderOrigin()).toBe("https://dev-build.zoeskoul.com"); }
    finally { vi.unstubAllEnvs(); }
  });
});
