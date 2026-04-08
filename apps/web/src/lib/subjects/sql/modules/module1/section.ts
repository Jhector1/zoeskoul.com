import { defineSection } from "@/lib/subjects/_core/defineSection";
import {SQL_SECTION_MOD1} from "@/lib/subjects/sql/modules/module1/meta";
import {INTRO_TO_SELECT_TOPIC} from "@/lib/subjects/sql/modules/module1/topics/intro_to_select";
import {PRACTICE_WITH_BASIC_QUERIES_TOPIC} from "@/lib/subjects/sql/modules/module1/topics/practice_with_basic_queries";
import {READING_DATA_FROM_A_TABLE_TOPIC} from "@/lib/subjects/sql/modules/module1/topics/reading_data_from_a_table";
import {SQL_SYNTAX_BASICS_TOPIC} from "@/lib/subjects/sql/modules/module1/topics/sql_syntax_basics";
// import {INTRO_TO_SELECT_TOPIC} from "@/lib/subjects/sql/modules/module1/topics/intro_to_select";
// import {
//     PRACTICE_WITH_BASIC_QUERIES_TOPIC
// } from "topics/practice_with_basic_queries";
// import {READING_DATA_FROM_A_TABLE_TOPIC} from "@/lib/subjects/sql/modules/module1/topics/reading_data_from_a_table";
// import {SQL_SYNTAX_BASICS_TOPIC} from "topics/sql_syntax_basics";

export const SQL_MODULE1_SECTION = defineSection({
    section: {
        slug: SQL_SECTION_MOD1,
        order: 1,
        title: "Section 1.1 — Intro to SELECT",
        description:
            "Learn what SELECT does, how to show all columns or just the ones you need, and how to read simple result tables with confidence.",
        meta: {
            module: 1,
            weeks: "Week 2",
            bullets: [
                "What SELECT does",
                "Selecting all columns with *",
                "Selecting specific columns",
                "Query structure basics",
            ],
        },
    },
    topics: [
        INTRO_TO_SELECT_TOPIC,
        READING_DATA_FROM_A_TABLE_TOPIC,
        SQL_SYNTAX_BASICS_TOPIC,
        PRACTICE_WITH_BASIC_QUERIES_TOPIC,


        // WHAT_SELECT_DOES_TOPIC,
        // SELECT_ALL_COLUMNS_TOPIC,
        // SELECT_SPECIFIC_COLUMNS_TOPIC,
        // QUERY_STRUCTURE_BASICS_TOPIC,
    ],
});