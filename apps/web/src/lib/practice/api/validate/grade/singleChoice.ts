// src/lib/practice/validate/grade/singleChoice.ts
import type { GradeResult } from ".";
import {LoadedValidateInstance} from "@/lib/practice/api/validate/repositories/instance.repo";import type { SubmitAnswer } from "../schemas";

export function gradeSingleChoice(args: {
  expectedCanon: any;
  answer: SubmitAnswer | null;
}): GradeResult {
  const correct = String(args.expectedCanon.optionId ?? "");
  const chosen = String((args.answer as any)?.optionId ?? "");
  const ok = chosen === correct;

  return {
    ok,
    explanation: ok ? "Correct choice." : "Not quite — review the concept.",
  };
}
