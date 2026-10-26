import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function read(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");
}

describe("E12B builder sign-in terminal failure boundary", () => {
  it("never redirects a failed callback to a locale page that auto-retries", () => {
    const callback = read("../../app/api/auth/handoff/callback/route.ts");
    expect(callback).not.toContain("authError=handoff_failed");
    expect(callback).toContain("/auth/handoff/error?reason=");
    expect(callback).toContain("readBuilderSession(candidate)");
    expect(callback).toContain("revokeBuilderSession(candidate)");
    expect(callback).toContain("reason: failure");
  });

  it("halts protected-page automatic retries for stale sessions", () => {
    const projects = read("../../app/[locale]/projects/page.tsx");
    expect(projects).toContain('cookies()).has(SESSION_COOKIE)');
    expect(projects).toContain('/auth/handoff/error?reason=session_unavailable');
  });

  it("requires a user gesture to restart the handoff", () => {
    const errorPage = read("../../app/auth/handoff/error/page.tsx");
    expect(errorPage).toContain("Retry sign-in");
    expect(errorPage).toContain('/api/auth/handoff/start?returnTo=%2Fen%2Fprojects');
    expect(errorPage).not.toContain("redirect(");
    expect(errorPage).not.toContain("router.push(");
  });
});
