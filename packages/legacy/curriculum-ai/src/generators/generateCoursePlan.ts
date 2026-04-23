import type { CourseBlueprint, CoursePlan } from "@zoeskoul/curriculum-contracts";
import type { AiProvider } from "../types.js";
import { buildPlanPrompt } from "../prompts/buildPlanPrompt.js";

export async function generateCoursePlan(
    provider: AiProvider,
    blueprint: CourseBlueprint,
): Promise<CoursePlan> {
    const prompt = buildPlanPrompt(blueprint);

    return provider.generateJson<CoursePlan>({
        system: prompt.system,
        user: prompt.user,
        schemaName: "CoursePlan",
    });
}