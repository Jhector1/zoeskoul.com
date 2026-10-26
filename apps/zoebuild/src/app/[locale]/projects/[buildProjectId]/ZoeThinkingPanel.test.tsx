import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { deriveZoeThinkingActivity } from "./zoeThinkingActivity";

// This file intentionally has no component import: ZoeBuild's existing
// Vitest/Vite setup preserves Next.js JSX, which Vite import-analysis cannot
// parse without a dedicated TSX transform. Production TSX is typechecked
// separately; these assertions execute the component's shared display logic.
describe("E17D1 quiet and truthful Zoé activity", () => {
  it("hides completed activity after successful apply clears its summary", () => {
    const result = deriveZoeThinkingActivity({busy:false, phase:"checking", summary:"   "});
    expect(result.visible).toBe(false);
  });

  it("shows a real operation phase, not an invented completion percentage", () => {
    const result = deriveZoeThinkingActivity({busy:true, phase:"model_requested", summary:""});
    expect(result.visible).toBe(true);
    expect(result.state).toBe("active");
    expect(result.message).toBe("Preparing the requested changes");
    expect(result.message).not.toContain("% complete");
  });

  it("preserves real model-supplied text and normalizes the compact preview", () => {
    const result = deriveZoeThinkingActivity({busy:true, phase:"model_requested", summary:"  Checking  styles\n and  layout  "});
    expect(result.cleaned).toBe("Checking  styles\n and  layout");
    expect(result.summaryPreview).toBe("Checking styles and layout");
  });

  it("marks prepared proposals as ready, not applied", () => {
    const result = deriveZoeThinkingActivity({busy:false, phase:"proposal_validated", summary:"Proposal prepared"});
    expect(result.ready).toBe(true);
    expect(result.failed).toBe(false);
    expect(result.message).toBe("Changes are ready to review");
    expect(result.eyebrow).toBe("Proposal ready");
  });

  it("reports a stopped request without inventing a success", () => {
    const result = deriveZoeThinkingActivity({busy:false, phase:"checking", summary:"Attempt stopped"});
    expect(result.failed).toBe(true);
    expect(result.state).toBe("failed");
  });

  it("keeps the production TSX wired to the tested state and truthful summary label", () => {
    const tsx = readFileSync(new URL("./ZoeThinkingPanel.tsx", import.meta.url), "utf8");
    expect(tsx).toContain("deriveZoeThinkingActivity({ busy, phase, summary })");
    expect(tsx).toContain("data-state={activity.state}");
    expect(tsx).toContain("Model-supplied activity summary");
    expect(tsx).toContain("View activity summary");
    expect(tsx).toContain('from "@zoeskoul/learner-workspace/ui/markdown/MathMarkdown"');
    expect(tsx).toContain("<MathMarkdown content={cleaned} />");
    expect(tsx).not.toContain("<p>{cleaned}</p>");
  });
});
