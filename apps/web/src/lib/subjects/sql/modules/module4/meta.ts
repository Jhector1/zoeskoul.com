import { createModuleTopicHelpers } from "@/lib/subjects/_core/topicMeta";

export const SQL_SUBJECT_SLUG = "sql" as const;

export const SQL_MOD4 = "sql_module_4";
export const SQL_MOD4_PREFIX = "sql4";

export const SQL_SECTION_MOD4 = "section_4_1";

export const { makeTopicSlug, makeTopicI18n } = createModuleTopicHelpers({
    subjectSlug: SQL_SUBJECT_SLUG,
    moduleSlug: SQL_MOD4,
    prefix: SQL_MOD4_PREFIX,
});