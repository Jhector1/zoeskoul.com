import { defineSection } from "@/lib/subjects/_core/defineSection";
import { SQL_SECTION_MOD2 } from "@/lib/subjects/sql/modules/module2/meta";

import { INTRO_TO_FILTERING_TOPIC } from "topics/intro_to_filtering";
import { COMPARISON_OPERATORS_TOPIC } from "topics/comparison_operators";
import { FILTERING_WITH_MULTIPLE_CONDITIONS_TOPIC } from "topics/filtering_with_multiple_conditions";
import { BEGINNER_FILTERING_PRACTICE_TOPIC } from "topics/beginner_filtering_practice";

export const SQL_MODULE2_SECTION = defineSection({
    section: {
        slug: SQL_SECTION_MOD2,
        order: 1,
        title: "Module 2 — Filtering Data with WHERE",
        description:
            "Learn how to narrow results with WHERE, compare values correctly, combine conditions safely, and practice filtering with real beginner SQL queries.",
        meta: {
            module: 2,
            weeks: "Week 3–4",
            bullets: [
                "Intro to filtering",
                "Comparison operators",
                "Multiple conditions",
                "Filtering practice",
            ],
        },
    },
    topics: [
        INTRO_TO_FILTERING_TOPIC,
        COMPARISON_OPERATORS_TOPIC,
        FILTERING_WITH_MULTIPLE_CONDITIONS_TOPIC,
        BEGINNER_FILTERING_PRACTICE_TOPIC,
    ],
});