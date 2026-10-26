import { describe, expect, it, vi } from "vitest";
import { constantTimeEqual, isDevelopmentLoopbackOrigin, isOpaque, randomOpaque, safeReturnPath, sha256 } from "./buildHandoff";
describe("builder handoff security boundaries", () => {
  it("generates unpredictable state and enforces verifier binding", () => {
    const a = randomOpaque(); const b = randomOpaque();
    expect(isOpaque(a)).toBe(true);
    expect(a).not.toBe(b);
    expect(constantTimeEqual(sha256(a), sha256(a))).toBe(true);
    expect(constantTimeEqual(sha256(a), sha256(b))).toBe(false);
  });
  it("never accepts an external or protocol-relative return", () => {
    for (const value of ["https://evil.example", "//evil.example", "/api/auth/handoff/callback", "/authenticate", "/\\evil.example", "\u0000"]) {
      expect(safeReturnPath(value)).toBe("/en/projects");
    }
    expect(safeReturnPath("/en/projects/a?view=code")).toBe("/en/projects/a?view=code");
  });
});

describe("local Builder handoff HTTPS exception", () => {
  it("permits localhost HTTP only under development", () => {
    vi.stubEnv("NODE_ENV", "development");
    try {
      expect(isDevelopmentLoopbackOrigin(new URL("http://localhost:3004"))).toBe(true);
      expect(isDevelopmentLoopbackOrigin(new URL("http://127.0.0.1:3004"))).toBe(true);
      expect(isDevelopmentLoopbackOrigin(new URL("http://[::1]:3004"))).toBe(true);
      expect(isDevelopmentLoopbackOrigin(new URL("http://dev-build.zoeskoul.com"))).toBe(false);
      expect(isDevelopmentLoopbackOrigin(new URL("http://localhost:3004/redirect"))).toBe(false);
    } finally { vi.unstubAllEnvs(); }
  });
  it("never allows local HTTP in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    try { expect(isDevelopmentLoopbackOrigin(new URL("http://localhost:3004"))).toBe(false); }
    finally { vi.unstubAllEnvs(); }
  });
});
