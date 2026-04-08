import { createModuleTopicHelpers } from "@/lib/subjects/_core/topicMeta";

export const SQL_SUBJECT_SLUG = "sql" as const;

export const SQL_MOD3 = "sql_module_3";
export const SQL_MOD3_PREFIX = "sql3";

export const SQL_SECTION_MOD3 = "section_3_1";

export const { makeTopicSlug, makeTopicI18n } = createModuleTopicHelpers({
    subjectSlug: SQL_SUBJECT_SLUG,
    moduleSlug: SQL_MOD3,
    prefix: SQL_MOD3_PREFIX,
});