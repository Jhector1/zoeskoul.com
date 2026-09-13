export const START_LEARNING_HREF = "/subjects";

export type LearningEntry = {
  kind: "continue" | "start";
  href: string;
};

function routeSegment(value: string) {
  return encodeURIComponent(value.trim());
}

export function buildModuleLearningHref(input: {
  subjectSlug: string;
  moduleSlug: string;
}) {
  return (
    `/subjects/${routeSegment(input.subjectSlug)}` +
    `/modules/${routeSegment(input.moduleSlug)}/learn`
  );
}

export function createStartLearningEntry(): LearningEntry {
  return {
    kind: "start",
    href: START_LEARNING_HREF,
  };
}

export function createContinueLearningEntry(input: {
  subjectSlug: string;
  moduleSlug: string;
}): LearningEntry {
  return {
    kind: "continue",
    href: buildModuleLearningHref(input),
  };
}

export function parseLearningEntry(value: unknown): LearningEntry | null {
  if (!value || typeof value !== "object") return null;

  const candidate = value as Partial<LearningEntry>;
  if (
    (candidate.kind !== "continue" && candidate.kind !== "start") ||
    typeof candidate.href !== "string" ||
    !candidate.href.startsWith("/") ||
    candidate.href.startsWith("//")
  ) {
    return null;
  }

  return {
    kind: candidate.kind,
    href: candidate.href,
  };
}
