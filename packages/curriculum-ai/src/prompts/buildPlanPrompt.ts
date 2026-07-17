import type { CourseBlueprint } from "@zoeskoul/curriculum-contracts";

export const COURSE_STRUCTURE_NAMING_RULES = [
  "Use normalized readable slugs for every future generated course.",
  "moduleSlug format: <subjectSlug>-module-<number>-<short-topic-area>, for example linux-module-1-terminal-navigation.",
  "sectionSlug format: <subjectSlug>-module-<number>-<short-section-role>, for example linux-module-1-orientation or linux-module-1-project.",
  "prefix format: <subject_slug_with_underscores>_module_<number>, for example linux_module_1.",
  "Do not use shorthand prefixes such as lin1, py1, sql1, js1, or bash1.",
  "Do not use bare module slugs such as linux-1, python-1, sql-1, or module-1.",
  "Do not duplicate the course slug inside module or section slugs, for example avoid linux-terminal-fundamentals-linux-1-orientation.",
  "Keep topicId short and content-based, for example what-the-terminal-is, moving-around, or notes-organizer-project.",
] as const;

export const FINAL_CAPSTONE_STRUCTURE_RULES = [
  "Give every non-capstone module role standard and every ordinary teaching section role lesson.",
  "Every course plan must end with exactly one module whose role is capstone.",
  "The final capstone module must contain exactly one section whose role is capstone.",
  "The final capstone section must contain exactly one final capstone topic.",
  "Set projectBrief to null on every non-capstone topic.",
  "The final capstone topic must define a complete projectBrief, including projectBrief.stepCountTarget as a positive integer chosen in authoring.",
  "When projectBrief.stepLadder is provided, it must contain exactly stepCountTarget ordered steps numbered from 1.",
  "Do not add capstone planning, readiness, review, or extra lesson sections inside the final capstone module.",
] as const;

export function buildPlanPrompt(blueprint: CourseBlueprint) {
  return {
    system: "You generate curriculum structure only. Return valid JSON only.",
    user: JSON.stringify({
      task: "Generate a course plan",
      blueprint,
      rules: [
        "Do not generate learner copy beyond short planning fields.",
        "Keep output structural and deterministic.",
        "Do not invent unsupported course mechanics.",
        ...COURSE_STRUCTURE_NAMING_RULES,
        ...FINAL_CAPSTONE_STRUCTURE_RULES,
      ],
    }),
  };
}
