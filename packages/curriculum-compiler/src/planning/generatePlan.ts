import type { CourseBlueprint, CoursePlan } from "@zoeskoul/curriculum-contracts";
import type { AiProvider } from "@zoeskoul/curriculum-ai";
import { generateCoursePlan } from "@zoeskoul/curriculum-ai";

export async function generatePlan(args: {
    blueprint: CourseBlueprint;
    provider: AiProvider;
}): Promise<CoursePlan> {
    return generateCoursePlan(args.provider, args.blueprint);
}