import { describe, expect, it } from "vitest";

import { buildPracticeTutorPrompt } from "./explainPractice";

describe("buildPracticeTutorPrompt", () => {
  it("gives the model private expected state while explicitly forbidding disclosure", () => {
    const prompt = buildPracticeTutorPrompt({
      diagnosticContext: {
        version: 1,
        domain: "terminal",
        task: {
          title: "Rename the schedule",
          prompt: "Rename the tracked schedule to events.txt.",
          kind: "code_input",
          topicSlug: "rename-files",
        },
        learnerVisibleContext: { language: "bash", recipeType: "shell_task" },
        environment: { language: "bash" },
        starterState: {
          starterFiles: [{ path: "schedule.txt", content: "Friday" }],
        },
        learnerState: {
          currentAttempt: {
            terminalEvidence: { commands: ["mv schedule.txt events.txt"] },
          },
          recentSubmittedAttempts: [],
        },
        failedChecks: { feedbackMessage: "The rename is not recorded by Git." },
        privateReference: {
          expected: {
            workspaceExpectations: { requiredFiles: ["events.txt"] },
            solutionCode: "git mv schedule.txt events.txt",
          },
          expectedAnswer: null,
          authoredExplanation: null,
        },
      },
    });

    const userMessage = prompt.messages.at(-1)?.content ?? "";
    expect(userMessage).toContain("git mv schedule.txt events.txt");
    expect(userMessage).toContain("PRIVATE REFERENCE");
    expect(prompt.system).toContain("never reveal");
    expect(prompt.system).toContain("resulting workspace or repository state");
  });
});
