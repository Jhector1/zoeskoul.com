import type { TopicAuthoringDraft } from "@zoeskoul/curriculum-contracts";
import { RetryableTopicValidationError } from "./RetryableTopicValidationError.js";

const DUMMY_FILL_BLANK_PATTERNS = [
    /^The first missing value is \[blank1\]\.?$/i,
    /^The missing value is \[blank1\]\.?$/i,
    /^Choose the best value for the first missing blank in the statement\.?$/i,
    /^Choose the best value for the missing blank in the statement\.?$/i,
];

function isDummyFillBlankText(value: unknown) {
    const text = String(value ?? "").trim();

    return DUMMY_FILL_BLANK_PATTERNS.some((pattern) => pattern.test(text));
}

export function validateNoDummyFillBlankQuestions(args: {
    draft: TopicAuthoringDraft;
    location: string;
}) {
    const failures: string[] = [];

    for (const exercise of args.draft.quizDraft ?? []) {
        if (exercise.kind !== "fill_blank_choice") continue;

        if (isDummyFillBlankText(exercise.prompt)) {
            failures.push(
                `${exercise.id}: prompt is a generic/dummy fill_blank_choice prompt.`,
            );
        }

        if (isDummyFillBlankText(exercise.template)) {
            failures.push(
                `${exercise.id}: template is a generic/dummy fill_blank_choice template.`,
            );
        }
    }

    if (failures.length > 0) {
        throw new RetryableTopicValidationError({
            code: "DUMMY_FILL_BLANK_QUESTION",
            message: [
                `Dummy fill_blank_choice question detected at ${args.location}`,
                "",
                ...failures.map((failure) => `- ${failure}`),
                "",
                "Regenerate this topic. Fill-blank questions must contain meaningful learner-facing context.",
                "Do not use templates like `The first missing value is [blank1].`",
            ].join("\n"),
            details: { failures },
        });
    }
}