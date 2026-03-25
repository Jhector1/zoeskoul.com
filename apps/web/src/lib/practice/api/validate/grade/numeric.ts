// src/lib/practice/validate/grade/numeric.ts
import type { GradeResult } from ".";
import {LoadedValidateInstance} from "@/lib/practice/api/validate/repositories/instance.repo";import type { SubmitAnswer } from "../schemas";
import { closeEnough } from "../utils/math";

export function gradeNumeric(args: {
  instance: LoadedValidateInstance;
  expectedCanon: any;
  answer: SubmitAnswer | null;
  isReveal: boolean;
}): GradeResult {
  const expValue = Number(args.expectedCanon.value);
  const tol = Number(args.expectedCanon.tolerance ?? 0);

  if (!Number.isFinite(expValue)) {
    return {
      ok: false,
      revealAnswer: null,
      explanation: "Server bug: invalid expected numeric value.",
    };
  }

  if (args.isReveal) {
    return {
      ok: false,
      revealAnswer: { kind: "numeric", value: expValue, latex: String(expValue) },
      explanation: "Solution shown.",
    };
  }

  const received = (args.answer as any)?.value;
  const receivedOk = Number.isFinite(received);

  const ok = receivedOk && closeEnough(Number(received), expValue, tol);

  return {
    ok,
    revealAnswer: null,
    explanation: ok ? "Correct." : `Expected ${expValue}${tol ? ` ± ${tol}` : ""}.`,
  };
}
