// src/lib/practice/api/validate/grade/codeInput.ts
import { runCode } from "@/lib/code/runCode";
// import {LoadedValidateInstance} from "@/lib/practice/api/validate/repositories/instance.repo";import type { SubmitAnswer } from "../schemas";
import {CodeExpectedSchema, SubmitAnswer} from "../schemas";
import {LoadedValidateInstance} from "@/lib/practice/api/validate/repositories/instance.repo";

type GradeResult = {
  ok: boolean;
  explanation: string;
  revealAnswer: any | null;
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

function pickRunError(run: any) {
  return (
      String(run?.error ?? "").trim() ||
      String(run?.message ?? "").trim() ||
      String(run?.compile_output ?? "").trim() ||
      String(run?.stderr ?? "").trim() ||
      "Run failed."
  );
}

export async function gradeCodeInput(args: {
  instance: LoadedValidateInstance;
  expectedCanon: any;
  answer: SubmitAnswer | null;
  isReveal: boolean;
  showDebug: boolean;
}): Promise<GradeResult> {
  const { expectedCanon, answer, isReveal, showDebug } = args;

  // ✅ Parse/normalize expectedCanon into { tests[] } (supports legacy stdin/stdout too)
  const parsed = CodeExpectedSchema.safeParse(expectedCanon);
  if (!parsed.success) {
    return {
      ok: false,
      revealAnswer: null,
      explanation: "Server bug: invalid code_input expected payload.",
    };
  }
  const expected = parsed.data; // transformed output: { kind, language, tests, solutionCode }

  // ✅ Reveal: do NOT grade, only show solution (if any)
  if (isReveal) {
    return {
      ok: false,
      revealAnswer: {
        kind: "code_input",
        language: expected.language ?? "python",
        solutionCode: expected.solutionCode ?? "",
      },
      explanation: "Solution shown.",
    };
  }

  const ans: any = answer ?? {};
  const code = String(ans.code ?? ans.source ?? "").trimEnd();
  if (!code.trim()) {
    return { ok: false, revealAnswer: null, explanation: "Missing code." };
  }

  const language = String(ans.language ?? expected.language ?? "python");

  const tests = Array.isArray(expected.tests) ? expected.tests : [];
  if (!tests.length) {
    return { ok: false, revealAnswer: null, explanation: "Server bug: missing tests." };
  }

  const MAX_TESTS = 12;
  const trimmed = tests.slice(0, MAX_TESTS);

  let firstFail: any = null;

  for (let i = 0; i < trimmed.length; i++) {
    const tc = trimmed[i];

    // ✅ IMPORTANT: ignore user stdin; use test stdin only
    const run = await runCode({
      language: language as any,
      code,
      stdin: tc.stdin ?? "",
      limits: DEFAULT_LIMITS,
    } as any);

    if (!run?.ok) {
      firstFail ??= {
        idx: i,
        why: pickRunError(run),
        stdout: run?.stdout ?? "",
        stderr: run?.stderr ?? "",
        compile: run?.compile_output ?? "",
      };
      if (!showDebug) break;
      continue;
    }

    const pass = matches(run.stdout ?? "", tc.stdout ?? "", tc.match ?? "exact");
    if (!pass) {
      firstFail ??= {
        idx: i,
        why: "Output did not match.",
        stdout: run.stdout ?? "",
        stderr: run.stderr ?? "",
        compile: run.compile_output ?? "",
        want: tc.stdout ?? "",
      };
      if (!showDebug) break;
    }
  }

  if (!firstFail) {
    return { ok: true, revealAnswer: null, explanation: "Correct." };
  }

  // ✅ No debug: do not leak expected output
  if (!showDebug) {
    return { ok: false, revealAnswer: null, explanation: "Some tests failed." };
  }

  // ✅ Debug allowed: show details
  const parts: string[] = [];
  parts.push(`Test #${firstFail.idx + 1} failed.`);
  parts.push(firstFail.why);

  if (String(firstFail.compile ?? "").trim())
    parts.push(`Compile:\n${String(firstFail.compile).slice(0, 1200)}`);
  if (String(firstFail.stderr ?? "").trim())
    parts.push(`Stderr:\n${String(firstFail.stderr).slice(0, 1200)}`);
  if (String(firstFail.stdout ?? "").trim())
    parts.push(`Stdout:\n${String(firstFail.stdout).slice(0, 1200)}`);
  if (String(firstFail.want ?? "").trim())
    parts.push(`Expected:\n${String(firstFail.want).slice(0, 1200)}`);

  return { ok: false, revealAnswer: null, explanation: parts.join("\n\n") };
}