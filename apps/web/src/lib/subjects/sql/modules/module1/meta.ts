import { createModuleTopicHelpers } from "@/lib/subjects/_core/topicMeta";

export const SQL_SUBJECT_SLUG = "sql" as const;

export const SQL_MOD1 = "sql_module_1";
export const SQL_MOD1_PREFIX = "sql1";

export const SQL_SECTION_MOD1 = "section_1_1";
export const { makeTopicSlug, makeTopicI18n } = createModuleTopicHelpers({
    subjectSlug: SQL_SUBJECT_SLUG,
    moduleSlug: SQL_MOD1,
    prefix: SQL_MOD1_PREFIX,
});