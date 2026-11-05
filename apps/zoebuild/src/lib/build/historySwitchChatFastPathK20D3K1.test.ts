import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const shell = readFileSync(new URL("../../app/[locale]/projects/[buildProjectId]/ProjectBuilderShell.tsx", import.meta.url), "utf8");

describe("K20D3K1 history chat fast path source contract", () => {
  it("defers version chat from history restore and clears prior scope before return", () => {
    expect(shell).toContain("await refreshAfterSuccessfulApply(savedVersion, undefined, {");
    expect(shell).toContain("deferChatForHistoryRestore: true");
    const start = shell.indexOf("if (options?.deferChatForHistoryRestore) {");
    const end = shell.indexOf("return verifiedPaths;", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const region = shell.slice(start, end);
    for (const required of [
      "chatScopeRef.current = null", "setChatSavedVersion(null)",
      "historyLoadRef.current = null", "chatHistoryRef.current = []",
      "setMessages([])", "setChatHistoryError(null)",
    ]) expect(region).toContain(required);
  });

  it("retains effect-driven chat scope verification and standard apply behavior", () => {
    expect(shell).toContain("},[props.project.buildProjectId,previewSourceVersion]);");
    expect(shell).toContain("const ready = await resolveChatScope(previewSourceVersion);");
    expect(shell).toContain("if (ready) await ensureChatHistoryLoaded();");
    expect(shell).toContain("if (await resolveChatScope(expectedVersion)) await ensureChatHistoryLoaded();");
    expect(shell).toContain("await refreshAfterSuccessfulApply(savedVersion, approvedEdits)");
  });
});
