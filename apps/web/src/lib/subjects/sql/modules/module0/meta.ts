import { createModuleTopicHelpers } from "@/lib/subjects/_core/topicMeta";

export const SQL_SUBJECT_SLUG = "sql" as const;
export const SQL_MOD0 = "sql_module_0" as const;
export const SQL_SECTION_MOD0 = "section_0_1" as const;
export const SQL_MOD0_PREFIX = "sql0" as const;

export const { makeTopicSlug, makeTopicI18n } = createModuleTopicHelpers({
    subjectSlug: SQL_SUBJECT_SLUG,
    moduleSlug: SQL_MOD0,
    prefix: SQL_MOD0_PREFIX,
});