import type { GradeResult } from ".";
import { scorePhraseMatch } from "@zoeskoul/practice-checks";
import {LoadedValidateInstance} from "@/lib/practice/api/validate/repositories/instance.repo";import type { SubmitAnswer } from "../schemas";

export function gradeVoiceInput(args: {
  instance: LoadedValidateInstance;
  expectedCanon: any;
  answer: SubmitAnswer | null;
  isReveal: boolean;
}): GradeResult {
  const expected =
    typeof args.expectedCanon?.targetText === "string"
      ? args.expectedCanon.targetText
      : typeof args.expectedCanon?.transcript === "string"
        ? args.expectedCanon.transcript
        : typeof args.expectedCanon?.value === "string"
          ? args.expectedCanon.value
          : Array.isArray(args.expectedCanon?.answers) &&
              typeof args.expectedCanon.answers[0] === "string"
            ? args.expectedCanon.answers[0]
            : null;

  if (args.isReveal) {
    return {
      ok: false,

      explanation: "Solution shown.",
    };
  }

  const transcript = String((args.answer as any)?.transcript ?? "").trim();
  if (!transcript) {
    return { ok: false,  explanation: "Missing transcript." };
  }

  if (!expected) {
    return {
      ok: false,
      explanation: "Server bug: missing voice_input expected phrase.",
    };
  }

  const match = scorePhraseMatch({
    transcript,
    targetText: expected,
    locale:
      typeof args.expectedCanon?.locale === "string"
        ? args.expectedCanon.locale
        : undefined,
  });

  return {
    ok: match.ok,

    explanation: match.ok ? "Correct." : "Not correct.",
  };
}
