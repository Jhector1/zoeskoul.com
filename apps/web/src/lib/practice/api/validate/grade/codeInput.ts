// src/lib/practice/api/validate/grade/codeInput.ts
import { parseCodeExpected, prepareCodeExpectedForSchema } from "@zoeskoul/practice-checks";
import { type SubmitAnswer } from "../schemas";
import type { LoadedValidateInstance } from "@/lib/practice/api/validate/repositories/instance.repo";
import { gradeProgrammingCodeInput } from "./codeInput.programming";
import { gradeSqlCodeInput } from "./codeInput.sql";
import {GradeResult} from "@/lib/practice/api/validate/grade/index";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasWorkspaceExpectations(value: unknown) {
  if (!isRecord(value)) return false;

  const expectations = value.workspaceExpectations;

  if (!isRecord(expectations)) return false;

  return (
      Array.isArray(expectations.requiredFiles) ||
      Array.isArray(expectations.requiredFolders) ||
      Array.isArray(expectations.forbiddenFiles)
  );
}

function hasBlankShellTaskTest(value: unknown) {
  if (!isRecord(value)) return false;

  const tests = value.tests;

  if (!Array.isArray(tests)) return true;
  if (tests.length === 0) return true;

  return tests.every((test) => {
    if (!isRecord(test)) return false;

    const stdout = String(test.stdout ?? "");
    const match = String(test.match ?? "includes");

    return stdout === "" && match === "includes";
  });
}

function isTerminalWorkspaceShellTask(expectedCanon: unknown): boolean {
  if (!isRecord(expectedCanon)) {
    return false;
  }

  const raw = expectedCanon;

  const recipeType =
      typeof raw.recipeType === "string"
          ? raw.recipeType
          : isRecord(raw.recipe) && typeof raw.recipe.type === "string"
              ? raw.recipe.type
              : "";

  const shellTaskMode =
      typeof raw.shellTaskMode === "string"
          ? raw.shellTaskMode
          : isRecord(raw.recipe) && typeof raw.recipe.mode === "string"
              ? raw.recipe.mode
              : "";

  if (recipeType === "shell_task" && shellTaskMode === "terminal_workspace") {
    return true;
  }

  // Backward-compatible fallback for already-created instances whose
  // recipeType/shellTaskMode metadata was stripped by expected normalization.
  return (
      String(raw.language ?? "") === "bash" &&
      hasWorkspaceExpectations(raw) &&
      hasBlankShellTaskTest(raw)
  );
}

export async function gradeCodeInput(args: {
  instance: LoadedValidateInstance;
  expectedCanon: unknown;
  answer: SubmitAnswer | null;
  showDebug: boolean;
}): Promise<GradeResult> {
  const { expectedCanon, answer, showDebug } = args;

  const terminalWorkspaceShellTask =
      isTerminalWorkspaceShellTask(expectedCanon);

  const expected = terminalWorkspaceShellTask
      ? {
        ...(isRecord(expectedCanon) ? expectedCanon : {}),
        kind: "code_input",
        strategy: "programming",
        language: "bash",
        checkMode: "stdout",
        recipeType: "shell_task",
        shellTaskMode: "terminal_workspace",
      }
      : (() => {
        const { expectedForSchema, sourceChecks } =
            prepareCodeExpectedForSchema(expectedCanon);

        const parsed = parseCodeExpected(expectedForSchema);

        if (!parsed.success) {
          return {
            __parseFailed: true,
            __parseError: parsed.error.format(),
          };
        }

        return {
          ...(parsed.data as any),
          ...(sourceChecks.length ? { sourceChecks } : {}),
        };
      })();

  if ((expected as any).__parseFailed) {
    return {
      ok: false,
      explanation: "Server bug: invalid code_input expected payload.",
      feedback: {
        area: "code",
        source: "check",
        kind: "runtime",
        tone: "danger",
        title: "Validation setup error",
        message:
            "This exercise has an invalid validation contract. Fix the authored expected payload.",
        raw: showDebug
            ? JSON.stringify((expected as any).__parseError, null, 2)
            : null,
      },
    };
  }
  const ans: any = answer ?? {};
  const code = String(ans.code ?? ans.source ?? "").trimEnd();
  const submissionFiles = Array.isArray(ans.files)
      ? ans.files
          .filter((file: any) => {
            if (!file || typeof file.path !== "string") return false;
            if (file.kind === "directory") return true;
            return typeof file.content === "string";
          })
          .map((file: any) =>
              file.kind === "directory"
                  ? {
                      kind: "directory" as const,
                      path: file.path,
                    }
                  : {
                      kind: "file" as const,
                      path: file.path,
                      content: file.content,
                    },
          )
      : undefined;
  const submissionEntry =
      typeof ans.entry === "string" && ans.entry.trim().length > 0
          ? ans.entry.trim()
          : undefined;
  const hasWorkspaceSubmission =
      Boolean(submissionEntry) && Boolean(submissionFiles?.length);

  if (!code.trim() && !hasWorkspaceSubmission) {
    return {
      ok: false,
      explanation: "You have not written any code yet.",
      feedback: {
        area: "code",
        source: "check",
        kind: "logic",
        tone: "warning",
        title: "No code yet",
        message: "Write some code before checking the answer.",
      },
    };
  }

  if (expected.strategy === "sql") {
    return gradeSqlCodeInput({
      expected,
      code,
      showDebug,
    });
  }

  const language = String(ans.language ?? expected.language ?? "python");

  return gradeProgrammingCodeInput({
    expected,
    terminalWorkspaceShellTask,
    code,
    language,
    entry: submissionEntry,
    files: submissionFiles,
    showDebug,
  });
}
