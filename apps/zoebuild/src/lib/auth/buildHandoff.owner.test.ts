import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
const read = (relative: string) => readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");
describe("one Web identity, host-bound builder session", () => {
  it("sets Secure HttpOnly host-only cookies and verifies browser challenge", () => {
    const start = read("../../app/api/auth/handoff/start/route.ts");
    const callback = read("../../app/api/auth/handoff/callback/route.ts");
    expect(start).toContain('httpOnly: true, secure: true, sameSite: "lax"');
    expect(callback).toContain("constantTimeEqual(sha256(verifier), state)");
    expect(callback).toContain("exchangeHandoff(ticket, state, candidate)");
  });
  it("shares neither Auth.js cookies nor browser JWTs with ZoeBuild", () => {
    const server = read("../build/currentBuildAccess.ts");
    expect(server).toContain("readBuilderSession(token)");
    expect(server).not.toContain('headers.set("Cookie"');
    expect(server).not.toContain("createAuthClient");
  });
});
