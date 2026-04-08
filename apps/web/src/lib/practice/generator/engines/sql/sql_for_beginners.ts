// import type { TopicContext } from "../../generatorTypes";
// import type { SubjectModuleGenerator } from "@/lib/practice/generator/engines/utils";
// import { makeNoGenerator, parseTopicSlug } from "@/lib/practice/generator/engines/utils";
//
// import { makeGenSqlStatementsPart1Mod0 } from "@/lib/practice/generator/engines/sql/sql_for_beginners_mod0/handlers";
// import { makeGenSqlStatementsPart1Mod1 } from "@/lib/practice/generator/engines/sql/sql_for_beginners_mod1/handlers";
// import { makeGenSqlStatementsPart1Mod2 } from "@/lib/practice/generator/engines/sql/sql_for_beginners_mod2/handlers";
// import { makeGenSqlStatementsPart1Mod3 } from "@/lib/practice/generator/engines/sql/sql_for_beginners_mod3/handlers";
// import {SQL_GEN_KEY} from "@/lib/subjects/sql/subject";
// import {makeGenSqlStatementsPart1Mod4} from "@/lib/practice/generator/engines/sql/sql_for_beginners_mod4/handlers";
//
// const MOD0_BASE = new Set<string>([
//     "what_sql_is",
//     "database_thinking",
//     "understanding_tables",
//     "first_sql_environment",
// ]);
//
// const MOD1_BASE = new Set<string>([
//     "intro_to_select",
//     "reading_data_from_a_table",
//     "sql_syntax_basics",
//     "practice_with_basic_queries",
// ]);
//
// const MOD2_BASE = new Set<string>([
//     "intro_to_filtering",
//     "comparison_operators",
//     "filtering_with_multiple_conditions",
//     "beginner_filtering_practice",
// ]);
//
// const MOD3_BASE = new Set<string>([
//     "sorting_data",
//     "sorting_by_multiple_columns",
//     "limiting_output",
//     "practice_with_output_control",
// ]);
//
// const MOD0_PREFIX = "sql0";
// const MOD1_PREFIX = "sql1";
// const MOD2_PREFIX = "sql2";
// const MOD3_PREFIX = "sql3";
// const MOD4_PREFIX = "sql4";
//
// export function makeGenSqlStatementsSqlForBeginners(
//     ctx: TopicContext,
// ): SubjectModuleGenerator {
//     const { raw, base, prefix } = parseTopicSlug(String(ctx.topicSlug ?? ""));
//
//     // Preferred route: module prefix
//     if (prefix === MOD0_PREFIX) return makeGenSqlStatementsPart1Mod0(ctx);
//     if (prefix === MOD1_PREFIX) return makeGenSqlStatementsPart1Mod1(ctx);
//     if (prefix === MOD2_PREFIX) return makeGenSqlStatementsPart1Mod2(ctx);
//     if (prefix === MOD3_PREFIX) return makeGenSqlStatementsPart1Mod3(ctx);
//     if (prefix === MOD4_PREFIX) return makeGenSqlStatementsPart1Mod4(ctx);
//     // Fallback route: base slug
//     if (MOD0_BASE.has(base)) return makeGenSqlStatementsPart1Mod0(ctx);
//     if (MOD1_BASE.has(base)) return makeGenSqlStatementsPart1Mod1(ctx);
//     if (MOD2_BASE.has(base)) return makeGenSqlStatementsPart1Mod2(ctx);
//     if (MOD3_BASE.has(base)) return makeGenSqlStatementsPart1Mod3(ctx);
//
//     return makeNoGenerator(SQL_GEN_KEY, raw);
// }

// src/lib/practice/generator/engines/sql/sql_for_beginners.ts
import type { TopicContext } from "../../generatorTypes";
import type { SubjectModuleGenerator } from "@/lib/practice/generator/engines/utils";

import subjectManifest from "@/lib/subjects/sql/subject.manifest.json";
import { TOPIC_MANIFESTS } from "@/lib/subjects/sql/topics.generated";
import { makeSubjectGeneratorFromManifest } from "@/lib/practice/generator/engines/json/makeSubjectGeneratorFromManifest";

export function makeGenSqlStatementsSqlForBeginners(
    ctx: TopicContext,
): SubjectModuleGenerator {
    return makeSubjectGeneratorFromManifest({
        manifest: subjectManifest,
        topicManifests: TOPIC_MANIFESTS,
        ctx,
    });
}