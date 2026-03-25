import { PracticeKind } from "@prisma/client";

export function buildExpectedAnswerPayload(kind: PracticeKind, expectedCanon: any) {
    if (kind === PracticeKind.code_input) return null;

    if (kind === PracticeKind.single_choice) {
        const optionId =
            expectedCanon?.optionId ??
            expectedCanon?.correctOptionId ??
            expectedCanon?.correct ??
            null;

        return optionId
            ? { kind: "single_choice", optionId: String(optionId) }
            : null;
    }

    if (
        kind === PracticeKind.text_input ||
        kind === PracticeKind.word_bank_arrange ||
        kind === PracticeKind.listen_build ||
        kind === PracticeKind.fill_blank_choice
    ) {
        const value =
            typeof expectedCanon?.value === "string"
                ? expectedCanon.value
                : Array.isArray(expectedCanon?.answers) &&
                typeof expectedCanon.answers[0] === "string"
                    ? expectedCanon.answers[0]
                    : null;

        return value ? { kind: String(kind), value: String(value) } : null;
    }

    if (kind === PracticeKind.multi_choice) {
        const ids =
            expectedCanon?.optionIds ??
            expectedCanon?.correctOptionIds ??
            expectedCanon?.correct ??
            null;

        if (!Array.isArray(ids) || !ids.length) return null;

        return {
            kind: "multi_choice",
            optionIds: ids.map((x: any) => String(x)),
        };
    }

    if (kind === PracticeKind.drag_reorder) {
        const order = expectedCanon?.order ?? expectedCanon?.tokenIds ?? null;
        if (!Array.isArray(order) || !order.length) return null;

        return {
            kind: "drag_reorder",
            order: order.map((x: any) => String(x)),
        };
    }

    return null;
}