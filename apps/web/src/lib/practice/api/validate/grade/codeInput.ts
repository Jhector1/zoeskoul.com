import { runCode } from "@/lib/code/runCode";
import { CodeExpectedSchema, type SubmitAnswer } from "../schemas";
import type { LoadedValidateInstance } from "@/lib/practice/api/validate/repositories/instance.repo";

import type { CodeFeedback } from "@/lib/code/feedback/types";
import {classifyCodeOutputMismatch, classifyCodeRunFailure} from "@/lib/code/feedback/classify";

type GradeResult = {
  ok: boolean;
  explanation: string;
  feedback?: CodeFeedback | null;
};

const DEFAULT_LIMITS = {
  cpu_time_limit: 2,
  wall_time_limit: 6,
  memory_limit: 256000,
} as const;

function normOut(s: string) {
  return String(s ?? "")
      .replace(/\r\n/g, "\n")
      .replace(/[ \t]+\n/g, "\n")
      .trimEnd();
}

function matches(got: string, want: string, mode: "exact" | "includes" = "exact") {
  const G = normOut(got);
  const W = normOut(want);
  return mode === "includes" ? G.includes(W.trim()) : G === W;
}

export async function gradeCodeInput(args: {
  instance: LoadedValidateInstance;
  expectedCanon: any;
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

  const language = String(ans.language ?? expected.language ?? "python");
  const tests = Array.isArray(expected.tests) ? expected.tests : [];

  if (!tests.length) {
    return {
      ok: false,
      explanation: "Server bug: missing tests.",
      feedback: null,
    };
  }

  const MAX_TESTS = 12;
  const trimmed = tests.slice(0, MAX_TESTS);

  for (let i = 0; i < trimmed.length; i++) {
    const tc = trimmed[i];

    const run = await runCode({
      language: language as any,
      code,
      stdin: tc.stdin ?? "",
      limits: DEFAULT_LIMITS,
    } as any);

    if (!run?.ok) {
      const feedback = classifyCodeRunFailure(language, run, "check");

      return {
        ok: false,
        explanation: feedback.message,
        feedback: showDebug
            ? feedback
            : {
              ...feedback,
              raw: null,
            },
      };
    }

    const pass = matches(run.stdout ?? "", tc.stdout ?? "", tc.match ?? "exact");
    if (!pass) {
      const feedback = classifyCodeOutputMismatch({
        got: run.stdout ?? "",
        want: tc.stdout ?? "",
        language,
        code,
        source: "check",
      });

      return {
        ok: false,
        explanation: feedback.message,
        feedback,
      };
    }
  }

  return {
    ok: true,
    explanation: "Correct.",
    feedback: null,
  };
}