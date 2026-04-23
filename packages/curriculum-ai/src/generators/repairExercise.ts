import type { TopicSeed } from "@zoeskoul/curriculum-contracts";
import type { AiProvider } from "../types.js";
import { buildExerciseRepairPrompt } from "../prompts/buildExerciseRepairPrompt.js";

export async function repairExercise(
    provider: AiProvider,
    args: {
        seed: TopicSeed;
        exercise: Record<string, unknown>;
    },
): Promise<Record<string, unknown>> {
    const prompt = buildExerciseRepairPrompt(args);

    const repaired = await provider.generateJson<Record<string, unknown>>({
        system: prompt.system,
        user: prompt.user,
        schemaName: "TopicAuthoringDraft",
    });

    return repaired;
}