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

      explanation: "Solution shown.",
    };
  }

  const transcript = String((args.answer as any)?.transcript ?? "").trim();
  if (!transcript) {
    return { ok: false,  explanation: "Missing transcript." };
  }

  if (!expected) {
    return { ok: true,  explanation: "Answer recorded." };
  }

  const ok = norm(transcript) === norm(expected);

  return {
    ok,
    
    explanation: ok ? "Correct." : "Not correct.",
  };
}
