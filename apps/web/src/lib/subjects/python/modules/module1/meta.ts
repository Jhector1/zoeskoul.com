import { createModuleTopicHelpers } from "@/lib/subjects/_core/topicMeta";

export const PY_SUBJECT_SLUG = "python" as const;
export const PY_MOD1 = "python-1" as const;
export const PY_SECTION_MOD1 = "python-1-core-building-blocks" as const;
export const PY_MOD1_PREFIX = "py1" as const;

export const { makeTopicSlug, makeTopicI18n } = createModuleTopicHelpers({
    subjectSlug: PY_SUBJECT_SLUG,
    moduleSlug: PY_MOD1,
    prefix: PY_MOD1_PREFIX,
});