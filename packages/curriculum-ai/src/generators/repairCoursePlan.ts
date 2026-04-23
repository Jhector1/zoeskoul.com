import type { NormalizedCoursePlan } from "@zoeskoul/curriculum-contracts";
import type { AiProvider, PlanRepairDraft } from "../types.js";
import { buildPlanRepairPrompt } from "../prompts/buildPlanRepairPrompt.js";

export async function repairCoursePlan(
  provider: AiProvider,
  args: {
    plan: NormalizedCoursePlan;
    errors: string[];
  },
): Promise<PlanRepairDraft> {
  const prompt = buildPlanRepairPrompt(args);

  return provider.generateJson<PlanRepairDraft>({
    system: prompt.system,
    user: prompt.user,
    schemaName: "NormalizedPlanRepair",
  });
}
