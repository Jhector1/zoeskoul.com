import type { NormalizedCoursePlan } from "@zoeskoul/curriculum-contracts";
import {
  COURSE_STRUCTURE_NAMING_RULES,
  FINAL_CAPSTONE_STRUCTURE_RULES,
} from "./buildPlanPrompt.js";

export function buildPlanRepairPrompt(args: {
  plan: NormalizedCoursePlan;
  errors: string[];
}) {
  return {
    system: "Repair the normalized plan and return valid JSON only.",
    user: JSON.stringify({
      ...args,
      rules: [
        "Preserve the user's intended course structure while fixing validation errors.",
        ...COURSE_STRUCTURE_NAMING_RULES,
        ...FINAL_CAPSTONE_STRUCTURE_RULES,
      ],
    }),
  };
}
