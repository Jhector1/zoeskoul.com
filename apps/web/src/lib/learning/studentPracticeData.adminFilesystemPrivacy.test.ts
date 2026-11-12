import {describe, expect, it} from "vitest";
import {projectStudentPracticeExercise} from "./studentPracticeExerciseData";
import {projectStudentPracticeValidation} from "./studentPracticeValidationData";

const secretContract = {
  required: [{
    path: "/workspace/hidden-evidence-must-not-leak",
    kind: "file",
    mode: "0600",
    uid: 1000,
    gid: 1000,
  }],
};

describe("student projections keep authoritative admin filesystem evidence private", () => {
  it("strips nested private evidence while retaining normal Course 1 workspace metadata", () => {
    const result = projectStudentPracticeExercise({
      id: "project-step-5",
      exerciseKey: "project-step-5",
      kind: "code_input",
      topic: "linux-files-permissions-users.final-capstone-secure-project",
      difficulty: "easy",
      title: "Inspect project permissions",
      prompt: "Use the Linux terminal.",
      language: "bash",
      adminLabFilesystemExpectations: secretContract,
      workspace: {
        entryFilePath: "main.sh",
        starterFiles: [{path: "main.sh", content: "echo hello\n"}],
        adminLabFilesystemExpectations: secretContract,
        nested: {
          adminLabFilesystemExpectations: secretContract,
          keepThisPublicField: "visible",
        },
      },
    });
    expect(result.payload).toMatchObject({
      language: "bash",
      workspace: {
        entryFilePath: "main.sh",
        starterFiles: [{path: "main.sh", content: "echo hello\n"}],
        nested: {keepThisPublicField: "visible"},
      },
    });
    expect(JSON.stringify(result)).not.toContain("adminLabFilesystemExpectations");
    expect(JSON.stringify(result)).not.toContain("hidden-evidence-must-not-leak");
  });

  it("strips private evidence from validation feedback at every nesting depth", () => {
    const result = projectStudentPracticeValidation({
      ok: false,
      code: "NOT_CORRECT",
      message: null,
      explanation: "Check the permissions and try again.",
      feedback: {
        comments: [{
          message: "Review your modes",
          adminLabFilesystemExpectations: secretContract,
        }],
        adminLabFilesystemExpectations: secretContract,
        safeMetadata: {label: "filesystem practice"},
      },
      finalized: false,
      duplicate: false,
      attempts: {used: 1, max: 5, left: 4},
      sessionComplete: false,
      requestId: "test-request",
    });
    expect(result).toMatchObject({
      ok: false,
      explanation: "Check the permissions and try again.",
      feedback: {
        comments: [{message: "Review your modes"}],
        safeMetadata: {label: "filesystem practice"},
      },
      attempts: {used: 1, max: 5, left: 4},
    });
    expect(JSON.stringify(result)).not.toContain("adminLabFilesystemExpectations");
    expect(JSON.stringify(result)).not.toContain("hidden-evidence-must-not-leak");
  });
});
