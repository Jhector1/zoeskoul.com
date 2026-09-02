import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function source(rel: string) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

describe("Student semantic theme surface ownership", () => {
  it("keeps visible tutoring shells on ZoeSkoul semantic owners", () => {
    const combined = [
      "src/features/tutoring/HumanTutoringHub.tsx",
      "src/features/tutoring/HumanTutoringRequestModal.tsx",
      "src/features/tutoring/HumanTutoringManageCreditsModal.tsx",
      "src/exact-old-ui/ExactTutoringSessionView.tsx",
    ].map(source).join("\n");

    expect(combined).not.toContain('dark:bg-[#0b0d12]');
    expect(combined).not.toContain('dark:bg-[#0f1218]');
    expect(combined).not.toContain("dark:bg-white/[0.025]");
    expect(combined).toContain("var(--ui-bg)");
    expect(combined).toContain("ui-surface-floating");
    expect(combined).toContain("ui-surface-soft");
    expect(combined).toContain("ui-surface-muted");
  });

  it("reuses shared progress and input ownership in tutoring request", () => {
    const request = source("src/features/tutoring/HumanTutoringRequestModal.tsx");
    expect(request).toContain("ui-progress-track");
    expect(request).toContain("ui-progress-fill");
    expect(request).toContain('className="ui-input mt-2 min-h-12 w-full"');
    expect(request).not.toContain("border-neutral-300 bg-white");
    expect(request).not.toContain("border-neutral-200 bg-white hover:bg-neutral-50");
  });

  it("uses shared UI primitives for the student campaign dialog", () => {
    const campaign = source("src/features/campaigns/StudentCampaignHost.tsx");
    expect(campaign).toContain("ui-surface-floating");
    expect(campaign).toContain("ui-btn-secondary");
    expect(campaign).toContain("ui-btn-primary");
    expect(campaign).toContain("ui-badge-good");
    expect(campaign).not.toContain("dark:bg-neutral-950");
  });

  it("keeps bootstrap state styling on semantic UI variables", () => {
    const shell = source("src/shell.css");
    expect(shell).toContain("rgb(var(--ui-bg) / 1)");
    expect(shell).toContain("rgb(var(--ui-surface) / 0.94)");
    expect(shell).toContain("rgb(var(--ui-border) / 0.58)");
    expect(shell).toContain("rgb(var(--ui-accent) / 1)");
    expect(shell).not.toContain("html.dark .student-state-card");
  });
});
