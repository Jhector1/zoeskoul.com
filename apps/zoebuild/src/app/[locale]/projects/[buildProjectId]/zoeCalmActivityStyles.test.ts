import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const read = (name: string) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
describe("E17F quiet reasoning animation and builder control scope", () => {
  it("moves the subtle text highlight back and forth at a calm pace", () => {
    const css = read("ZoeThinkingPanel.module.css");
    expect(css).toContain("animation: zoeReadingGlow 9s ease-in-out infinite alternate");
    expect(css).toContain("@keyframes zoeReadingGlow");
    expect(css).toContain("animation: zoeActivityOrbit 5s linear infinite");
    expect(css).toContain("prefers-reduced-motion: reduce");
  });
  it("keeps the text stable as provider summary deltas arrive", () => {
    expect(read("ZoeThinkingPanel.tsx")).toContain("summaryPreview.slice(0, 200)");
  });
  it("styles ZoeBuild controls without touching the generated storefront", () => {
    expect(read("ZoeAssistantActions.module.css")).toContain(".primary:not(:disabled)");
    expect(read("ZoeAssistantActions.module.css")).not.toContain("iframe {");
    expect(read("BuildWorkspaceClient.tsx")).toContain("actionStyles.primary");
  });
});
