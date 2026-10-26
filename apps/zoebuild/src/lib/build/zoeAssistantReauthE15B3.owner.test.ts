import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const shell = readFileSync(fileURLToPath(new URL("../../app/[locale]/projects/[buildProjectId]/ProjectBuilderShell.tsx", import.meta.url)), "utf8");

describe("E15B3 Zoe assistant session recovery", () => {
  it("distinguishes a transient pending state from persisted messages", () => {
    expect(shell).toContain("assistantRequestInFlight.current");
    expect(shell).toContain("setAssistantChecking(true)");
    expect(shell).toContain("setAssistantChecking(false)");
    expect(shell).toContain('role="status"');
    expect(shell).not.toContain('addMessage("Zoé is checking your current project...")');
  });
  it("handles expired or unverifiable session for context and edit before treating results as proposals", () => {
    expect(shell).toContain('response.status === 401');
    expect(shell).toContain('editResponse.status === 401');
    expect(shell).toContain('payload?.code === "BUILD_AUTH_REQUIRED"');
    expect(shell).toContain('editResult?.code === "BUILD_AUTH_REQUIRED"');
    expect(shell).toContain("/api/auth/handoff/start?returnTo=");
    expect(shell).toContain("Reconnect Zoéskoul session");
  });
  it("does not bypass server authorization, change the source, or self-trigger a new login", () => {
    expect(shell).toContain("/assistant/context");
    expect(shell).toContain("/assistant/edit");
    expect(shell).toContain("Apply reviewed file edits");
    expect(shell).not.toContain("window.location.assign('/api/auth/handoff/start");
  });
});
