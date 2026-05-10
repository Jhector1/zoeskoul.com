import type { TopicAuthoringDraft } from "@zoeskoul/curriculum-contracts";
import { RetryableTopicValidationError } from "./RetryableTopicValidationError.js";

const GENERIC_HELP_PATTERNS = [
    /Focus on the (main )?concept/i,
    /not on copying final solution text/i,
    /Build the solution from the behavior/i,
    /Choose the option that matches the core idea/i,
    /Think about the role or idea being tested/i,
    /eliminate choices that describe something different/i,
];

export function validateGenericExerciseHelp(args: {
    draft: TopicAuthoringDraft;
    location: string;
}) {
    const failures: string[] = [];

    for (const exercise of args.draft.quizDraft ?? []) {
        const texts = [
            exercise.hint,
            exercise.help?.concept,
            exercise.help?.hint_1,
            exercise.help?.hint_2,
        ].filter(Boolean);

        for (const text of texts) {
            for (const pattern of GENERIC_HELP_PATTERNS) {
                if (pattern.test(String(text))) {
                    failures.push(
                        `${exercise.id}: generic help text matched ${pattern}: ${JSON.stringify(String(text))}`,
                    );
                }
            }
        }
    }

    if (failures.length > 0) {
        throw new RetryableTopicValidationError({
            code: "GENERIC_EXERCISE_HELP",
            message: [
                `Generic exercise help detected at ${args.location}`,
                "",
                ...failures.map((x) => `- ${x}`),
                "",
                "Regenerate this topic. Hints must be specific to the exercise, syntax, input, output, or concept.",
            ].join("\n"),
            details: { failures },
        });
    }
}
