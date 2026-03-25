import { createModuleTopicHelpers } from "@/lib/subjects/_core/topicMeta";
import {PY_SUBJECT_SLUG} from "@/lib/subjects/python/subject";

export const PY_MOD0 = "python-0" as const;
export const PY_SECTION_MOD0 = "python-0-foundations" as const;
export const PY_MOD0_PREFIX = "py0" as const;

export const { makeTopicSlug, makeTopicI18n } = createModuleTopicHelpers({
    subjectSlug: PY_SUBJECT_SLUG,
    moduleSlug: PY_MOD0,
    prefix: PY_MOD0_PREFIX,
});