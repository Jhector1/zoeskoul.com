import type { TopicSeed } from "@zoeskoul/curriculum-contracts";
import { renderExerciseKindPromptRules } from "./exerciseKindPromptRules.js";

export function buildExerciseRepairPrompt(args: {
    seed: TopicSeed;
    exercise: Record<string, unknown>;
}) {
    const exerciseKindRules = renderExerciseKindPromptRules({
        mode: "repair",
        seed: args.seed,
    });

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
            ...exerciseKindRules,
            "",
            "Return the same top-level shape the exercise kind requires.",
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
