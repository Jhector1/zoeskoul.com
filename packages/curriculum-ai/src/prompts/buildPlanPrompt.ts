import type { CourseBlueprint } from "@zoeskoul/curriculum-contracts";

export function buildPlanPrompt(blueprint: CourseBlueprint) {
    return {
        system: "You generate curriculum structure only. Return valid JSON only.",
        user: JSON.stringify({
            task: "Generate a course plan",
            blueprint,
            rules: [
                "Do not generate learner copy beyond short planning fields.",
                "Keep output structural and deterministic.",
                "Do not invent unsupported course mechanics.",
            ],
        }),
    };
}