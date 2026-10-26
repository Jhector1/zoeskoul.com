import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const chat = new URL("../../app/[locale]/projects/[buildProjectId]/ZoeAssistantMessage.tsx", import.meta.url);
const styles = new URL("../../app/[locale]/projects/[buildProjectId]/ZoeAssistantMessage.module.css", import.meta.url);
const owner = new URL("../../../../../packages/learner-workspace/src/ui/markdown/MathMarkdown.tsx", import.meta.url);
const renderer = new URL("../../../../../packages/lesson-renderer/src/index.tsx", import.meta.url);

// Source ownership tests avoid importing JSX into the repo's Vite import-analysis
// pipeline (Next's tsconfig preserves JSX). Production TSX is typechecked.
describe("E17I reuse package MathMarkdown in Zoé chat", () => {
  it("reuses the canonical package export rather than a second inline parser", () => {
    const source = readFileSync(chat, "utf8");
    expect(source).toContain('from "@zoeskoul/learner-workspace/ui/markdown/MathMarkdown"');
    expect(source).toContain('<MathMarkdown content={message.slice(0, length)}');
    expect(source).not.toContain("formatZoeReply");
    expect(readFileSync(owner, "utf8")).toContain('from "@zoeskoul/lesson-renderer"');
  });
  it("preserves the existing safe Markdown behavior without permitting raw HTML", () => {
    const source = readFileSync(renderer, "utf8");
    for (const feature of ["remarkGfm", "remarkMath", "rehypeKatex", "rehypeHighlight", "skipHtml", "urlTransform={safeMarkdownUrl}"]) {
      expect(source).toContain(feature);
    }
  });
  it("retains typed replies, full screen-reader text, reduced-motion handling and scoped styles", () => {
    const component = readFileSync(chat, "utf8");
    expect(component).toContain("nextZoeResponseTypingLength");
    expect(component).toContain("prefers-reduced-motion: reduce");
    expect(component).toContain("aria-label={typing ? message : undefined}");
    expect(component).toContain("aria-hidden={typing ? true : undefined}");
    const css = readFileSync(styles, "utf8");
    expect(css).toContain(".markdown :global(table)");
    expect(css.replace(/\/\*[\s\S]*?\*\//g, "")).not.toMatch(/(?:^|[,}])\s*iframe\s*[{,.#:>]/m);
  });
});
