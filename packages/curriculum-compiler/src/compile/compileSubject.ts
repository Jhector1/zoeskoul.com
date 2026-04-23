import type { CourseBlueprint } from "@zoeskoul/curriculum-contracts";
import type { AiProvider } from "@zoeskoul/curriculum-ai";
import { generateCoursePlan } from "@zoeskoul/curriculum-ai";
import { validateBlueprint } from "../validate/validateBlueprint.js";
import { validatePlan } from "../validate/validatePlan.js";
import { compileSubjectPipeline } from "./compileSubjectPipeline.js";
import { loadSavedPlan } from "../planning/loadSavedPlan.js";
import { savePlan } from "../planning/savePlan.js";
import {
  countPlanTopics,
  type CompileProgressCallback,
} from "./compileProgress.js";

export async function compileSubject(args: {
  blueprint: CourseBlueprint;
  provider: AiProvider;
  onProgress?: CompileProgressCallback;
}) {
  validateBlueprint(args.blueprint);

  args.onProgress?.({
    current: 0,
    total: 0,
    stage: "loading saved plan",
  });

  let plan = await loadSavedPlan(args.blueprint.subjectSlug);

  if (!plan) {
    args.onProgress?.({
      current: 0,
      total: 0,
      stage: "generating course plan",
    });

    plan = await generateCoursePlan(args.provider, args.blueprint);
    validatePlan(plan);
    await savePlan(args.blueprint.subjectSlug, plan);

    args.onProgress?.({
      current: 0,
      total: countPlanTopics(plan),
      stage: "saved course plan",
    });
  } else {
    validatePlan(plan);

    args.onProgress?.({
      current: 0,
      total: countPlanTopics(plan),
      stage: "loaded saved plan",
    });
  }

  return compileSubjectPipeline({
    blueprint: args.blueprint,
    plan,
    provider: args.provider,
    onProgress: args.onProgress,
  });
}