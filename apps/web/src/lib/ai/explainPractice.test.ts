import { describe, expect, it } from "vitest";

import {
  buildPracticeTutorFallback,
  buildPracticeTutorPrompt,
} from "./explainPractice";

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

describe("buildPracticeTutorFallback", () => {
  const diagnosticContext = {
    version: 1 as const,
    domain: "terminal" as const,
    task: {
      title: "Inspect the event desk",
      prompt: "Use terminal commands to inspect the event desk.",
      kind: "code_input",
      topicSlug: "inspect-event-desk",
    },
    learnerVisibleContext: { language: "bash" },
    environment: { language: "bash" },
    starterState: {},
    learnerState: {
      currentAttempt: {},
      recentSubmittedAttempts: [],
    },
    failedChecks: {
      feedbackMessage: "Use `ls` to inspect the event desk.",
    },
    privateReference: {
      expected: {},
      expectedAnswer: null,
      authoredExplanation: null,
    },
  };

  it("uses learner-visible checker feedback instead of one static sentence", () => {
    expect(
      buildPracticeTutorFallback({ diagnosticContext }),
    ).toContain("Use `ls` to inspect the event desk.");
  });

  it("answers an explanation request differently from the initial fallback", () => {
    const initial = buildPracticeTutorFallback({ diagnosticContext });
    const explained = buildPracticeTutorFallback({
      diagnosticContext,
      message: "explain",
    });

    expect(explained).not.toBe(initial);
    expect(explained).toContain("means this is the part that still differs");
  });
});
