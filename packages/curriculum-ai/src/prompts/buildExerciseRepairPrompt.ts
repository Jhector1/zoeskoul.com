import type { TopicSeed } from "@zoeskoul/curriculum-contracts";

export function buildExerciseRepairPrompt(args: {
    seed: TopicSeed;
    exercise: Record<string, unknown>;
}) {
    return {
        system: [
            "You repair exactly one invalid exercise object.",
            "Return exactly one exercise JSON object.",
            "Do not return a TopicAuthoringDraft.",
            "Do not return an array.",
            "Do not wrap in markdown.",
            "",
            "The returned object must preserve the same exercise kind.",
            "",
            "Rules:",
            "- If kind is single_choice, return id, kind, title, prompt, options, correctOptionIds, hint, help.",
            "- For single_choice, options must be an array of at least 2 plain strings.",
            "- For single_choice, correctOptionIds must contain exactly one valid option id using a, b, c, d matching option positions.",
            "",
            "- If kind is multi_choice, return id, kind, title, prompt, options, correctOptionIds, hint, help.",
            "- For multi_choice, options must be an array of at least 2 plain strings.",
            "- For multi_choice, correctOptionIds must contain one or more valid option ids using a, b, c, d matching option positions.",
            "",
            "- If kind is fill_blank_choice, return id, kind, title, prompt, template, choices, correctValue, hint, help.",
            "- If kind is code_input, return id, kind, title, prompt, starterCode, solutionCode, tests, hint, help.",
            "- For non-SQL code_input, tests must be an array with one or more { stdin?, stdout, match? } cases.",
            "- For non-SQL code_input, solutionCode must be a complete runnable program that matches those tests.",
            "",
            "help must contain concept, hint_1, hint_2.",
            "Do not remove id/title/prompt/hint/help unless they are missing; repair them if missing.",
            "Options must be plain strings, not objects.",
            "Do not reveal the final answer inside hint/help.",
        ].join("\n"),
        user: JSON.stringify(
            {
                seed: args.seed,
                exercise: args.exercise,
            },
            null,
            2,
        ),
    };
}
