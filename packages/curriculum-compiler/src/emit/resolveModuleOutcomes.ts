import type { CoursePlan } from "@zoeskoul/curriculum-contracts";

function cleanText(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
}

export function resolveModuleOutcomes(
    module: Pick<CoursePlan["modules"][number], "learningObjectives">,
): string[] {
    return Array.from(
        new Set((module.learningObjectives ?? []).map(cleanText).filter(Boolean)),
    ).slice(0, 5);
}
