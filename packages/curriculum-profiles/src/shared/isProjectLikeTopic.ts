import type { TopicAuthoringDraft, TopicSeed } from "@zoeskoul/curriculum-contracts";

function normalizeRole(value: unknown): string {
    return String(value ?? "").trim().toLowerCase();
}

export function isProjectLikeTopic(args: {
    seed?: TopicSeed;
    draft?: TopicAuthoringDraft;
}): boolean {
    const seed = args.seed;
    const record = seed as
        | (TopicSeed & {
              topicType?: unknown;
              projectType?: unknown;
              sectionId?: unknown;
          })
        | undefined;
    const topicId = normalizeRole(seed?.topicId);
    const sectionId = normalizeRole(record?.sectionId ?? seed?.sectionSlug);
    const topicType = normalizeRole(record?.topicType);
    const projectType = normalizeRole(record?.projectType);
    const sectionRole = normalizeRole(seed?.sectionRole);
    const moduleRole = normalizeRole(seed?.moduleRole);
    const hasProjectSteps =
        Array.isArray(args.draft?.projectDraft?.stepIds) &&
        args.draft.projectDraft.stepIds.length > 0;

    return (
        topicType === "project" ||
        topicType === "module_project" ||
        topicType === "capstone" ||
        projectType === "module_project" ||
        projectType === "capstone" ||
        sectionRole === "module_project" ||
        sectionRole === "capstone" ||
        moduleRole === "capstone" ||
        Boolean(seed?.projectBrief) ||
        hasProjectSteps ||
        topicId.includes("project") ||
        topicId.includes("capstone") ||
        sectionId.includes("project") ||
        sectionId.includes("capstone")
    );
}
