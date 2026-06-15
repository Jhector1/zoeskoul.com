// src/lib/practice/api/validate/grade/codeInput.ts
import {
  hasTerminalEvidence,
  hasTerminalExpectations,
  isTerminalWorkspaceShellTaskExpectedLike,
  parseCodeExpected,
  prepareCodeExpectedForSchema,
} from "@zoeskoul/practice-checks";
import { type SubmitAnswer } from "../schemas";
import type { LoadedValidateInstance } from "@/lib/practice/api/validate/repositories/instance.repo";
import { gradeProgrammingCodeInput } from "./codeInput.programming";
import { gradeSqlCodeInput } from "./codeInput.sql";
import {GradeResult} from "@/lib/practice/api/validate/grade/index";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export async function gradeCodeInput(args: {
  instance: LoadedValidateInstance;
  expectedCanon: unknown;
  answer: SubmitAnswer | null;
  showDebug: boolean;
}): Promise<GradeResult> {
  const { expectedCanon, answer, showDebug } = args;

  const terminalWorkspaceShellTask =
      isTerminalWorkspaceShellTaskExpectedLike(expectedCanon);

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
  const submissionHasTerminalEvidence = hasTerminalEvidence(ans);

  if (
      terminalWorkspaceShellTask &&
      hasTerminalExpectations(expectedCanon) &&
      !submissionHasTerminalEvidence
  ) {
    return {
      ok: false,
      explanation: "Run the required terminal command(s) before checking your answer.",
      feedback: {
        area: "code",
        source: "check",
        kind: "logic",
        tone: "warning",
        title: "Terminal activity missing",
        message:
            "This Linux terminal task needs terminal command/output evidence. Run the required command in the terminal, then check again.",
      },
    };
  }

  if (!code.trim() && !hasWorkspaceSubmission && !submissionHasTerminalEvidence) {
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
    terminalEvidence: isRecord(ans.terminalEvidence)
        ? {
            commands: Array.isArray(ans.terminalEvidence.commands)
                ? ans.terminalEvidence.commands
                    .filter((entry): entry is string => typeof entry === "string")
                : [],
            outputText: String(ans.terminalEvidence.outputText ?? ""),
            cwd:
                typeof ans.terminalEvidence.cwd === "string"
                    ? ans.terminalEvidence.cwd
                    : undefined,
          }
        : undefined,
    entry: submissionEntry,
    files: submissionFiles,
    showDebug,
  });
}
