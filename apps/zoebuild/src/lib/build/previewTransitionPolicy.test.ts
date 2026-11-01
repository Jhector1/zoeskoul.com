import { describe, expect, it } from "vitest";
import { previewOperationStageMessage, previewStartOutcomeIsCurrent } from "./previewTransitionPolicy";

describe("preview transition policy", () => {
  it("maps each runner-owned stage without pretending a frame is rendered", () => {
    const cases = [
      ["queued", "Waiting for an available preview worker…"],
      ["workspace", "Synchronizing the selected saved files…"],
      ["dependencies", "Preparing approved project dependencies…"],
      ["container", "Starting the isolated website worker…"],
      ["readiness", "Checking that the website responds…"],
    ] as const;
    for (const [stage, copy] of cases) {
      expect(previewOperationStageMessage(stage)).toBe(copy);
    }
    expect(previewOperationStageMessage("unknown")).toContain("Preparing");
  });

  it("accepts a completion only when both source and local workspace fence match", () => {
    const current = { startedSourceVersion: 197, selectedSourceVersion: 197,
      startedWorkspaceRevision: 4, selectedWorkspaceRevision: 4 };
    expect(previewStartOutcomeIsCurrent(current)).toBe(true);
    expect(previewStartOutcomeIsCurrent({ ...current, selectedSourceVersion: 198 })).toBe(false);
    expect(previewStartOutcomeIsCurrent({ ...current, selectedWorkspaceRevision: 5 })).toBe(false);
    expect(previewStartOutcomeIsCurrent({ ...current, selectedSourceVersion: 196 })).toBe(false);
  });
});
