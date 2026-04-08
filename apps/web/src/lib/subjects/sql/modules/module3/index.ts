import { defineModule } from "@/lib/subjects/_core/defineModule";
import {SQL_GEN_KEY, SQL_SUBJECT_SLUG} from "../../subject";
import { SQL_MODULE3_SECTION } from "./section";
import { SQL_MOD3, SQL_MOD3_PREFIX } from "./meta";

export const SQL_MODULE3 = defineModule({
    module: {
        slug: SQL_MOD3,
        subjectSlug: SQL_SUBJECT_SLUG,
        order: 3,
        title: "Module 3 — Sorting and Limiting Results",
        description:
            "Learn how to sort rows meaningfully, use LIMIT to focus results, and combine sorting with limiting to answer ranking questions.",
        weekStart: 5,
        weekEnd: 6,
        accessOverride: "free",
        meta: {
            estimatedMinutes: 60,
            prereqs: ["Module 2 — Filtering Data with WHERE"],
            outcomes: [
                "Sort result sets in meaningful ways",
                "Use ORDER BY with ascending and descending order",
                "Sort by more than one column to handle ties clearly",
                "Use LIMIT to keep only the most relevant rows",
                "Combine ORDER BY and LIMIT to answer ranking questions",
            ],
            why: [
                "Sorting makes SQL results easier to read, compare, and explain",
                "LIMIT helps focus on the rows that matter most in reports and analysis",
            ],
        },
    },
    prefix: SQL_MOD3_PREFIX,
    genKey: SQL_GEN_KEY,
    sections: [
        SQL_MODULE3_SECTION,
    ],
});