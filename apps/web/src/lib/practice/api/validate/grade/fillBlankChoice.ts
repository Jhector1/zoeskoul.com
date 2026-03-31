import type { GradeResult } from ".";
// import {LoadedValidateInstance} from "@/lib/practice/api/validate/repositories/instance.repo";import type { SubmitAnswer } from "../schemas";
import {LoadedValidateInstance} from "@/lib/practice/api/validate/repositories/instance.repo";
import {SubmitAnswer} from "@/lib/practice/types";

function normChoice(s: string) {
    return String(s ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

function pickExpected(expectedCanon: any): string | null {
    return typeof expectedCanon?.correct === "string"
        ? expectedCanon.correct
        : typeof expectedCanon?.value === "string"
            ? expectedCanon.value
            : Array.isArray(expectedCanon?.answers) && typeof expectedCanon.answers[0] === "string"
                ? expectedCanon.answers[0]
                : null;
}

export function gradeFillBlankChoice(args: {
    instance: LoadedValidateInstance; // kind "fill_blank_choice"
    expectedCanon: any;
    answer: SubmitAnswer | null;
    isReveal: boolean;
}): GradeResult {
    const expected = pickExpected(args.expectedCanon);

    if (args.isReveal) {
        return {
            ok: false,
  
            explanation: "Solution shown.",
        };
    }

    const value = String((args.answer as any)?.value ?? "").trim();
    if (!value) {
        return { ok: false,  explanation: "Missing value." };
    }

    if (!expected) {
        return { ok: true,  explanation: "Answer recorded." };
    }

    const ok = normChoice(value) === normChoice(expected);

    return {
        ok,
        
        explanation: ok ? "Correct." : "Not correct.",
    };
}