import {
  normalizeCoursePlanStructureSlugs,
  type CourseBlueprint,
  type CoursePlan,
} from "@zoeskoul/curriculum-contracts";
import type { AiProvider } from "../types.js";
import { buildPlanPrompt } from "../prompts/buildPlanPrompt.js";

export async function generateCoursePlan(
  provider: AiProvider,
  blueprint: CourseBlueprint,
): Promise<CoursePlan> {
  const prompt = buildPlanPrompt(blueprint);

  const plan = await provider.generateJson<CoursePlan>({
    system: prompt.system,
    user: prompt.user,
    schemaName: "CoursePlan",
  });

  return normalizeCoursePlanStructureSlugs(blueprint.subjectSlug, plan);
}
