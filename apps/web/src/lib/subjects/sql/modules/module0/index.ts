import { defineModule } from "@/lib/subjects/_core/defineModule";
import {SQL_GEN_KEY, SQL_SUBJECT_SLUG} from "../../subject";
import { SQL_MODULE0_SECTION } from "./section";
import { SQL_MOD0, SQL_MOD0_PREFIX } from "./meta";

export const SQL_MODULE0 = defineModule({
    module: {
        slug: SQL_MOD0,
        subjectSlug: SQL_SUBJECT_SLUG,
        order: 0,
        title: "Module 0 — Intro to SQL",
        description: "Understand SQL, databases, and how organized data is stored in tables.",
        weekStart: 1,
        weekEnd: 1,
        accessOverride: "free",
        meta: {
            estimatedMinutes: 45,
            prereqs: [],
            outcomes: [
                "Explain what SQL stands for",
                "Describe what a database is",
                "Distinguish a database from a table",
                "Recognize rows, columns, and records",
                "Explain why SQL is useful in real systems",
            ],
            why: [
                "Builds the mental model before writing queries",
                "Makes SELECT, FROM, WHERE, and later joins feel more natural",
            ],
        },
    },
    prefix: SQL_MOD0_PREFIX,
    genKey: SQL_GEN_KEY,
    sections: [SQL_MODULE0_SECTION],
});