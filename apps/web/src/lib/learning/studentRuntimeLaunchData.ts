import type {
  LearningLessonContentResponse,
  LearningRuntimeLaunchResponse,
  LearningRuntimeTarget,
} from "@zoeskoul/learning-contracts";

function sameRuntimeTarget(
  left: LearningRuntimeTarget,
  right: LearningRuntimeTarget,
): boolean {
  return (
    left.version === right.version &&
    left.sectionSlug === right.sectionSlug &&
    left.topicSlug === right.topicSlug &&
    left.ownerCardId === right.ownerCardId &&
    left.targetKind === right.targetKind &&
    left.targetId === right.targetId &&
    left.runtimeKind === right.runtimeKind
  );
}

function cleanParam(
  params: URLSearchParams,
  key: string,
): string {
  return params.get(key)?.trim() ?? "";
}

export function parseStudentRuntimeTarget(
  params: URLSearchParams,
): LearningRuntimeTarget | null {
  const version = Number(
    cleanParam(params, "version") || "1",
  );
  const sectionSlug = cleanParam(
    params,
    "sectionSlug",
  );
  const topicSlug = cleanParam(
    params,
    "topicSlug",
  );
  const ownerCardId = cleanParam(
    params,
    "ownerCardId",
  );
  const targetKind = cleanParam(
    params,
    "targetKind",
  );
  const targetId = cleanParam(
    params,
    "targetId",
  );
  const runtimeKind = cleanParam(
    params,
    "runtimeKind",
  );

  if (
    version !== 1 ||
    !sectionSlug ||
    !topicSlug ||
    !ownerCardId ||
    !targetId ||
    (
      targetKind !== "card" &&
      targetKind !== "embedded_try_it"
    ) ||
    (
      runtimeKind !== "sketch" &&
      runtimeKind !== "quiz" &&
      runtimeKind !== "project" &&
      runtimeKind !== "try_it"
    )
  ) {
    return null;
  }

  if (
    targetKind === "embedded_try_it" &&
    runtimeKind !== "try_it"
  ) {
    return null;
  }

  if (
    targetKind === "card" &&
    runtimeKind === "try_it"
  ) {
    return null;
  }

  return {
    version: 1,
    sectionSlug,
    topicSlug,
    ownerCardId,
    targetKind,
    targetId,
    runtimeKind,
  };
}

export function buildStudentRuntimeLaunch(args: {
  lesson: LearningLessonContentResponse;
  target: LearningRuntimeTarget;
  locale: string;
  subjectSlug: string;
  moduleSlug: string;
}): LearningRuntimeLaunchResponse | null {
  for (const section of args.lesson.sections) {
    if (
      section.slug !== args.target.sectionSlug
    ) {
      continue;
    }

    for (const topic of section.topics) {
      if (
        topic.slug !== args.target.topicSlug
      ) {
        continue;
      }

      for (const card of topic.cards) {
        const runtimes:
          Array<
            LearningRuntimeTarget |
            null |
            undefined
          > =
          card.type === "runtime"
            ? [
                card.runtime,
                card.embeddedRuntime,
              ]
            : card.type === "text"
              ? [card.runtime]
              : [];

        const runtime =
          runtimes.find(
            (candidate) =>
              Boolean(
                candidate &&
                sameRuntimeTarget(
                  candidate,
                  args.target,
                ),
              ),
          ) ?? null;

        if (!runtime) {
          continue;
        }

        return {
          target: runtime,
          title: card.title,
          activity: {
            kind: "legacy_handoff",
            href:
              `/${encodeURIComponent(args.locale)}` +
              `/subjects/${encodeURIComponent(args.subjectSlug)}` +
              `/modules/${encodeURIComponent(args.moduleSlug)}` +
              "/learn",
            reason: "runtime_not_migrated",
          },
        };
      }
    }
  }

  return null;
}
