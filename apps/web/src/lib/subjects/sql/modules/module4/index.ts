import { defineModule } from "@/lib/subjects/_core/defineModule";
import {SQL_GEN_KEY, SQL_SUBJECT_SLUG} from "../../subject";
import { SQL_MODULE4_SECTION } from "./section";
import { SQL_MOD4, SQL_MOD4_PREFIX } from "./meta";

export const SQL_MODULE4 = defineModule({
    module: {
        slug: SQL_MOD4,
        subjectSlug: SQL_SUBJECT_SLUG,
        order: 4,
        title: "Module 4 — Working with Text, Lists, Ranges, and NULL",
        description:
            "Learn how to search partial text, filter with lists and ranges, and handle missing values safely in real-world SQL queries.",
        weekStart: 7,
        weekEnd: 8,
        accessOverride: "free",
        meta: {
            estimatedMinutes: 60,
            prereqs: [
                "Module 3 — Sorting and Limiting Results",
            ],
            outcomes: [
                "Match partial text with LIKE patterns",
                "Use % and _ wildcards correctly",
                "Filter values with IN and NOT IN",
                "Filter ranges with BETWEEN",
                "Handle missing data with IS NULL and IS NOT NULL",
            ],
            why: [
                "Real datasets often contain inconsistent text, grouped choices, and missing values",
                "These filtering tools make SQL much more useful for realistic search and cleanup tasks",
            ],
        },
    },
    prefix: SQL_MOD4_PREFIX,
    genKey: SQL_GEN_KEY,
    sections: [
        SQL_MODULE4_SECTION,
    ],
});