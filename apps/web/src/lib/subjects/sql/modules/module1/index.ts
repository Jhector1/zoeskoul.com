import { defineModule } from "@/lib/subjects/_core/defineModule";
import {SQL_GEN_KEY, SQL_SUBJECT_SLUG} from "../../subject";
import { SQL_MODULE1_SECTION } from "./section";
import { SQL_MOD1, SQL_MOD1_PREFIX } from "./meta";

export const SQL_MODULE1 = defineModule({
    module: {
        slug: SQL_MOD1,
        subjectSlug: SQL_SUBJECT_SLUG,
        order: 1,
        title: "Module 1 — Your First Queries with SELECT",
        description:
            "Learn to retrieve data confidently with SELECT and FROM before filtering, sorting, or joining tables.",
        weekStart: 2,
        weekEnd: 2,
        accessOverride: "free",
        meta: {
            estimatedMinutes: 45,
            prereqs: ["Module 0 — Intro to SQL"]
        ,
            outcomes: [
                "Write valid SELECT statements against a single table",
                "Choose between selecting all columns and selecting only needed columns",
                "Read result sets without confusion",
                "Recognize the basic SELECT ... FROM ... query structure",
                "Build confidence exploring a table with simple queries",
            ],
            why: [
                "Builds the core habit of asking the database for data",
                "Makes WHERE, ORDER BY, and later joins much easier to understand",
            ],
        },
    },
    prefix: SQL_MOD1_PREFIX,
    genKey: SQL_GEN_KEY,
    sections: [SQL_MODULE1_SECTION],
});