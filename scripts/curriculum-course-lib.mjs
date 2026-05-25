function uniqueArgs(args) {
  return args.filter(Boolean);
}

export function buildDraftSubjectSlug(subjectSlug, courseSlug) {
  return `${subjectSlug}--${courseSlug}--draft`;
}

export function buildCheckCliPlan(args) {
  return [
    ["validate-subject", args.subjectSlug],
    ["validate-course", args.subjectSlug, args.courseSlug],
    [
      "compile-course",
      args.subjectSlug,
      args.courseSlug,
      "--draft-only",
      ...(args.liveSubjectSlug ? ["--live-subject", args.liveSubjectSlug] : []),
      ...(args.resume ? ["--resume"] : []),
      ...(args.forceLiveOverwrite ? ["--force-live-overwrite"] : []),
    ],
    ["validate-subject", args.subjectSlug],
    ...(args.hasCourseBlueprint
        ? [["critique-subject-draft", args.courseBlueprintPath]]
        : []),
  ];
}

export function buildPublishCliPlan(args) {
  return [
    ["validate-subject", args.subjectSlug],
    ["validate-course", args.subjectSlug, args.courseSlug],
    [
      "publish-course",
      args.subjectSlug,
      args.courseSlug,
      ...(args.liveSubjectSlug ? ["--live-subject", args.liveSubjectSlug] : []),
      ...(args.force ? ["--force"] : []),
      ...(args.forceLiveOverwrite ? ["--force-live-overwrite"] : []),
    ],
  ];
}

export function assertCourseScopedPublishPlan(plan, args) {
  const flattened = plan.map((step) => step.join(" ")).join("\n");

  if (flattened.includes(`publish-subject ${args.subjectSlug}`)) {
    throw new Error(
        `Unsafe course publish plan: requested ${args.subjectSlug}/${args.courseSlug}, but plan uses publish-subject.`,
    );
  }

  if (!flattened.includes(`publish-course ${args.subjectSlug} ${args.courseSlug}`)) {
    throw new Error(
        `Unsafe course publish plan: requested ${args.subjectSlug}/${args.courseSlug}, but plan does not publish that course.`,
    );
  }
}
