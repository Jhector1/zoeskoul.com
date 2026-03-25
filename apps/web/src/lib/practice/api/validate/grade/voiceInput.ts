import type { GradeResult } from ".";
import {LoadedValidateInstance} from "@/lib/practice/api/validate/repositories/instance.repo";import type { SubmitAnswer } from "../schemas";

function norm(s: string) {
  return String(s ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export function gradeVoiceInput(args: {
  instance: LoadedValidateInstance;
  expectedCanon: any;
  answer: SubmitAnswer | null;
  isReveal: boolean;
}): GradeResult {
  const expected =
    typeof args.expectedCanon.transcript === "string"
      ? args.expectedCanon.transcript
      : typeof args.expectedCanon.value === "string"
        ? args.expectedCanon.value
        : Array.isArray(args.expectedCanon.answers) && typeof args.expectedCanon.answers[0] === "string"
          ? args.expectedCanon.answers[0]
          : null;

  if (args.isReveal) {
    return {
      ok: false,
      revealAnswer: {
        kind: "voice_input",
        transcript: expected ?? "",
        answers: Array.isArray(args.expectedCanon.answers) ? args.expectedCanon.answers : expected ? [expected] : [],
      },
      explanation: "Solution shown.",
    };
  }

  const transcript = String((args.answer as any)?.transcript ?? "").trim();
  if (!transcript) {
    return { ok: false, revealAnswer: null, explanation: "Missing transcript." };
  }

  if (!expected) {
    return { ok: true, revealAnswer: null, explanation: "Answer recorded." };
  }

  const ok = norm(transcript) === norm(expected);

  return {
    ok,
    revealAnswer: null,
    explanation: ok ? "Correct." : "Not correct.",
  };
}
