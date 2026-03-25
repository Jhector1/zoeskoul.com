import type { GradeResult } from ".";
import {LoadedValidateInstance} from "@/lib/practice/api/validate/repositories/instance.repo";import type { SubmitAnswer } from "../schemas";

function normSentence(s: string) {
    // whitespace + punctuation spacing normalization (matches your joinNice behavior)
    return String(s ?? "")
        .trim()
        .replace(/\s+/g, " ")
        .replace(/\s+([.,!?;:])/g, "$1")
        .replace(/\s+'/g, "'")
        .replace(/[’‘]/g, "'")
        .toLowerCase();
}

function pickExpected(expectedCanon: any): string | null {
    return typeof expectedCanon?.value === "string"
        ? expectedCanon.value
        : typeof expectedCanon?.targetText === "string"
            ? expectedCanon.targetText
            : Array.isArray(expectedCanon?.answers) && typeof expectedCanon.answers[0] === "string"
                ? expectedCanon.answers[0]
                : null;
}

export function gradeSentenceBuild(args: {
    instance: LoadedValidateInstance; // instance.kind is "word_bank_arrange" | "listen_build"
    expectedCanon: any;
    answer: SubmitAnswer | null;
    isReveal: boolean;
}): GradeResult {
    const expected = pickExpected(args.expectedCanon);

    if (args.isReveal) {
        return {
            ok: false,
            revealAnswer: {
                kind: args.instance.kind,
                value: expected ?? "",
                answers: Array.isArray(args.expectedCanon?.answers)
                    ? args.expectedCanon.answers
                    : expected
                        ? [expected]
                        : [],
            },
            explanation: "Solution shown.",
        };
    }

    const value = String((args.answer as any)?.value ?? "").trim();
    if (!value) {
        return { ok: false, revealAnswer: null, explanation: "Missing value." };
    }

    // If you didn’t provide expected, we accept “recorded”
    if (!expected) {
        return { ok: true, revealAnswer: null, explanation: "Answer recorded." };
    }

    const ok = normSentence(value) === normSentence(expected);

    return {
        ok,
        revealAnswer: null,
        explanation: ok ? "Correct." : "Not correct.",
    };
}