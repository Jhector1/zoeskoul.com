import { defineSection } from "@/lib/subjects/_core/defineSection";
// import { WHAT_SQL_IS_TOPIC } from "./topics/what_sql_is";
import { SQL_SECTION_MOD0 } from "./meta";
import {UNDERSTANDING_TABLES_TOPIC} from "@/lib/subjects/sql/modules/module0/topics/understanding_tables";
import {DATABASE_THINKING_TOPIC} from "@/lib/subjects/sql/modules/module0/topics/database_thinking";
import {FIRST_SQL_ENVIRONMENT_TOPIC} from "@/lib/subjects/sql/modules/module0/topics/first_sql_environment";
import {WHAT_SQL_IS_TOPIC} from "@/lib/subjects/sql/modules/module0/topics/what_sql_is";

export const SQL_MODULE0_SECTION = defineSection({
    section: {
        slug: SQL_SECTION_MOD0,
        order: 1,
        title: "Module 0 — Introduction to SQL",
        description: "A beginner introduction to SQL, databases, tables, rows, and columns.",
        meta: {
            module: 0,
            weeks: "Week 1",
            bullets: [
                "What SQL means",
                "What a database is",
                "How tables, rows, and columns work",
                "Why SQL is useful in real systems",
            ],
        },
    },
    topics: [
        WHAT_SQL_IS_TOPIC,
        UNDERSTANDING_TABLES_TOPIC,
        DATABASE_THINKING_TOPIC,
        FIRST_SQL_ENVIRONMENT_TOPIC
    ],
});