// src/lib/practice/api/validate/grade/codeInput.ts
import { parseCodeExpected, prepareCodeExpectedForSchema } from "@zoeskoul/practice-checks";
import { type SubmitAnswer } from "../schemas";
import type { LoadedValidateInstance } from "@/lib/practice/api/validate/repositories/instance.repo";
import { gradeProgrammingCodeInput } from "./codeInput.programming";
import { gradeSqlCodeInput } from "./codeInput.sql";
import {GradeResult} from "@/lib/practice/api/validate/grade/index";


export async function gradeCodeInput(args: {
  instance: LoadedValidateInstance;
  expectedCanon: unknown;
  answer: SubmitAnswer | null;
  showDebug: boolean;
}): Promise<GradeResult> {
  const { expectedCanon, answer, showDebug } = args;

  const { expectedForSchema, sourceChecks } = prepareCodeExpectedForSchema(expectedCanon);
  const parsed = parseCodeExpected(expectedForSchema);
  if (!parsed.success) {
    return {
      ok: false,
      explanation: "Server bug: invalid code_input expected payload.",
      feedback: {
        area: "code",
        source: "check",
        kind: "runtime",
        tone: "danger",
        title: "Validation setup error",
        message: "This exercise has an invalid validation contract. Fix the authored expected payload.",
        raw: showDebug ? JSON.stringify(parsed.error.format(), null, 2) : null,
      },
    };
  }

  const expected = {
    ...(parsed.data as any),
    ...(sourceChecks.length ? { sourceChecks } : {}),
  };
  const ans: any = answer ?? {};
  const code = String(ans.code ?? ans.source ?? "").trimEnd();
  const submissionFiles = Array.isArray(ans.files)
      ? ans.files
          .filter((file: any) => file && typeof file.path === "string" && typeof file.content === "string")
          .map((file: any) => ({
              path: file.path,
              content: file.content,
          }))
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
    code,
    language,
    entry: submissionEntry,
    files: submissionFiles,
    showDebug,
  });
}
