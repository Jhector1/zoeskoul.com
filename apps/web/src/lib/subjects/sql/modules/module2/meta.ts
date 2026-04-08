import { createModuleTopicHelpers } from "@/lib/subjects/_core/topicMeta";

export const SQL_SUBJECT_SLUG = "sql" as const;

export const SQL_MOD2 = "sql_module_2";
export const SQL_MOD2_PREFIX = "sql2";

export const SQL_SECTION_MOD2 = "section_2_1";
export const { makeTopicSlug, makeTopicI18n } = createModuleTopicHelpers({
    subjectSlug: SQL_SUBJECT_SLUG,
    moduleSlug: SQL_MOD2,
    prefix: SQL_MOD2_PREFIX,
});