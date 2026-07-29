import {
    PseudocodeExpectedSchema,
    validatePseudocodeSubmission,
} from "@zoeskoul/practice-checks";
import type { LoadedValidateInstance } from "@/lib/practice/api/validate/repositories/instance.repo";
import type { SubmitAnswer } from "../schemas";
import type { GradeResult } from ".";

export function gradePseudocodeInput(args: {
    instance: LoadedValidateInstance;
    expectedCanon: unknown;
    answer: SubmitAnswer | null;
}): GradeResult {
    const parsed = PseudocodeExpectedSchema.safeParse(args.expectedCanon);
    if (!parsed.success) {
        return {
            ok: false,
            explanation: "Server bug: invalid pseudocode validation contract.",
        };
    }

    const value = args.answer?.kind === "pseudocode_input"
        ? args.answer.value
        : "";
    const result = validatePseudocodeSubmission({
        answer: value,
        expected: parsed.data,
    });

    if (result.ok) {
        return { ok: true, explanation: "Correct. Your pseudocode satisfies the required structure and trace rules." };
    }

    return {
        ok: false,
        explanation: result.failures.map((failure) => `• ${failure.message}`).join("\n"),
    };
}
