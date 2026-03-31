import {GradeResult} from "@/lib/practice/api/validate/grade/index";
import {SubmitAnswer} from "@/lib/practice/types";

export function gradeMultiChoice(args: {
  expectedCanon: any;
  answer: SubmitAnswer | null;
}): GradeResult {
  const correct = Array.isArray(args.expectedCanon.optionIds)
      ? args.expectedCanon.optionIds.map(String)
      : [];

  const norm = (arr: string[]) => [...new Set(arr)].sort();
  const A = norm(
      Array.isArray((args.answer as any)?.optionIds)
          ? (args.answer as any).optionIds.map(String)
          : [],
  );
  const B = norm(correct);

  return {
    ok: A.join("|") === B.join("|"),
    explanation:
        A.join("|") === B.join("|")
            ? "Correct."
            : "Not quite — check which properties apply.",
  };
}