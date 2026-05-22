import type { CourseBlueprint } from "@zoeskoul/curriculum-contracts";
import type { AiProvider } from "@zoeskoul/curriculum-ai";
import { validateBlueprint } from "../validate/validateBlueprint.js";
import { compileSubjectPipeline } from "./compileSubjectPipeline.js";
import {
  countPlanTopics,
  type CompileProgressCallback,
} from "./compileProgress.js";
import { resolvePlan } from "../spec/resolvePlan.js";
import { compileCourse } from "./compileCourse.js";
import { resolveSubjectPublishTarget } from "./resolveAuthoringCompileTarget.js";

export async function compileSubject(args: {
  blueprint?: CourseBlueprint;
  subjectSlug?: string;
  provider: AiProvider;
  onProgress?: CompileProgressCallback;
  resume?: boolean;
  publish?: boolean;
}){
  if (args.subjectSlug) {
    const target = await resolveSubjectPublishTarget(args.subjectSlug);
    return compileCourse({
      subjectSlug: args.subjectSlug,
      courseSlug: target.courseSlug,
      provider: args.provider,
      onProgress: args.onProgress,
      resume: args.resume,
      publish: args.publish,
    });
  }

  if (!args.blueprint) {
    throw new Error("compileSubject requires subjectSlug or blueprint");
  }

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
    resume: args.resume,
  });
}
