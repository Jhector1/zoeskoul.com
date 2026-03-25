// src/lib/practice/validate/grade/multiChoice.ts
import type { GradeResult } from ".";
import {LoadedValidateInstance} from "@/lib/practice/api/validate/repositories/instance.repo";import type { SubmitAnswer } from "../schemas";

export function gradeMultiChoice(args: {
  instance: LoadedValidateInstance;
  expectedCanon: any;
  answer: SubmitAnswer | null;
  isReveal: boolean;
}): GradeResult {
  const correct = Array.isArray(args.expectedCanon.optionIds)
    ? args.expectedCanon.optionIds.map(String)
    : [];

  const norm = (arr: string[]) => [...new Set(arr)].sort();
  const B = norm(correct);

  if (args.isReveal) {
    return {
      ok: false,
      revealAnswer: { kind: "multi_choice", optionIds: B },
      explanation: "Solution shown.",
    };
  }

  const chosen = Array.isArray((args.answer as any)?.optionIds)
    ? (args.answer as any).optionIds.map(String)
    : [];

  const A = norm(chosen);
  const ok = A.join("|") === B.join("|");

  return {
    ok,
    revealAnswer: null,
    explanation: ok ? "Correct." : "Not quite — check which properties apply.",
  };
}
