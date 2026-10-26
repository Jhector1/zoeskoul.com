import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { makeZoeChatTurn } from "./zoeChatTurns";

const shell = new URL("../../app/[locale]/projects/[buildProjectId]/ProjectBuilderShell.tsx", import.meta.url);
const component = new URL("../../app/[locale]/projects/[buildProjectId]/ZoeAssistantMessage.tsx", import.meta.url);
const css = new URL("../../app/[locale]/projects/[buildProjectId]/ZoeAssistantMessage.module.css", import.meta.url);

describe("E17J real chat roles and readable right-side user bubbles", () => {
  it("keeps user text exactly as entered without adding a visible role prefix", () => {
    expect(makeZoeChatTurn("user", "Update the hero text")).toEqual({role:"user",text:"Update the hero text"});
    expect(makeZoeChatTurn("assistant", "You: is literal text")).toEqual({role:"assistant",text:"You: is literal text"});
  });
  it("assigns chat roles structurally and does not show a You label", () => {
    const source = readFileSync(shell, "utf8");
    // E17K records each turn through a central helper, which then creates the
    // structured role. Assert the actual role-carrying callsites, not an
    // obsolete direct factory call that no longer appears in this component.
    expect(source).toContain('recordChatTurn("user",');
    expect(source).toContain('recordChatTurn("assistant",');
    expect(source).toContain('makeZoeChatTurn(role, text)');
    expect(source).toContain('role={message.role}');
    expect(source).not.toContain('`You: ${submission.prompt');
    expect(source).not.toContain("isZoeUserTurn");
  });
  it("renders user messages literally on the right while preserving shared Markdown for assistant replies", () => {
    const source = readFileSync(component, "utf8");
    expect(source).toContain('if (role === "user")');
    expect(source).toContain('data-chat-role="user"');
    expect(source).toContain('data-chat-role="assistant"');
    expect(source).toContain('<span className={styles.userText}>{message}</span>');
    expect(source).toContain('<MathMarkdown content={message.slice(0, length)}');
    expect(source).toContain('role === "assistant"');
    expect(source).toContain('aria-label={typing ? message : undefined}');
  });
  it("right-aligns subtle user bubbles without styling preview or generated storefront", () => {
    const source = readFileSync(css, "utf8");
    expect(source).toContain('.bubble.userBubble');
    expect(source).toContain('margin: 9px 0 14px auto');
    expect(source).toContain('.bubble.assistantBubble');
    expect(source).toContain('margin: 9px auto 14px 0');
    expect(source.replace(/\/\*[\s\S]*?\*\//g, "")).not.toMatch(/(?:^|[,}])\s*iframe\s*[{,.#:>]/m);
  });
});
