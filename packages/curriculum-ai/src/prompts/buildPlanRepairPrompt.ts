import type { NormalizedCoursePlan } from "@zoeskoul/curriculum-contracts";

export function buildPlanRepairPrompt(args: {
  plan: NormalizedCoursePlan;
  errors: string[];
}) {
  return {
    system: "Repair the normalized plan and return valid JSON only.",
    user: JSON.stringify(args),
  };
}
