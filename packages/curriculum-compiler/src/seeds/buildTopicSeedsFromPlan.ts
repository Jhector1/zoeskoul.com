import type {
  CourseBlueprint,
  NormalizedCoursePlan,
} from "@zoeskoul/curriculum-contracts";
import { getProfileAdapter } from "@zoeskoul/curriculum-profiles";

export function buildTopicSeedsFromPlan(args: {
  blueprint: CourseBlueprint;
  validatedPlan: NormalizedCoursePlan;
}) {
  const profile = getProfileAdapter(args.blueprint.profileId);
  const out = [];

  for (const module of args.validatedPlan.modules) {
    for (const section of module.sections) {
      for (const topic of section.topics) {
        out.push(
          profile.buildTopicSeed({
            blueprint: args.blueprint,
            module: {
              slug: module.moduleSlug,
              order: module.order,
              title: module.title,
              purpose: module.purpose,
              learningObjectives: module.learningObjectives,
              guidedExercises: module.guidedExercises,
              quizFocus: module.quizFocus,
              moduleProject: module.moduleProject,
            },
            section: {
              slug: section.sectionSlug,
              order: section.order,
              title: section.title,
            },
            topic,
          })
        );
      }
    }
  }

  return out;
}
