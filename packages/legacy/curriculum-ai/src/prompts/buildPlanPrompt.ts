import type { CourseBlueprint } from "@zoeskoul/curriculum-contracts";

export function buildPlanPrompt(blueprint: CourseBlueprint) {
    return {
        system: [
            "You generate curriculum structure only.",
            "Return valid JSON only.",
            "Do not include markdown fences.",
            "Do not include explanations.",
            "Keep output structural and deterministic.",
            "Do not generate learner-facing lesson copy beyond short planning fields.",
            "Do not invent unsupported course mechanics.",
        ].join(" "),
        user: JSON.stringify(
            {
                task: "Generate a course plan",
                blueprint,
                outputRequirements: {
                    moduleSlugStyle: "snake_case",
                    sectionSlugStyle: "snake_case",
                    topicIdStyle: "snake_case",
                    includePrefixPerModule: true,
                    includeSections: true,
                    includeTopics: true,
                },
            },
            null,
            2,
        ),
    };
}