import type { CourseBlueprint } from "@zoeskoul/curriculum-contracts";
import type { AiProvider } from "@zoeskoul/curriculum-ai";
import { validateBlueprint } from "../validate/validateBlueprint.js";
import { compileSubjectPipeline } from "./compileSubjectPipeline.js";
import {
  countPlanTopics,
  type CompileProgressCallback,
} from "./compileProgress.js";
import { resolvePlan } from "../spec/resolvePlan.js";

export async function compileSubject(args: {
  blueprint: CourseBlueprint;
  provider: AiProvider;
  onProgress?: CompileProgressCallback;
}) {
  validateBlueprint(args.blueprint);

  args.onProgress?.({
    current: 0,
    total: 0,
    stage: "resolving course structure",
  });

  const resolved = await resolvePlan({
    blueprint: args.blueprint,
    provider: args.provider,
  });

  const totalTopics = countPlanTopics(resolved.plan);

  if (resolved.source === "spec") {
    args.onProgress?.({
      current: 0,
      total: totalTopics,
      stage: "loaded course spec",
    });
  } else if (resolved.source === "saved_plan") {
    args.onProgress?.({
      current: 0,
      total: totalTopics,
      stage: "loaded saved plan",
    });
  } else {
    args.onProgress?.({
      current: 0,
      total: totalTopics,
      stage: "saved course plan",
    });
  }

  return compileSubjectPipeline({
    blueprint: args.blueprint,
    plan: resolved.plan,
    spec: resolved.spec,
    provider: args.provider,
    onProgress: args.onProgress,
  });
}