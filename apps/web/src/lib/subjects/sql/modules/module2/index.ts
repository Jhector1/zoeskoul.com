import { defineModule } from "@/lib/subjects/_core/defineModule";
import {SQL_GEN_KEY, SQL_SUBJECT_SLUG} from "../../subject";
import {SQL_MODULE2_SECTION} from "./section";
import { SQL_MOD2, SQL_MOD2_PREFIX } from "./meta";

export const SQL_MODULE2 = defineModule({
    module: {
        slug: SQL_MOD2,
        subjectSlug: SQL_SUBJECT_SLUG,
        order: 2,
        title: "Module 2 — Filtering Data with WHERE",
        description:
            "Learn how to narrow results with WHERE, compare values correctly, and combine conditions with confidence.",
        weekStart: 3,
        weekEnd: 4,
        accessOverride: "free",
        meta: {
            estimatedMinutes: 60,
            prereqs: ["Module 1 — Your First Queries with SELECT"],
            outcomes: [
                "Use WHERE to keep only the rows needed",
                "Compare text and numeric values with SQL operators",
                "Choose the right comparison operator for a filtering task",
                "Combine conditions with AND, OR, and NOT",
                "Use parentheses to make complex filtering logic clear",
            ],
            why: [
                "Filtering is how SQL answers specific questions instead of showing everything",
                "Strong WHERE skills make later querying, reporting, and analysis much easier",
            ],
        },
    },
    prefix: SQL_MOD2_PREFIX,
    genKey: SQL_GEN_KEY,
    sections: [SQL_MODULE2_SECTION,


    ],
});