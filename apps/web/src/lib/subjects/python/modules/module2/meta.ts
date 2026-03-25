import { createModuleTopicHelpers } from "@/lib/subjects/_core/topicMeta";
import {PY_SUBJECT_SLUG} from "@/lib/subjects/python/subject";

export const PY_MOD2 = "python-2" as const;
export const PY_SECTION_MOD2 = "python-2-control-flow-collections" as const;
export const PY_MOD2_PREFIX = "py2" as const;

export const { makeTopicSlug, makeTopicI18n } = createModuleTopicHelpers({
    subjectSlug: PY_SUBJECT_SLUG,
    moduleSlug: PY_MOD2,
    prefix: PY_MOD2_PREFIX,
});