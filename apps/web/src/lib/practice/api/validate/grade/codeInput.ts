// src/lib/practice/api/validate/grade/codeInput.ts
import { CodeExpectedSchema, type SubmitAnswer } from "../schemas";
import type { LoadedValidateInstance } from "@/lib/practice/api/validate/repositories/instance.repo";
import { gradeProgrammingCodeInput } from "./codeInput.programming";
import { gradeSqlCodeInput } from "./codeInput.sql";

type GradeResult = {
  ok: boolean;
  explanation: string;
  feedback?: any;
};

export async function gradeCodeInput(args: {
  instance: LoadedValidateInstance;
  expectedCanon: unknown;
  answer: SubmitAnswer | null;
  showDebug: boolean;
}): Promise<GradeResult> {
  const { expectedCanon, answer, showDebug } = args;

  const parsed = CodeExpectedSchema.safeParse(expectedCanon);
  if (!parsed.success) {
    return {
      ok: false,
      explanation: "Server bug: invalid code_input expected payload.",
      feedback: null,
    };
  }

  const expected = parsed.data;
  const ans: any = answer ?? {};
  const code = String(ans.code ?? ans.source ?? "").trimEnd();

  if (!code.trim()) {
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
    showDebug,
  });
}